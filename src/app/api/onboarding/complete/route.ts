import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@supabase/supabase-js';

export const POST = secureApiRoute(
    async (context, body) => {
        const {
            full_name, timezone,
            sleep_start, sleep_end, wind_down_mins,
            meals_per_day, meal_timing, default_buffer_duration,
            commitments, goals, failure_modes,
            selected_variant_id
        } = body as any;

        // Basic validation
        if (!full_name || !sleep_start || !sleep_end) {
            return apiError('Identity and sleep times are required');
        }

        let supabase = context.supabase;
        const userId = context.userId;

        // Use Service Role in development if auth context is missing (for local testing)
        if (process.env.NODE_ENV === 'development' && !userId) {
            supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
        }

        const effectiveUserId = userId || '5eaf0087-f547-4d87-a235-facd3bd3b997';
        console.log(`[API] Completing Onboarding for ${effectiveUserId}`);

        // 1. Update Profile (Identity + Rhythm + Failure Modes)
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: effectiveUserId,
                full_name,
                timezone,
                sleep_start,
                sleep_end,
                wind_down_mins,
                meals_per_day,
                // failure_modes and other rhythm metadata stored in bio_data
                bio_data: {
                    failure_modes: failure_modes || [],
                    meal_timing: meal_timing || 'normal',
                    default_buffer_duration: default_buffer_duration || 10,
                    initialized_at: new Date().toISOString()
                },
                onboarding_complete: true,
                updated_at: new Date().toISOString()
            });

        if (profileError) {
            console.error('Profile update failed:', profileError);
            throw new Error(`Profile update failed: ${profileError.message}`);
        }

        // 2. Insert Commitments (Anchors)
        if (commitments && commitments.length > 0) {
            const { error: commitmentsError, data: insertedComms } = await supabase
                .from('commitments')
                .insert(commitments.map((c: any) => ({
                    user_id: effectiveUserId,
                    title: c.title,
                    start_time: c.start_time,
                    end_time: c.end_time,
                    days_of_week: c.days_of_week,
                    is_active: true
                })))
                .select();

            if (commitmentsError) {
                console.error('Commitments insert failed:', commitmentsError);
            } else if (insertedComms) {
                try {
                    const { AnchorService } = await import('@/lib/calendar/anchor-service');
                    // Materialize for the next 21 days so the initial week generation sees them
                    const startDate = new Date();
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 21);
                    
                    for (const comm of insertedComms) {
                        await AnchorService.materialize(effectiveUserId, comm, startDate, endDate, supabase as any);
                    }
                    console.log(`Materialized ${insertedComms.length} commitments for user ${effectiveUserId}`);
                } catch (matError) {
                    console.error('Failed to materialize commitments:', matError);
                }
            }
        }

        // 3. Insert Goals
        if (goals && goals.length > 0) {
            const { error: goalsError } = await supabase
                .from('goals')
                .insert(goals.map((g: any) => ({
                    user_id: effectiveUserId,
                    title: g.title,
                    pillar: g.pillar,
                    category: g.pillar, // sync for legacy
                    importance: g.importance || 'high',
                    weekly_target_minutes: g.target_minutes_per_day * 7,
                    status: 'active'
                })));

            if (goalsError) {
                console.error('Goals insert failed:', goalsError);
            }
        }

        // 4. Trigger Initial Schedule Generation
        const { WeekOrchestrator } = await import('@/lib/calendar/week-orchestrator');
        const { CoachActionService } = await import('@/lib/coach/coach-actions');
        
        const today = new Date().toISOString().split('T')[0];
        let blocksCreated = 0;

        try {
            // Map selected_variant_id to WeekOrchestrator modes if applicable
            // For now, we use 'plan' mode regardless of variant
            const result = await WeekOrchestrator.generateWeek({
                userId: effectiveUserId,
                weekStartISO: today,
                mode: 'plan',
                supabase: supabase as any,
            });

            if (result.patch && result.patch.changes.length > 0) {
                const calendarPatch = {
                    ops: result.patch.changes.map((c: any) => {
                        if (c.op === 'create_event') return { op: 'create' as const, event: c.payload };
                        if (c.op === 'update_event') return { op: 'update' as const, event_id: c.event_id, fields: c.payload };
                        if (c.op === 'delete_event') return { op: 'delete' as const, event_id: c.event_id };
                        return c;
                    }),
                    scope: 'week' as const,
                    reason: 'Onboarding initial schedule generation',
                };

                await CoachActionService.applyPatch(effectiveUserId, calendarPatch, supabase as any);
                blocksCreated = result.previewBlocks?.length || 0;
            }
        } catch (genError) {
            console.error('Initial schedule generation failed:', genError);
            // Non-blocking: user is still "onboarded" even if generation fails
        }

        return apiSuccess({
            success: true,
            message: 'Onboarding completed successfully',
            blocksCreated
        });
    },
    { requireAuth: process.env.NODE_ENV !== 'development', auditAction: 'onboarding_complete' }
);
