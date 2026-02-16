
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

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

        // 2. Call AI
        const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/execute`;

        try {
            const aiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': context.request.headers.get('cookie') || ''
                },
                body: JSON.stringify({
                    channel: 'habit_stack',
                    context: aiContext,
                    model: 'smart' // Use intelligent model for design
                })
            });

            if (!aiResponse.ok) {
                return apiError("AI Service Unavailable", 503);
            }

            const aiResult = await aiResponse.json();
            return apiSuccess(aiResult.data);

        } catch (e) {
            console.error("AI Error", e);
            return apiError("Internal AI Error", 500);
        }
    },
    { requireAuth: true, auditAction: 'habit_assist' }
);
