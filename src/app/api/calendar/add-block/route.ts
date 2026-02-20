import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { block, resolution_strategy } = body as { block: any, resolution_strategy?: string };

        if (!block || !block.start_time || !block.end_time || !block.date) {
            return apiError('Invalid block data', 400);
        }

        // Route the addition through the deterministic engine
        const patchResult = await PatchService.applyPatch(
            userId,
            {
                ops: [{
                    op: 'create_event',
                    payload: block
                }],
                reason: 'Manual block addition',
                undoable: true,
                scope: 'day'
            },
            supabase,
            'manual_create'
        );

        if (!patchResult.success) {
            // Engine rejected it due to constraints or overlap
            // Return 409 Conflict with the error so UI handles it
            return apiError('Conflict detected', 409, 'CONFLICT', {
                conflict: true,
                errors: patchResult.errors,
                resolution_options: [{
                    strategy: "cancel",
                    changes: [],
                    description: patchResult.errors[0] || "Cannot place block here."
                }]
            });
        }

        return apiSuccess({ success: true, undo_token: patchResult.undo_token });
    },
    { requireAuth: true }
);
