
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';
import { saveCoachMessage } from '@/lib/coach/coach-context';

export const POST = secureApiRoute(
    async (context, body) => {
        const { message, date, view, threadId } = body as { message: string, date?: string, view?: string, threadId?: string };
        const { userId } = context;

        if (!message) return apiError("Message required", 400);

        // 1. Call AI Gateway (Channel="coach")
        // The Gateway handles context building (via the helper we just made)
        const aiRes = await apiClient.post<any>('/api/ai/execute', {
            channel: 'coach',
            input: message,
            context: { // extra context if needed
                client_view: view,
                focus_date: date
            },
            limits: { max_options: 3 }
        });

        // 2. Persist the AI Response
        // We save the USER message in the Gateway context helper usually?
        // Wait, the Gateway calls `saveCoachMessage` for the user message.
        // But we need to save the ASSISTANT message here.
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
