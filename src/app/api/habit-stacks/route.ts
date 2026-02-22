import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

// GET - List habit stacks
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        const { data: stacks, error } = await supabase
            .from('habit_stacks')
            .select('*')
            .eq('user_id', context.userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            return apiError('Failed to fetch habit stacks', 500);
        }

        return apiSuccess({ stacks });
    },
    { requireAuth: true }
);

// POST - Create a habit stack
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['trigger_habit', 'action_habit']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const {
            trigger_habit,
            action_habit,
            goal_id,
            trigger_time,
            action_duration_mins = 5,
        } = body as {
            trigger_habit: string;
            action_habit: string;
            goal_id?: string;
            trigger_time?: string;
            action_duration_mins?: number;
        };

        // Validate lengths
        if (trigger_habit.length > 200 || action_habit.length > 200) {
            return apiError('Habit descriptions must be under 200 characters');
        }

        const supabase = await createClient();

        const { data: stack, error } = await supabase
            .from('habit_stacks')
            .insert({
                user_id: context.userId,
                trigger_habit: trigger_habit.trim(),
                action_habit: action_habit.trim(),
                goal_id: goal_id || null,
                trigger_time: trigger_time || null,
                action_duration_mins,
            })
            .select()
            .single();

        if (error) {
            return apiError('Failed to create habit stack', 500);
        }

        return apiSuccess({ stack }, 201);
    },
    { requireAuth: true, auditAction: 'habit_stack_create' }
);

// PUT - Update or complete a habit stack
export const PUT = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const {
            id,
            trigger_habit,
            action_habit,
            is_active,
            mark_complete,  // Special flag to log completion
        } = body as {
            id: string;
            trigger_habit?: string;
            action_habit?: string;
            is_active?: boolean;
            mark_complete?: boolean;
        };

        const supabase = await createClient();

        // If marking complete, update streak
        if (mark_complete) {
            const today = new Date().toISOString().split('T')[0];

            // Get current stack
            const { data: stack } = await supabase
                .from('habit_stacks')
                .select('*')
                .eq('id', id)
                .eq('user_id', context.userId)
                .single();

            if (!stack) {
                return apiError('Habit stack not found', 404);
            }

            // Check if already completed today
            if (stack.last_completed === today) {
                return apiSuccess({ stack, message: 'Already completed today' });
            }

            // Calculate new streak
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const dayBefore = new Date();
            dayBefore.setDate(dayBefore.getDate() - 2);
            const dayBeforeStr = dayBefore.toISOString().split('T')[0];

            let newStreak = 1;
            let graceUsed = stack.grace_days_used || 0;

            if (stack.last_completed === yesterdayStr) {
                // Consecutive day
                newStreak = (stack.current_streak || 0) + 1;
                graceUsed = 0;
            } else if (stack.last_completed === dayBeforeStr && graceUsed < (stack.max_grace_days || 1)) {
                // Used grace day
                newStreak = (stack.current_streak || 0) + 1;
                graceUsed = graceUsed + 1;
            }
            // Otherwise streak resets to 1

            const { data: updated, error } = await supabase
                .from('habit_stacks')
                .update({
                    current_streak: newStreak,
                    longest_streak: Math.max(newStreak, stack.longest_streak || 0),
                    last_completed: today,
                    total_completions: (stack.total_completions || 0) + 1,
                    grace_days_used: graceUsed,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .eq('user_id', context.userId)
                .select()
                .single();

            if (error) {
                return apiError('Failed to update habit stack', 500);
            }

            // Also mark linked schedule_block as done via habit_instances
            try {
                const { data: instance } = await supabase
                    .from('habit_instances')
                    .select('schedule_block_id')
                    .eq('habit_stack_id', id)
                    .eq('date', today)
                    .single();

                if (instance?.schedule_block_id) {
                    await supabase
                        .from('schedule_blocks')
                        .update({ status: 'done' })
                        .eq('id', instance.schedule_block_id)
                        .eq('user_id', context.userId);

                    await supabase
                        .from('habit_instances')
                        .update({ status: 'done' })
                        .eq('habit_stack_id', id)
                        .eq('date', today);
                }
            } catch (e) {
                console.warn('[habit-stacks] Failed to cascade completion to schedule_block:', e);
            }

            // Proactive Thinking Layer: Trigger on habit completion
            try {
                const { ThinkingService } = await import('@/lib/ai/thinking-service');
                ThinkingService.evaluateContextAndPropose(
                    context.userId,
                    `User just completed habit stack: ${stack.name || stack.trigger_habit || 'Routine'}. Current streak is now ${newStreak}.`,
                    id,
                    'habit_completion'
                ).catch(err => console.error('[Thinking Layer] Error triggering from Habit Completion:', err));
            } catch (e) {
                console.warn('[habit-stacks] Failed to trigger ThinkingService:', e);
            }

            return apiSuccess({
                stack: updated,
                streakInfo: {
                    isNewRecord: newStreak > (stack.longest_streak || 0),
                    usedGrace: graceUsed > (stack.grace_days_used || 0),
                }
            });
        }

        // Regular update
        const updates: Record<string, unknown> = {};
        if (trigger_habit !== undefined) updates.trigger_habit = trigger_habit.trim();
        if (action_habit !== undefined) updates.action_habit = action_habit.trim();
        if (is_active !== undefined) updates.is_active = is_active;
        updates.updated_at = new Date().toISOString();

        const { data: stack, error } = await supabase
            .from('habit_stacks')
            .update(updates)
            .eq('id', id)
            .eq('user_id', context.userId)
            .select()
            .single();

        if (error) {
            return apiError('Failed to update habit stack', 500);
        }

        return apiSuccess({ stack });
    },
    { requireAuth: true, auditAction: 'habit_stack_update' }
);

// DELETE - Delete a habit stack
export const DELETE = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { id } = body as { id: string };

        const supabase = await createClient();

        const { error } = await supabase
            .from('habit_stacks')
            .delete()
            .eq('id', id)
            .eq('user_id', context.userId);

        if (error) {
            return apiError('Failed to delete habit stack', 500);
        }

        return apiSuccess({ success: true });
    },
    { requireAuth: true, auditAction: 'habit_stack_delete' }
);
