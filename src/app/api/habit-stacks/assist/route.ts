
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const maxDuration = 60;


export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { mode, constraints } = body as { mode: 'build' | 'improve', constraints?: any };

        // 1. Gather Context
        const { data: profile } = await supabase.from('profiles').select('full_name, sleep_start, sleep_end, bio_data').eq('id', userId).single();
        const { data: goals } = await supabase.from('goals').select('id, title, category, importance').eq('user_id', userId).eq('status', 'active');
        const { data: existingStacks } = await supabase.from('habit_stacks').select('id, trigger_habit, action_habit, name').eq('user_id', userId);

        const aiContext = {
            mode,
            profile: {
                name: profile?.full_name || 'User',
                sleep_start: profile?.sleep_start,
                sleep_end: profile?.sleep_end,
                ai_profile: (profile as any)?.bio_data?.ai_profile || null
            },
            goals: goals?.map(g => ({ title: g.title, category: g.category, importance: g.importance })) || [],
            existing_stacks: existingStacks?.map(s => s.name || s.trigger_habit) || [],
            constraints
        };

        // 2. Call AI Service
        try {

            const aiResult = await executeAI(userId, {
                channel: 'habit_stack',
                input: mode === 'build' ? "Build new habit stack based on my goals" : "Improve my existing stacks",
                context: aiContext
            }) as any;

            // 3. Persist stacks directly to DB (no more fragile patch-ops)
            const createdStacks: any[] = [];
            const stacks = aiResult?.stacks || [];

            for (const stack of stacks) {
                const totalDuration = (stack.steps || []).reduce((sum: number, s: any) => sum + (s.minutes || 0), 0);
                const triggerStep = stack.steps?.[0]?.title || 'Start';
                const actionStep = stack.steps?.[1]?.title || 'Action';

                const { data: created, error } = await supabase
                    .from('habit_stacks')
                    .insert({
                        user_id: userId,
                        trigger_habit: triggerStep,
                        action_habit: actionStep,
                        action_duration_mins: totalDuration,
                        preferred_window: stack.schedule_hint?.time_of_day || 'morning',
                        enabled: true,
                        is_active: true,
                        current_streak: 0,
                        longest_streak: 0
                    })
                    .select()
                    .single();

                if (created) {
                    createdStacks.push(created);

                    // Inject as a recurring calendar anchor (commitment)
                    let startTime = '08:00';
                    let endTime = '08:15';
                    if (stack.schedule_hint?.time_of_day === 'evening') {
                        startTime = '20:00';
                        endTime = '20:15';
                    } else if (stack.schedule_hint?.time_of_day === 'afternoon') {
                        startTime = '13:00';
                        endTime = '13:15';
                    }

                    const { error: anchorError } = await supabase.from('commitments').insert({
                        user_id: userId,
                        title: `🗓️ ${stack.name || triggerStep}`,
                        start_time: startTime,
                        end_time: endTime,
                        days_of_week: [0, 1, 2, 3, 4, 5, 6], // Every day by default
                        is_active: true
                    });
                    if (anchorError) {
                        console.warn('[Habit Assist] Failed to create calendar anchor:', anchorError.message);
                    }
                }

                if (error) console.warn('[Habit Assist] Insert error:', error.message);
            }

            return apiSuccess({
                stacks: createdStacks,
                donna_note: aiResult?.donna_note || null,
                ai_generated: stacks.length > 0,
                _meta: aiResult?._meta
            });

        } catch (e: any) {
            console.error('[habit_stacks_assist] Error:', e);
            return apiError('Failed to process habit stacks', 500);
        }
    },
    { requireAuth: true, rateLimit: 'aiHabits' }
);
