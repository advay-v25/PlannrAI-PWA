import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@supabase/supabase-js';

export const POST = secureApiRoute(
    async (context, body) => {
        const {
            timezone, sleep_start, sleep_end,
            goals, energy_level, stress_level,
            meals_per_day, meal_windows,
            body_preferences, buffer_config,
            wind_down_mins, full_name,
            commitments,
            ai_profile  // AI personality profile built during onboarding
        } = body as any;

        // Basic validation
        if (!sleep_start || !sleep_end) {
            return apiError('Sleep times are required');
        }

        // Use the authenticated client from context by default (fixes RLS race condition)
        let supabase = context.supabase;

        const userId = context.userId || '5eaf0087-f547-4d87-a235-facd3bd3b997';
        console.log(`[API] Completing Onboarding for ${userId}`);

        // DEBUG FALLBACK: If we are in a debug scenario (no auth context), use Service Role to bypass RLS
        // STRICTLY for development only
        if (process.env.NODE_ENV === 'development' && (!context.userId || userId === '5eaf0087-f547-4d87-a235-facd3bd3b997')) {
            console.log('[API] Debug User detected - using Service Role Client');
            supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
        }

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
                bio_data: ai_profile ? { ai_profile, uploaded_at: new Date().toISOString() } : undefined,
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
            const newGoals = goals.filter((g: any) => !existingTitles.has(g.title)).map((g: any) => ({
                user_id: userId,
                title: g.title,
                description: g.description,
                category: g.category,
                pillar: g.category,
                importance: g.importance || 'high',
                weekly_target_minutes: (g.suggested_hours_week || 5) * 60,
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
            const missingCommitments = commitments.filter((c: any) => !existingTitles.has(c.title));

            if (missingCommitments.length > 0) {
                console.log(`[Onboarding] Syncing ${missingCommitments.length} missing commitments to DB...`);
                const { data: synced, error: syncError } = await supabase
                    .from('commitments')
                    .insert(missingCommitments.map((c: any) => ({
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

        // 4. Generate Initial Schedule via WeekOrchestrator
        const { WeekOrchestrator } = await import('@/lib/calendar/week-orchestrator');
        const { CoachActionService } = await import('@/lib/coach/coach-actions');

        const today = new Date().toISOString().split('T')[0];

        // If processedGoals is empty (maybe user didn't add new ones), fetch all active goals
        if (processedGoals.length === 0) {
            const { data: allGoals } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'active');
            processedGoals = allGoals || [];
        }

        let blocksCreated = 0;
        let patchRunId: string | null = null;

        try {
            const result = await WeekOrchestrator.generateWeek({
                userId,
                weekStartISO: today,
                mode: 'plan',
                supabase: supabase as any,
            });

            if (result.patch && result.patch.changes.length > 0) {
                // Convert WeekOrchestrator patch format to CalendarPatch format for CoachActionService
                const calendarPatch = {
                    ops: result.patch.changes.map((c: any) => {
                        if (c.op === 'create_event') {
                            return { op: 'create' as const, event: c.payload };
                        } else if (c.op === 'update_event') {
                            return { op: 'update' as const, event_id: c.event_id, fields: c.payload };
                        } else if (c.op === 'delete_event') {
                            return { op: 'delete' as const, event_id: c.event_id };
                        }
                        return c;
                    }),
                    scope: 'week' as const,
                    reason: 'Onboarding initial schedule generation',
                };

                patchRunId = await CoachActionService.applyPatch(userId, calendarPatch, supabase as any);
                blocksCreated = result.previewBlocks.length;
                console.log(`[Onboarding] Generated ${blocksCreated} blocks via WeekOrchestrator. PatchRun: ${patchRunId}`);
            } else {
                console.log('[Onboarding] WeekOrchestrator returned empty patch');
            }
        } catch (planError) {
            console.error('Failed to generate/apply initial schedule:', planError);
            // Non-blocking — user can still proceed
        }

        return apiSuccess({
            success: true,
            message: 'Onboarding complete',
            blocksCreated
        });
    },
    { requireAuth: process.env.NODE_ENV !== 'development', auditAction: 'onboarding_complete' }
);
