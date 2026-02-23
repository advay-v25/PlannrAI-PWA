import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { patch, optionId, dumpId } = body as { patch: any, optionId?: string, dumpId?: string };
        const { userId } = context;

        if (!patch || !patch.ops) return apiError("Invalid patch", 400);

        try {
            const supabase = await createClient();

            // 1. Apply Patch via Unified PatchService
            const result = await PatchService.applyPatch(userId, patch, supabase, 'brain_dump');

            // 2. Remove Inbox Items generated from this dump (they are now formally scheduled via the patch)
            if (dumpId && result.success) {
                await supabase.from('schedule_blocks')
                    .delete()
                    .eq('status', 'inbox')
                    .contains('meta', { source_dump_id: dumpId })
                    .then(r => {
                        if (r.error) console.warn('[BrainDump Apply] Inbox cleanup failed:', r.error.message);
                    });
            }

            return apiSuccess({
                success: result.success,
                undo_token: result.undo_token,
                changes: result.changes,
                errors: result.errors.length > 0 ? result.errors : undefined
            });

        } catch (e: any) {
            console.error("Brain Dump Apply failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
