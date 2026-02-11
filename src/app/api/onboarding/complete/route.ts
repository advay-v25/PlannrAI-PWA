import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { OnboardingData } from '@/types/database';
import { generateAIWeekPlan, generateStaticWeekPlan, persistWeekPlan } from '@/lib/scheduling/week-service';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Wrapper to decide plan generation strategy
 */
async function generateWeekPlan(
    userId: string,
    goals: any[],
    profile: any,
    commitments: any[],
    supabase: SupabaseClient
) {
    try {
        return await generateAIWeekPlan(userId, goals, profile, commitments);
    } catch (e) {
        console.error("AI Generation failed, falling back:", e);
        return {
            plan: generateStaticWeekPlan(goals, profile, commitments),
            source: 'template',
            message: 'Fallback to static template'
        };
    }
}

export const POST = secureApiRoute(
    async (context, body) => {
        const {
            timezone, sleep_start, sleep_end,
            goals, energy_level, stress_level,
            meals_per_day, meal_windows,
            body_preferences, buffer_config,
            wind_down_mins, full_name,
            commitments // Destructure commitments from body (Fallback Flow)
        } = body as OnboardingData;

        // Basic validation
        if (!sleep_start || !sleep_end) {
            return apiError('Sleep times are required');
        }

        const supabase = await createClient();
        const userId = context.userId;

        console.log(`[API] Completing Onboarding for ${userId}`);

        // 1. Update Profile (Time, Bio, Prefs)
        // 1. Update Profile (Time, Bio, Prefs) - Use UPSERT to handle missing rows
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
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
            .select();

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

        // 3. Handle Commitments (Fail-safe Persistence)
        // Try to fetch existing
        const { data: dbCommitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', userId);

        // If we have payload commitments but DB is empty (implying API failure earlier), try to save them now.
        // Or simply merge them for the Calculation Context.
        let finalCommitments = dbCommitments || [];

        if (commitments && commitments.length > 0) {
            // Check which ones are missing from DB
            const existingTitles = new Set(finalCommitments.map(c => c.title));
            const missingCommitments = commitments.filter(c => !existingTitles.has(c.title));

            if (missingCommitments.length > 0) {
                console.log(`[Onboarding] Syncing ${missingCommitments.length} missing commitments to DB...`);
                const { data: synced, error: syncError } = await supabase
                    .from('commitments')
                    .insert(missingCommitments.map(c => ({
                        user_id: userId,
                        title: c.title,
                        start_time: c.start_time,
                        end_time: c.end_time,
                        days_of_week: c.days_of_week,
                        is_active: true
                    })))
                    .select();

                if (syncError) {
                    console.error("[Onboarding] Failed to sync commitments (Ignored for generation):", syncError);
                } else if (synced) {
                    finalCommitments = [...finalCommitments, ...synced];
                }
            }
        }

        // 4. Generate Initial Schedule (Server-Side)
        // Use finalCommitments (Merged DB + Fallback)

        // Post-MVP: Use Context Engine to derive Intelligence Parameters
        const { ContextEngine } = await import('@/lib/intelligence/context-engine');
        // We use today's date for context building
        const contextData = await ContextEngine.build(userId, new Date().toISOString().split('T')[0], supabase);

        console.log(`[Onboarding] Context Mode: ${contextData.computedMode}, Density: ${contextData.densityLimit}`);

        const profileConfig = {
            preferred_name: full_name?.split(' ')[0],
            sleep_end,
            sleep_start,
            energy_level,
            stress_level,
            low_energy_mode: contextData.computedMode === 'recovery' || contextData.computedMode === 'survival'
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

        const { plan, message, source } = await generateWeekPlan(
            userId,
            processedGoals.map(g => ({
                id: g.id,
                title: g.title,
                category: g.category,
                minutes_per_day: g.minutes_per_day || 30, // Default if missing
                importance: g.importance
            })),
            profileConfig,
            finalCommitments.map(c => ({
                days_of_week: c.days_of_week,
                start_time: c.start_time,
                end_time: c.end_time,
                title: c.title
            })) || [],
            supabase
        );

        console.log(`[Onboarding] Plan generated via ${source}: ${message}`);

        // 4. Persist Plan
        let blocksCreated = 0;
        try {
            const result = await persistWeekPlan(userId, plan, today, supabase, 'onboarding');
            blocksCreated = result.blocksInserted;
            console.log(`[Onboarding] Generated ${blocksCreated} initial blocks. Version: ${result.versionId}`);
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
