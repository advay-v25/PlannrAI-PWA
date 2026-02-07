
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { CalendarPatch } from '@/types/coach-v4';
import { CoachActionService } from '@/lib/coach/coach-actions';

export const POST = secureApiRoute(
    async (context, body) => {
        const { patch } = body as { patch: CalendarPatch };

        if (!patch || !patch.ops || patch.ops.length === 0) {
            return apiError('Invalid patch: No operations provided');
        }

        const supabase = await createClient();

        try {
            const undoToken = await CoachActionService.applyPatch(context.userId, patch, supabase);

            if (undoToken === 'error_saving_undo') {
                console.warn('Patch applied but undo token failed to save');
            }

            return apiSuccess({
                success: true,
                undo_token: undoToken !== 'error_saving_undo' ? undoToken : null,
                message: 'Patch applied successfully'
            });

        } catch (error: any) {
            console.error('[API] Patch Apply Failed:', error);
            return apiError(`Failed to apply patch: ${error.message}`, 500);
        }
    },
    { requireAuth: true, auditAction: 'coach_apply_patch' }
);
