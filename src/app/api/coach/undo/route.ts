import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { undo_token } = body as { undo_token: string };
        const { userId } = context;

        if (!undo_token) return apiError("undo_token required", 400);

        try {
            const supabase = await createClient();
            const result = await PatchService.undoPatch(userId, undo_token, supabase);

            if (!result.success) {
                return apiError("Undo failed — patch may have already been reverted", 400);
            }

            return apiSuccess({
                success: true,
                changes: result.changes
            });
        } catch (e: any) {
            console.error("Coach Undo failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
