
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { ProfilePreferences } from '@/lib/types/settings';

// Fields that should trigger schedule regeneration when changed
const SCHEDULE_AFFECTING_FIELDS = [
    'sleep_start', 'sleep_end', 'wake_time', 'scheduling_strategy',
    'focus_hours_start', 'focus_hours_end', 'meal_times',
    'work_start', 'work_end'
];

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const patch = body as Partial<ProfilePreferences>;

        // 1. Remove protected fields if any
        delete (patch as any).user_id;
        delete (patch as any).updated_at;

        // 2. Check if any schedule-affecting fields are being changed
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

        // 4. If schedule-affecting fields changed, flag for rescheduling
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

                await supabase
                    .from('profiles')
                    .update({ needs_rescheduling: true })
                    .eq('id', userId);
                console.log(`[Settings] Flagged needs_rescheduling for user ${userId}`);
            } catch (flagError) {
                console.warn('[Settings] Failed to update sleep blocks or flag rescheduling:', flagError);
            }
        }

        return apiSuccess({ preferences: updated });
    },
    { requireAuth: true }
);
