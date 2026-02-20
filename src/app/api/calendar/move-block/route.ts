import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { block_id, new_start_time, new_end_time, new_date, resolution_strategy } = body as {
            block_id: string;
            new_start_time: string;
            new_end_time: string;
            new_date?: string;
            resolution_strategy?: string;
        };

        if (!block_id || !new_start_time || !new_end_time) {
            return apiError('Invalid move data', 400);
        }

        const targetDate = new_date || new Date().toISOString().split('T')[0];

        // Route the move through the deterministic engine
        const patchResult = await PatchService.applyPatch(
            userId,
            {
                ops: [{
                    op: 'move_event',
                    event_id: block_id,
                    to_start: new_start_time,
                    to_end: new_end_time,
                    date: targetDate
                }],
                reason: 'Manual drag and drop move',
                undoable: true,
                scope: 'day'
            },
            supabase,
            'manual_move'
        );

        if (!patchResult.success) {
            // Engine rejected it due to constraints or overlap
            // We return 409 Conflict with the error so the UI handles it
            return apiError('Conflict detected', 409, 'CONFLICT', {
                conflict: true,
                errors: patchResult.errors,
                resolution_options: [{
                    strategy: "cancel",
                    changes: [],
                    description: patchResult.errors[0] || "Cannot move block here."
                }]
            });
        }

        return apiSuccess({ success: true, undo_token: patchResult.undo_token });
    },
    { requireAuth: true }
);
