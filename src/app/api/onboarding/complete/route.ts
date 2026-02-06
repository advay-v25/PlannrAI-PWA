import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { OnboardingData } from '@/types/database';
import { generateStaticWeekPlan, persistWeekPlan } from '@/lib/scheduling/week-service';

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
        let processedGoals: any[] = [];
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
                const { data: insertedGoals, error: goalsError } = await supabase
                    .from('goals')
                    .insert(newGoals)
                    .select();

                if (goalsError) {
                    console.error('Goals insert failed:', goalsError);
                } else {
                    processedGoals = insertedGoals || [];
                }
            }
        }

        // 3. Generate Initial Schedule (Server-Side Orchestration)
        // Fetch commitments just inserted in previous steps (client inserted Step 4)
        const { data: commitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', userId);

        const profileConfig = {
            sleep_end,
            sleep_start,
            low_energy_mode: energy_level ? energy_level < 3 : false
        };

        // Determine Week Start (Today or Next Monday?)
        // For onboarding, we start TODAY to give immediate value.
        const today = new Date().toISOString().split('T')[0];

        // Generate Plan
        // If processedGoals is empty (maybe user didn't add new ones), fetch all active goals
        if (processedGoals.length === 0) {
            const { data: allGoals } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'active');
            processedGoals = allGoals || [];
        }

        const plan = generateStaticWeekPlan(
            processedGoals.map(g => ({
                id: g.id,
                title: g.title,
                category: g.category,
                minutes_per_day: g.minutes_per_day || 30, // Default if missing
                importance: g.importance
            })),
            profileConfig,
            commitments?.map(c => ({
                days_of_week: c.days_of_week,
                start_time: c.start_time,
                end_time: c.end_time
            })) || []
        );

        // 4. Persist Plan
        let blocksCreated = 0;
        try {
            blocksCreated = await persistWeekPlan(userId, plan, today, supabase);
            console.log(`[Onboarding] Generated ${blocksCreated} initial blocks.`);
        } catch (planError) {
            console.error("Failed to persist initial plan:", planError);
            // Non-blocking, but warned
        }

        return apiSuccess({
            success: true,
            message: 'Onboarding complete',
            blocksCreated
        });
    },
    { requireAuth: true, auditAction: 'onboarding_complete' }
);
