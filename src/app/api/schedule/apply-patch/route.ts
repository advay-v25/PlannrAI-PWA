
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { patch } = body as { patch: { ops: any[], reason?: string } };

        if (!patch || !patch.ops || !Array.isArray(patch.ops)) {
            return apiError('Invalid patch format', 400);
        }

        console.log(`[ApplyPatch] applying ${patch.ops.length} ops for ${userId}. Reason: ${patch.reason}`);

        const results = [];
        const errors = [];

        // Transaction simulation (Supabase doesn't support easy multi-table transactions via JS client without RPC, 
        // so we execute sequentially and collect results. For critical data, RPC is better, but MVP assumes success).

        for (const op of patch.ops) {
            try {
                if (op.op === 'create' || op.op === 'create_event') {
                    // Normalize payload
                    const event = op.event || op.payload; // Support both formats
                    if (!event) continue;

                    // If it's a schedule block
                    if (!event.block_type || ['task', 'focus', 'break', 'habit', 'routine'].includes(event.block_type)) {
                        const { data, error } = await supabase.from('schedule_blocks').insert({
                            user_id: userId,
                            date: event.date || new Date().toISOString().split('T')[0], // Default to today if missing? Or should be provided.
                            start_time: event.start || event.start_time,
                            end_time: event.end || event.end_time,
                            title: event.title,
                            block_type: event.block_type || 'task',
                            status: 'planned',
                            goal_id: event.meta?.goal_id || null, // Optional link
                            is_locked: event.is_locked || false,
                        }).select();
                        if (error) throw error;
                        results.push({ op: 'create', status: 'success', id: data[0].id });
                    }
                }
                else if (op.op === 'update' || op.op === 'update_event') {
                    const { event_id, fields, payload } = op;
                    const updateData = fields || payload;

                    const { error } = await supabase.from('schedule_blocks')
                        .update(updateData)
                        .eq('id', event_id)
                        .eq('user_id', userId);
                    if (error) throw error;
                    results.push({ op: 'update', status: 'success', id: event_id });
                }
                else if (op.op === 'delete' || op.op === 'delete_event') {
                    const { event_id } = op;
                    const { error } = await supabase.from('schedule_blocks')
                        .delete()
                        .eq('id', event_id)
                        .eq('user_id', userId);
                    if (error) throw error;
                    results.push({ op: 'delete', status: 'success', id: event_id });
                }
                else if (op.op === 'create_habit_stack') {
                    // Logic to create a habit stack AND potentially blocks
                    const { name, steps, preferred_window, schedule_now } = op.payload;

                    // 1. Create Stack
                    const { data: stack, error: stackError } = await supabase.from('habit_stacks').insert({
                        user_id: userId,
                        name,
                        steps,
                        preferred_window: preferred_window || 'morning',
                        enabled: true
                    }).select().single();

                    if (stackError) throw stackError;

                    // 2. Schedule Now? (Optional)
                    if (schedule_now) {
                        // logic to Insert block
                    }
                    results.push({ op: 'create_habit_stack', status: 'success', id: stack.id });
                }
                else if (op.op === 'update_goal') {
                    const { goal_id, fields } = op;
                    const { error } = await supabase.from('goals')
                        .update(fields)
                        .eq('id', goal_id)
                        .eq('user_id', userId);
                    if (error) throw error;
                    results.push({ op: 'update_goal', status: 'success', id: goal_id });
                }

            } catch (err: any) {
                console.error(`Op failed: ${op.op}`, err);
                errors.push({ op: op.op, error: err.message });
            }
        }

        return apiSuccess({
            applied: results.length,
            results,
            errors
        });
    },
    { requireAuth: true, auditAction: 'apply_patch' }
);
