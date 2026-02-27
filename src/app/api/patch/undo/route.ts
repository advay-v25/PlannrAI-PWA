// @ts-nocheck
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context) => {
        try {
            const result = await PatchService.undoLast(context.userId);
            if (!result.success) {
                return apiError('Undo failed', 400, { message: result.message });
            }
            return apiSuccess(result);
        } catch (error: any) {
            console.error('[Patch Undo Error]', error);
            return apiError('Failed to undo last action', 500, { message: error.message });
        }
    },
    {
        requireAuth: true,
        auditAction: 'patch_undo',
    }
);
