
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { mode, constraints } = body as { mode: 'build' | 'improve', constraints?: any };

        // 1. Gather Context
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId);
        const { data: existingStacks } = await supabase.from('habit_stacks').select('*').eq('user_id', userId);

        const aiContext = {
            mode,
            profile,
            goals,
            existing_stacks: existingStacks,
            constraints
        };

        // 2. Call AI Service Directly
        try {
            const aiResult = await executeAI(userId, {
                channel: 'habit_stack',
                input: mode === 'build' ? "Build new stack" : "Improve existing stack",
                context: aiContext,
                // model: 'smart' // executeAI handles model selection based on channel, can't override easily unless valid in schema
            });

            return apiSuccess(aiResult);

        } catch (e) {
            console.error("AI Error", e);
            return apiError("Internal AI Error", 500);
        }
    },
    { requireAuth: true, auditAction: 'habit_assist' }
);
