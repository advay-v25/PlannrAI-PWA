import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';
import { validateWithZod } from '@/lib/security/zod-validator';

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

const PreviewRegenerateSchema = z.object({
    reason: z.string().optional(),
    changes: PreferencesUpdateSchema
});

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateWithZod(PreviewRegenerateSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const { reason, changes } = validation.data;

        // 1. Simulate new schedule warnings
        const warnings: string[] = [];

        if (changes.sleep_start || changes.wake_time) {
            warnings.push("Changing sleep schedule will reschedule all morning/evening routines.");
        }
        if (changes.meals_per_day) {
            warnings.push("Changing meal frequency will shift focus blocks.");
        }
        if (changes.weekend_intensity === 'off') {
            warnings.push("Disabling weekend work may compress your weekday schedule.");
        }

        // 2. Generate Patch Ops (if accepted)
        const previewPatch = {
            reason: reason || "Settings update",
            ops: [
                {
                    op: 'update_settings',
                    fields: changes
                },
                {
                    op: 'analyze_content', // Signal to re-run optimization
                    analysis: { type: 'full_schedule_regenerate' }
                }
            ]
        };

        return apiSuccess({
            preview_blocks: [], // Empty means "no visual diff available yet", UI can just show warnings
            patch: previewPatch,
            warnings
        });
    },
    { requireAuth: true }
);
