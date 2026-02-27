import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { BrainDumpProcessor } from '@/lib/ai/BrainDumpProcessor';

export const POST = secureApiRoute(
    async (context, body) => {
        const { text, content } = body as { text?: string, content?: string };
        const dumpText = text || content;
        const { userId } = context;

        if (!dumpText) return apiError("Text required", 400);

        try {
            const processor = new BrainDumpProcessor(userId);
            const result = await processor.process(dumpText);

            return apiSuccess(result);
        } catch (e: any) {
            console.error("[BrainDump API] Process failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
