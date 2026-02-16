import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';
import { saveCoachMessage } from '@/lib/coach/coach-context';

export const POST = secureApiRoute(
    async (context, body) => {
        const { message, date, view, threadId } = body as { message: string, date?: string, view?: string, threadId?: string };
        const { userId } = context;

        if (!message) return apiError("Message required", 400);

        // 1. Call AI Service Directly (Bypasses internal API 401 issues)
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

        // 2. Persist the AI Response
        if (aiRes) {
            const supabase = await createClient();
            await saveCoachMessage(
                userId,
                'assistant',
                aiRes.summary || "I've analyzed your request.",
                supabase,
                aiRes // Store full JSON
            );
        }

        return apiSuccess(aiRes);
    },
    { requireAuth: true }
);
