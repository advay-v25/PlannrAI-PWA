import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';
import { saveCoachMessage } from '@/lib/coach/coach-context';

export const POST = secureApiRoute(
    async (context, body) => {
        const { message, date, view, threadId } = body as { message: string, date?: string, view?: string, threadId?: string };
        const { userId } = context;

        if (!message) return apiError("Message required", 400);

        // 1. Save User Message
        const supabase = await createClient();
        await saveCoachMessage(userId, 'user', message, supabase).catch(e =>
            console.warn('[Coach] Failed to save user message:', e)
        );

        // 2. Call AI Service
        const aiRes = await executeAI(userId, {
            channel: 'coach',
            input: message,
            context: {
                client_view: view,
                focus_date: date,
                thread_id: threadId
            },
            limits: { max_options: 3 }
        });

        // 3. Save Assistant Response
        if (aiRes) {
            await saveCoachMessage(
                userId,
                'assistant',
                aiRes.summary || "Analyzing your request.",
                supabase,
                aiRes
            ).catch(e => console.warn('[Coach] Failed to save assistant message:', e));
        }

        // 4. Return structured response
        return apiSuccess(aiRes);
    },
    { requireAuth: true }
);
