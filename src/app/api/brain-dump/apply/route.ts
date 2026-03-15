import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const maxDuration = 15;

export const POST = secureApiRoute(
    async (context, body) => {
        const { patch, optionId, dumpId } = body as { patch: any; optionId?: string; dumpId?: string };
        const { userId, supabase } = context;

        if (!patch) return apiError("Invalid patch", 400);

        try {
            // Normalize the patch: handle both { ops: [...] } and raw patch_ops arrays
            const normalizedPatch = normalizePatch(patch);

            if (!normalizedPatch.ops || normalizedPatch.ops.length === 0) {
                // No calendar changes needed (e.g., "just note it" option)
                return apiSuccess({
                    success: true,
                    undo_token: null,
                    changes: 0,
                    message: 'No calendar changes were needed.',
                });
            }

            // Apply via unified PatchService
            const result = await PatchService.applyPatch(userId, normalizedPatch, supabase, 'brain_dump');

            // Clean up inbox items from this dump
            if (dumpId && result.success) {
                supabase.from('schedule_blocks')
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
                errors: result.errors.length > 0 ? result.errors : undefined,
            });

        } catch (e: any) {
            console.error("Brain Dump Apply failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);

/**
 * Normalize patch to PatchService format.
 * Handles:
 *   1. Already-normalized: { ops: [...] }
 *   2. Brain dump spec format: [ { op: "add", block: {...} }, ... ]
 *   3. Wrapped: { patch_ops: [...] }
 */
function normalizePatch(patch: any): any {
    // Already in PatchService format
    if (patch.ops && Array.isArray(patch.ops)) {
        return patch;
    }

    // Array of patch_ops passed directly
    const rawOps = Array.isArray(patch) ? patch : patch.patch_ops || [];

    const ops = rawOps.map((po: any) => {
        const opType = po.op;
        const block = po.block || po.payload || {};

        switch (opType) {
            case 'add':
            case 'create':
            case 'create_event':
                return {
                    op: 'create_event',
                    payload: {
                        date: block.date,
                        start_time: block.start_time,
                        end_time: block.end_time,
                        title: block.title || 'New Block',
                        block_type: block.type || block.block_type || 'flex',
                        goal_id: block.goal_id || null,
                        pillar: block.pillar || null,
                        status: block.status || 'planned',
                    },
                };
            case 'update':
            case 'update_event':
                return {
                    op: 'update_event',
                    event_id: block.id || po.event_id,
                    fields: {
                        ...(block.start_time ? { start_time: block.start_time } : {}),
                        ...(block.end_time ? { end_time: block.end_time } : {}),
                        ...(block.title ? { title: block.title } : {}),
                        ...(block.date ? { date: block.date } : {}),
                        ...(block.status ? { status: block.status } : {}),
                    },
                };
            case 'delete':
            case 'delete_event':
                return {
                    op: 'delete_event',
                    event_id: block.id || po.event_id,
                };
            default:
                return po;
        }
    });

    return {
        ops,
        undoable: true,
        reason: 'Brain dump action',
        scope: 'day',
    };
}
