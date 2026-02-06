
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { OnboardingData } from '@/types/database';

export const POST = secureApiRoute(
    async (context, body) => {
        const {
            timezone, sleep_start, sleep_end,
            goals, energy_level, stress_level,
            meals_per_day, meal_windows,
            body_preferences, buffer_config,
            wind_down_mins, full_name
        } = body as OnboardingData;

        // Basic validation
        if (!sleep_start || !sleep_end) {
            return apiError('Sleep times are required');
        }

        const supabase = await createClient();
        const userId = context.userId;

        console.log(`[API] Completing Onboarding for ${userId}`);

        // 1. Update Profile (Time, Bio, Prefs)
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name,
                timezone,
                sleep_start,
                sleep_end,
                energy_level,
                stress_level,
                meals_per_day,
                meal_windows,
                body_preferences,
                buffer_config,
                wind_down_mins,
                onboarding_complete: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (profileError) {
            console.error('Profile update failed:', profileError);
            throw new Error(`Profile update failed: ${profileError.message}`);
        }

        // 2. Insert Goals (if any)
        if (goals && goals.length > 0) {
            // Check existing goals to avoid duplicates if re-running
            const { data: existingGoals } = await supabase
                .from('goals')
                .select('title')
                .eq('user_id', userId);

            const existingTitles = new Set(existingGoals?.map(g => g.title));
            const newGoals = goals.filter(g => !existingTitles.has(g.title)).map(g => ({
                user_id: userId,
                title: g.title,
                category: g.category,
                importance: g.importance || 'medium',
                minutes_per_day: g.minutes_per_day || 30,
                days_per_week: g.days_per_week || 5,
                status: 'active'
            }));

            if (newGoals.length > 0) {
                const { error: goalsError } = await supabase
                    .from('goals')
                    .insert(newGoals);

                if (goalsError) {
                    console.error('Goals insert failed:', goalsError);
                    // Don't fail the whole request, but log it
                }
            }
        }

        // 3. Generate Initial Schedule (Day 0)
        // We can trigger the Routine Engine or just create basic blocks
        // For System Repair compatibility, let's generate basic blocks here
        // or trigger the generation service.

        // Let's call the schedule generation service (internal logic simulation)
        // For now, let's at least ensure anchors (commitments) are respected.
        // Anchors were already inserted in Step 4.

        return apiSuccess({ success: true, message: 'Onboarding complete' });
    },
    { requireAuth: true, auditAction: 'onboarding_complete' }
);
