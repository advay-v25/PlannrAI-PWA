
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { CoachActionService } from '@/lib/coach/coach-actions';

export const POST = secureApiRoute(
    async (context, body) => {
        const { undo_token } = body as { undo_token: string };

        if (!undo_token) {
            return apiError('Missing undo_token');
        }

        const supabase = await createClient();

        try {
            const success = await CoachActionService.undoPatch(context.userId, undo_token, supabase);

            if (!success) {
                return apiError('Undo failed: Token invalid or already expired', 400);
            }

            return apiSuccess({
                success: true,
                message: 'Changes reverted successfully'
            });

        } catch (error: any) {
            console.error('[API] Undo Failed:', error);
            return apiError(`Failed to revert changes: ${error.message}`, 500);
        }
    },
    { requireAuth: true, auditAction: 'coach_undo_patch' }
);
