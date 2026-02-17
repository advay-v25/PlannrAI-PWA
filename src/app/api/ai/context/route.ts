
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { ContextService } from '@/lib/ai/context-service';

export const GET = secureApiRoute(
    async (context) => {
        const { userId } = context;
        try {
            const liquidContext = await ContextService.getLiquidContext(userId);
            const mode = ContextService.deriveSystemMode(liquidContext);
            return apiSuccess({ context: liquidContext, mode });
        } catch (e) {
            console.error("Failed to fetch context", e);
            return apiError("Context fetch failed", 500);
        }
    },
    { requireAuth: true }
);
