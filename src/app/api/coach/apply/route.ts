
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { patch, optionId } = body as { patch: any, optionId?: string };
        const { userId } = context;

        if (!patch || !patch.ops) return apiError("Invalid patch", 400);

        // 1. Apply Patch via Schedule Engine
        // We reuse the existing patch endpoint logic via API call for consistency.
        // Or better yet, we can't easily call our own API from here with auth token easily.
        // But for "Apply", we might need to.
        // Actually, the client could call `apply-patch` directly, but we want to log the "Decision".

        try {
            // Log decision to coach_audit or message update?
            // Let's mark the message option as selected? 
            // For now, just logging.

            // EXECUTE PATCH
            // We need to use the `schedule/apply-patch` logic.
            // Since we are server-side, we should extract the logic or call DB directly?
            // The `apply-patch` logic is complex (undo versions).
            // Let's use the DB directly for MVP speed, mirroring `weekly-review/apply`.

            const supabase = await createClient();
            const ops = patch.ops;

            for (const op of ops) {
                if (op.op === 'create_event' || op.op === 'create_block') {
                    const payload = op.payload || op.event; // handle both schemas
                    await supabase.from('schedule_blocks').insert({
                        user_id: userId,
                        ...payload,
                        status: payload.status || 'planned',
                        title: payload.title || "New Block"
                    });
                } else if (op.op === 'move_event' || op.op === 'move') {
                    await supabase.from('schedule_blocks').update({
                        start_time: op.to_start || op.start_time,
                        end_time: op.to_end || op.end_time,
                        date: op.date
                    }).eq('id', op.event_id);
                } else if (op.op === 'update_event' || op.op === 'update') {
                    await supabase.from('schedule_blocks').update(op.fields).eq('id', op.event_id);
                } else if (op.op === 'delete_event' || op.op === 'delete') {
                    await supabase.from('schedule_blocks').delete().eq('id', op.event_id);
                }
            }

            return apiSuccess({ success: true, applied_ops: ops.length });

        } catch (e: any) {
            console.error("Coach Apply failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
