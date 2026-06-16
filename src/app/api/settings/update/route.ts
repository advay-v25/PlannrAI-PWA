import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { ProfilePreferences } from '@/lib/types/settings';
import { z } from 'zod';
import { validateWithZod } from '@/lib/security/zod-validator';

// Fields that should trigger schedule regeneration when changed
const SCHEDULE_AFFECTING_FIELDS = [
    'sleep_start', 'sleep_end', 'wake_time', 'scheduling_strategy',
    'focus_hours_start', 'focus_hours_end', 'meal_times',
    'work_start', 'work_end'
];

const TimeStringSchema = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Invalid time format (HH:MM required)"
});

const MealWindowSchema = z.object({
    start: TimeStringSchema,
    end: TimeStringSchema
});

const PreferencesUpdateSchema = z.object({
    sleep_start: TimeStringSchema.optional(),
    wake_time: TimeStringSchema.optional(),
    wind_down_min: z.number().min(0).max(180).optional(),
    morning_routine_min: z.number().min(0).max(120).optional(),
    meals_per_day: z.union([z.literal(2), z.literal(3)]).optional(),
    meal_windows: z.object({
        breakfast: MealWindowSchema.optional(),
        lunch: MealWindowSchema.optional(),
        dinner: MealWindowSchema.optional()
    }).optional(),
    buffer_min: z.union([z.literal(5), z.literal(10), z.literal(15)]).optional(),
    allow_weekend_work: z.boolean().optional(),
    weekend_intensity: z.enum(['off', 'light', 'normal']).optional(),
    preferred_windows: z.object({
        mind: z.array(z.string()).optional(),
        body: z.array(z.string()).optional(),
        craft: z.array(z.string()).optional()
    }).optional(),
    pillar_spacing_preference: z.enum(['alternate', 'cluster_ok']).optional(),
    max_daily_load_min: z.number().min(0).max(1440).optional(),
    proactive_level: z.enum(['off', 'low', 'standard']).optional(),
    ask_before_changes: z.boolean().optional(),
    max_ai_options: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    low_energy_mode: z.boolean().optional(),
    overwhelm_mode: z.boolean().optional(),
    weekly_review_enabled: z.boolean().optional(),
    calendar_integration_enabled: z.boolean().optional(),
    notifications_enabled: z.boolean().optional(),
    notification_times: z.array(z.string()).optional(),
    diet_type: z.enum(['veg', 'vegan', 'eggetarian', 'other']).optional(),
    allergies: z.array(z.string()).optional(),
    workout_preference: z.enum(['gym', 'sports', 'walk', 'mixed']).optional(),
    workout_min_per_day: z.number().min(0).max(180).optional(),
    is_workout_protected: z.boolean().optional(),
    default_morning_stack_id: z.string().uuid().nullable().optional(),
    default_night_stack_id: z.string().uuid().nullable().optional(),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        // 1. Check for schedule reset action first
        if (body && typeof body === 'object' && 'reset_schedule' in body && (body as any).reset_schedule === true) {
            const today = new Date().toISOString().split('T')[0];
            
            // Delete all future non-anchor schedule blocks to keep past history for analytics
            const { error: deleteError } = await supabase
                .from('schedule_blocks')
                .delete()
                .eq('user_id', userId)
                .is('commitment_id', null)
                .neq('block_type', 'anchor')
                .gte('date', today);

            if (deleteError) {
                console.error("[Settings Reset] Failed to clear schedule:", deleteError.message);
                return apiError('Failed to clear schedule', 500);
            }

            // Flag needs_rescheduling in profiles table bio_data
            const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', userId).single();
            const bioData = (profile?.bio_data as any) || {};

            await supabase
                .from('profiles')
                .update({
                    bio_data: {
                        ...bioData,
                        needs_rescheduling: true,
                        pending_goal_update: 'your cleared calendar'
                    }
                })
                .eq('id', userId);

            console.log(`[Settings] Cleared schedule and flagged needs_rescheduling for user ${userId}`);
            return apiSuccess({ success: true, message: 'Schedule cleared' });
        }

        // 2. Validate Settings Update Payload
        const validation = validateWithZod(PreferencesUpdateSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const patch = validation.data;

        // Remove protected fields (handled by Zod but double-checking)
        delete (patch as any).user_id;
        delete (patch as any).updated_at;

        // Check if any schedule-affecting fields are being changed
        const affectsSchedule = Object.keys(patch).some(key => SCHEDULE_AFFECTING_FIELDS.includes(key));

        // 3. Update Preferences
        const { data: updated, error } = await supabase
            .from('profile_preferences')
            .update(patch)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error("Settings update failed", error);
            return apiError('Failed to update settings', 500);
        }

        // 4. If schedule-affecting fields changed, flag for rescheduling and sync sleep blocks
        if (affectsSchedule) {
            try {
                // Instantly update future sleep blocks so the calendar reflects it immediately
                const today = new Date().toISOString().split('T')[0];
                if (patch.wake_time) {
                    await supabase
                        .from('schedule_blocks')
                        .update({ end_time: patch.wake_time })
                        .eq('user_id', userId)
                        .eq('block_type', 'sleep')
                        .eq('start_time', '00:00')
                        .gte('date', today);
                }
                if (patch.sleep_start) {
                    await supabase
                        .from('schedule_blocks')
                        .update({ start_time: patch.sleep_start })
                        .eq('user_id', userId)
                        .eq('block_type', 'sleep')
                        .eq('end_time', '23:59')
                        .gte('date', today);
                }

                // Sync wake/sleep times and set needs_rescheduling inside bio_data JSONB field
                const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', userId).single();
                const bioData = (profile?.bio_data as any) || {};

                const profileUpdate: any = {
                    bio_data: {
                        ...bioData,
                        needs_rescheduling: true,
                        pending_goal_update: 'your updated constraints'
                    }
                };
                if (patch.wake_time) profileUpdate.sleep_end = patch.wake_time;
                if (patch.sleep_start) profileUpdate.sleep_start = patch.sleep_start;

                await supabase
                    .from('profiles')
                    .update(profileUpdate)
                    .eq('id', userId);

                console.log(`[Settings] Flagged needs_rescheduling inside bio_data for user ${userId}`);
            } catch (flagError) {
                console.warn('[Settings] Failed to update sleep blocks or flag rescheduling:', flagError);
            }
        }

        return apiSuccess({ preferences: updated });
    },
    { requireAuth: true }
);
