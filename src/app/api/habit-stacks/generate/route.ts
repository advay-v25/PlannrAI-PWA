import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const maxDuration = 60;


export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { mode, constraints } = body as { mode: 'morning' | 'evening' | 'custom', constraints?: any };

        // 1. Gather Context
        const { data: profile } = await supabase.from('profiles').select('full_name, sleep_start, sleep_end, bio_data').eq('id', userId).single();
        const { data: goals } = await supabase.from('goals').select('id, title, category, importance').eq('user_id', userId).eq('status', 'active');
        const { data: existingStacks } = await supabase.from('habit_stacks').select('id, name, trigger_habit, action_habit').eq('user_id', userId);

        const aiContext = {
            target_routine: mode,
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
                input: `Build a highly effective ${mode} routine for me. Make sure it fits my goals.`,
                context: aiContext
            }) as any;

            const stacks = aiResult?.stacks || [];

            return apiSuccess({
                stacks: stacks,
                donna_note: aiResult?.donna_note || null,
                _meta: aiResult?._meta
            });

        } catch (e: any) {
            console.error('[habit_stacks_generate] Error:', e);
            return apiError('Failed to generate habit stack', 500);
        }
    },
    { requireAuth: true, rateLimit: 'aiHabits' }
);
