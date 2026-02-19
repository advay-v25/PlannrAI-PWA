import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { step_id, step_data, accumulated_data } = body as any;

        if (!step_id) {
            return apiError('step_id is required');
        }

        const userId = context.userId || '5eaf0087-f547-4d87-a235-facd3bd3b997';

        try {
            const result = await executeAI(userId, {
                channel: 'onboarding_insight',
                input: `Step "${step_id}" completed`,
                context: {
                    step_id,
                    step_data: step_data || {},
                    accumulated: accumulated_data || {}
                }
            });

            return apiSuccess(result);
        } catch (error) {
            console.error(`[Onboarding Insight] AI call failed for step ${step_id}:`, error);
            // Return fallback insight instead of erroring — don't block onboarding
            return apiSuccess({
                insight: 'Calibration data received. Processing...',
                archetype_signal: '🔄 Calibrating',
                donna_note: `Step ${step_id} data recorded.`,
                profile_update: {}
            });
        }
    },
    { requireAuth: process.env.NODE_ENV !== 'development', auditAction: 'onboarding_insight' }
);
