import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { generateCoachResponse } from '@/lib/coach/response-generator';
import { buildCoachContext } from '@/lib/coach/context-builder';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { PatchService } from '@/lib/services/patch-service';

export const maxDuration = 45;

export const POST = secureApiRoute(
    async (context, body) => {
        const { accomplished, bestGoalId, worstGoalId, priorityChange, feedbackText, mode } = body as any;
        const { userId, supabase } = context;

        if (!mode) return apiError("Missing execution mode", 400);

        // 1. Log or track the weekly review locally or in DB if needed.
        // For now, the user dismissed it client side via localStorage.

        // 2. Adjust Goal Priority
        if (worstGoalId && worstGoalId !== 'none' && priorityChange && priorityChange !== 'no') {
            const { data: goal } = await supabase
                .from('goals')
                .select('id, importance')
                .eq('id', worstGoalId)
                .eq('user_id', userId)
                .single();

            if (goal) {
                let newImportance = goal.importance;
                if (priorityChange === 'increase') {
                    if (goal.importance === 'low') newImportance = 'medium';
                    else if (goal.importance === 'medium') newImportance = 'high';
                } else if (priorityChange === 'decrease') {
                    if (goal.importance === 'high') newImportance = 'medium';
                    else if (goal.importance === 'medium') newImportance = 'low';
                }

                if (newImportance !== goal.importance) {
                    await supabase
                        .from('goals')
                        .update({ importance: newImportance })
                        .eq('id', worstGoalId);
                }
            }
        }

        // 3. Handle Auto Execution (Coach AI + Replan)
        if (mode === 'auto') {
            // Build Contexts
            const coachCtx = await buildCoachContext(userId, supabase);
            const calCtx = await buildCalendarContext(userId, supabase);

            const prompt = `Weekly Review Feedback: ${feedbackText || 'I want a fresh schedule for next week.'} Please regenerate my schedule for the rest of the week incorporating this feedback.`;

            // We generate the Coach Response which should naturally output a replan_week operation
            const aiResponse = await generateCoachResponse(
                prompt,
                [], // empty history
                coachCtx,
                supabase,
                calCtx
            );

            // Execute the highest confidence option
            const bestOption = aiResponse.options?.[0];
            if (bestOption && bestOption.patch && (bestOption.patch as any).ops?.length > 0) {
                await PatchService.applyPatch(userId, { 
                    ops: (bestOption.patch as any).ops,
                    scope: 'week'
                }, supabase, 'coach');
            } else {
                // Fallback: manually trigger replan_week if AI failed to output it
                await PatchService.applyPatch(userId, {
                    ops: [{ op: 'replan_week', payload: { mode: 'balanced', allow_weekend: true } }],
                    scope: 'week'
                }, supabase, 'coach');
            }
        }

        return apiSuccess({ success: true, mode });
    },
    { requireAuth: true, auditAction: 'weekly_review_execute' }
);
