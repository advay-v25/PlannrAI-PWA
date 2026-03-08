import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const { text, content } = body as { text?: string, content?: string };
        const dumpText = text || content;
        const { userId } = context;

        if (!dumpText) return apiError("Text required", 400);

        try {
            // 1. Save raw dump
            try {
                const supabase = await createClient();
                await supabase.from('brain_dumps').insert({
                    user_id: userId,
                    raw_text: dumpText,
                    processed: true
                });
            } catch (err) {
                console.warn('[BrainDump] Failed to save raw text record');
            }

            // 2. Process via unified AI Gateway
            const result = await executeAI(userId, {
                channel: 'brain_dump',
                input: dumpText,
                context: {}
            });

            return apiSuccess(result);
        } catch (e: any) {
            console.error("[BrainDump API] Process failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
