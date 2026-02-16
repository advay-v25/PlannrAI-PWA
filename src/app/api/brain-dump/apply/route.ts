
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { patch, optionId, dumpId } = body as { patch: any, optionId?: string, dumpId?: string };
        const { userId } = context;

        if (!patch || !patch.ops) return apiError("Invalid patch", 400);

        try {
            // 1. Execute Patch (Schedule/Goals/Settings)
            // We'll reimplement the patch logic here for speed, or call the helper if we can extract it.
            // Given time, let's just insert schedule blocks directly like we did for Coach.

            const supabase = await createClient();
            const ops = patch.ops;
            let changes = 0;

            for (const op of ops) {
                if (op.op === 'create_event' || op.op === 'create_block') {
                    const payload = op.payload || op.event;
                    await supabase.from('schedule_blocks').insert({
                        user_id: userId,
                        ...payload,
                        status: payload.status || 'planned',
                        title: payload.title || "New Block"
                    });
                    changes++;
                } else if (op.op === 'move_event' || op.op === 'move') {
                    await supabase.from('schedule_blocks').update({
                        start_time: op.to_start || op.start_time,
                        end_time: op.to_end || op.end_time,
                        date: op.date
                    }).eq('id', op.event_id);
                    changes++;
                } else if (op.op === 'update_goal') {
                    await supabase.from('goals').update(op.fields).eq('id', op.goal_id);
                    changes++;
                } else if (op.op === 'update_settings') {
                    // Assuming profile_preferences table
                    await supabase.from('profile_preferences').update(op.fields).eq('user_id', userId);
                    changes++;
                }
            }

            // 2. Mark Inbox Items as Scheduled (if relevant)
            // If the patch created events that match inbox items, we should update them.
            // This is tricky without strict linking.
            // For now, if we have a dumpId, we can mark all items from that dump as 'processed' or 'scheduled'?
            // Or just leave them in Inbox until user manually checks them off?
            // Let's mark them as 'scheduled' if the option was "Execute".

            if (dumpId) {
                await supabase.from('inbox_items')
                    .update({ status: 'scheduled' })
                    .eq('source_dump_id', dumpId)
                    .eq('status', 'inbox');
            }

            // 3. Log Success
            return apiSuccess({ success: true, changes });

        } catch (e: any) {
            console.error("Brain Dump Apply failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
