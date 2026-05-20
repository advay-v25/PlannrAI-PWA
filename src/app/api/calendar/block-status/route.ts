import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

/**
 * POST /api/calendar/block-status
 *
 * Dedicated endpoint for transitioning a block's status.
 * PRD requires: planned → in_progress → completed/missed/cancelled
 * Also captures actual_start_time and actual_end_time.
 */

const StatusTransitionSchema = z.object({
    block_id: z.string().uuid('Invalid block ID'),
    status: z.enum(['planned', 'in_progress', 'done', 'missed', 'cancelled', 'partial']),
    actual_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
    actual_end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
    notes: z.string().max(500).optional(),
});

// Valid transitions — prevents going backwards, but allows manual corrections
const VALID_TRANSITIONS: Record<string, string[]> = {
    planned: ['in_progress', 'done', 'cancelled', 'missed'],
    in_progress: ['done', 'partial', 'missed', 'cancelled'],
    done: ['missed'],  // allow manual correction (user tapped wrong button)
    missed: ['planned', 'done'],  // allow retry or manual correction
    cancelled: ['planned', 'done'], // allow retry or manual correction
    partial: ['in_progress', 'done', 'missed'],
};

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        const parsed = StatusTransitionSchema.safeParse(body);
        if (!parsed.success) {
            return apiError('Invalid request', 400, JSON.stringify(parsed.error.format()));
        }

        const { block_id, status, actual_start_time, actual_end_time, notes } = parsed.data;
        const userId = context.userId;
        if (!userId) return apiError('Unauthorized', 401);

        const supabase = context.supabase;

        // 1. Fetch existing block
        const { data: block, error: fetchError } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('id', block_id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !block) {
            return apiError('Block not found', 404);
        }

        // 2. Idempotency: if already in the requested status, return success immediately
        const currentStatus = block.status || 'planned';
        if (currentStatus === status) {
            return apiSuccess({
                success: true,
                block,
                transition: { from: currentStatus, to: status, idempotent: true },
            });
        }

        // 3. Validate transition
        const allowed = VALID_TRANSITIONS[currentStatus] || [];

        if (!allowed.includes(status)) {
            return apiError(
                `Cannot transition from "${currentStatus}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
                422
            );
        }

        // 3. Build update payload
        const updates: Record<string, any> = { status };

        if (actual_start_time) updates.actual_start_time = actual_start_time;
        if (actual_end_time) updates.actual_end_time = actual_end_time;

        // Auto-set actual times
        if (status === 'in_progress' && !actual_start_time) {
            const now = new Date();
            updates.actual_start_time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
        if ((status === 'done' || status === 'partial') && !actual_end_time) {
            const now = new Date();
            updates.actual_end_time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }

        // 4. Perform update
        const { data: updated, error: updateError } = await supabase
            .from('schedule_blocks')
            .update(updates)
            .eq('id', block_id)
            .eq('user_id', userId)
            .select()
            .single();

        if (updateError) {
            console.error('[block-status] Update failed:', updateError);
            return apiError('Failed to update block status', 500);
        }

        return apiSuccess({
            success: true,
            block: updated,
            transition: { from: currentStatus, to: status },
        });
    },
    { requireAuth: true }
);
