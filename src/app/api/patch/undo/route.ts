import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        console.log(`[API] Undoing Last Action for ${context.userId}`);

        // 1. Get Inverse Patch
        const result = await PatchService.undoLast(context.userId);

        if (!result.success || !result.patch) {
            return apiError(result.message || 'No action to undo', 400);
        }

        // 2. Apply Inverse Patch
        const applyResults = await PatchService.applyPatch(context.userId, result.patch);

        // 3. Log Undo Event (Optional - prevent infinite undo-redo without structure)
        // We might want to delete the 'patch_run' we just undid to prevent undoing it again (which would require a redo stack).
        // For MVP: Deleting the last patch_run makes it 'consumed'.

        if (result.sourceId) {
            const supabase = await import('@/lib/supabase/server').then(m => m.createClient());
            await supabase.from('patch_runs').delete().eq('id', result.sourceId);
        }

        return apiSuccess({
            success: true,
            summary: `Undone: ${applyResults.updated} reverted.`,
            details: applyResults
        });
    },
    { requireAuth: true, auditAction: 'undo_patch' }
);
