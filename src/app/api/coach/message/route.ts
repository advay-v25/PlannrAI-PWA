import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';
import { saveCoachMessage } from '@/lib/coach/coach-context';

export const maxDuration = 45;

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

        // 3. Save Assistant Response and Execute Side-Effects
        if (aiRes) {
            // A. Save Message
            await saveCoachMessage(
                userId,
                'assistant',
                aiRes.summary || "Analyzing your request.",
                supabase,
                aiRes
            ).catch(e => console.warn('[Coach] Failed to save assistant message:', e));

            // B. Resolve AI Proposals if requested by the Agent
            if (aiRes.resolved_proposals && aiRes.resolved_proposals.length > 0) {
                const { error: proposalError } = await supabase
                    .from('ai_proposals')
                    .update({ status: 'resolved', responded_at: new Date().toISOString() })
                    .in('id', aiRes.resolved_proposals)
                    .eq('user_id', userId);
                if (proposalError) {
                    console.warn('[Coach] Failed to resolve proposals:', proposalError.message);
                }
            }
        }

        // 4. Return structured response
        return apiSuccess(aiRes);
    },
    { requireAuth: true }
);
