import { secureApiRoute } from '@/lib/security/api-protection';
import { BehaviorService, BehaviorAction, SignalMeta } from '@/lib/intelligence/behavior-service';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/api/api-utils';

export const POST = secureApiRoute(
    async (context, body) => {
        const { action, meta } = body as {
            action: BehaviorAction;
            meta: SignalMeta
        };

        if (!action) {
            return apiError(API_ERROR_CODES.VALIDATION_ERROR, 'Action is required', 400);
        }

        const result = await BehaviorService.logSignal(context.userId, action, meta);

        if (!result.success) {
            return apiError(API_ERROR_CODES.INTERNAL_ERROR, 'Failed to log behavioral signal', 500, result.error);
        }

        return apiSuccess({ success: true, message: 'Signal resonated' });
    },
    { requireAuth: true, auditAction: 'log_behavioral_signal' }
);
