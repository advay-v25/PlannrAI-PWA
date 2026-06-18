import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { startOfDay, format } from 'date-fns';

export const POST = secureApiRoute(
    async (context) => {
        const { userId, supabase, params } = context;
        const stackId = params?.id;

        if (!stackId) {
            return apiError('Missing habit stack ID', 400);
        }

        try {
            // 1. Fetch current stack
            const { data: stack, error: fetchError } = await supabase
                .from('habit_stacks')
                .select('*')
                .eq('id', stackId)
                .eq('user_id', userId)
                .single();

            if (fetchError || !stack) {
                return apiError('Habit stack not found', 404);
            }

            const now = new Date();
            const todayStr = format(now, 'yyyy-MM-dd');

            // 2. Calculate new streak
            let newStreak = stack.current_streak || 0;
            const lastCompletedStr = stack.last_completed ? stack.last_completed.split('T')[0] : null;

            if (lastCompletedStr !== todayStr) {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

                if (lastCompletedStr === yesterdayStr) {
                    newStreak += 1;
                } else {
                    newStreak = 1;
                }
            }

            const newLongest = Math.max(newStreak, stack.longest_streak || 0);

            // 3. Update Stack
            const { error: updateError } = await supabase
                .from('habit_stacks')
                .update({
                    current_streak: newStreak,
                    longest_streak: newLongest,
                    total_completions: (stack.total_completions || 0) + 1,
                    last_completed: now.toISOString()
                })
                .eq('id', stackId);

            if (updateError) throw updateError;

            // 4. Mark Calendar as Done
            // Look for a schedule block for today matching the routine name
            if (stack.name) {
                const { data: blocks } = await supabase
                    .from('schedule_blocks')
                    .select('id, title, status')
                    .eq('user_id', userId)
                    .eq('date', todayStr)
                    .ilike('title', `%${stack.name}%`)
                    .neq('status', 'done');

                if (blocks && blocks.length > 0) {
                    // Mark the first matching block as done
                    await supabase
                        .from('schedule_blocks')
                        .update({ status: 'done' })
                        .eq('id', blocks[0].id);
                }
            }

            return apiSuccess({ success: true, newStreak });

        } catch (e: any) {
            console.error('[habit_stacks_complete] Error:', e);
            return apiError('Failed to complete habit stack', 500);
        }
    },
    { requireAuth: true }
);
