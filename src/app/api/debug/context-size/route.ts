
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { ContextService } from '@/lib/ai/context-service';

export const GET = secureApiRoute(
    async (context) => {
        try {
            const liquidContext = await ContextService.getLiquidContext(context.userId);
            const sizes = (liquidContext as any)._debug_sizes || { error: "No debug sizes found" };
            const fullSizes = {
                total_str_len: JSON.stringify(liquidContext).length,
                ...sizes
            };
            return apiSuccess(fullSizes);
        } catch (e: any) {
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
