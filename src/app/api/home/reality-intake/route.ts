
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';

export const maxDuration = 60;


export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { text, date } = body as { text: string; date: string };

        if (!text) return apiError('Text required', 400);

        // Construct Context
        const { data: schedule } = await supabase.from('schedule_blocks').select('*').eq('user_id', userId).eq('date', date);
        const { data: goals } = await supabase.from('goals').select('title, category').eq('user_id', userId);

        const aiContext = {
            input: text,
            current_schedule: schedule,
            goals: goals
        };

        try {
            // Call AI Service via coach channel
            const aiResult = await executeAI(userId, {
                channel: 'coach',
                input: text,
                context: aiContext
            });

            return apiSuccess({
                analysis: aiResult
            });

        } catch (e) {
            console.error("AI Error", e);
            return apiSuccess({ ai_error: true });
        }
    },
    { requireAuth: true, auditAction: 'reality_intake' }
);
