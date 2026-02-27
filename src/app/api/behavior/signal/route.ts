// @ts-nocheck
import { secureApiRoute } from '@/lib/security/api-protection';
import { BehaviorService, BehaviorAction, SignalMeta } from '@/lib/intelligence/behavior-service';
import { apiSuccess, apiError } from '@/lib/api/api-utils';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Schema for safe validation
const SignalSchema = z.object({
    action: z.string(),
    meta: z.record(z.any()).optional()
});

export const POST = secureApiRoute(
    async (context, body) => {
        const requestId = uuidv4();

        try {
            // 1. Safe Parse
            const parse = SignalSchema.safeParse(body);
            if (!parse.success) {
                console.warn(`[${requestId}] Invalid Signal Payload`, parse.error);
                return apiSuccess({ ok: false, ignored: true, error: 'Invalid payload', requestId });
                // Return 200 even on validation error for telemetry
            }

            const { action, meta } = parse.data;

            // 2. Attempt Log (Best Effort)
            const result = await BehaviorService.logSignal(context.userId, action as BehaviorAction, meta);

            if (!result.success) {
                console.error(`[${requestId}] Signal Log Failure`, result.error);
                return apiSuccess({ ok: false, ignored: true, error: 'Database write failed', requestId });
            }

            return apiSuccess({ ok: true, requestId });

        } catch (error: any) {
            // 3. Global Safety Net
            console.error(`[${requestId}] Uncaught Signal Error`, error);
            return apiSuccess({ ok: false, ignored: true, error: error.message, requestId });
        }
    },
    { requireAuth: false, auditAction: 'log_signal' } // Allow unauth for onboarding signals? User said "require auth ONLY if..."
);
