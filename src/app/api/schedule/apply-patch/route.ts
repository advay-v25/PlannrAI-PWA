
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { patch, scope } = body as { patch: { ops: any[], reason?: string }, scope: 'day' | 'week' };

        if (!patch || !patch.ops || !Array.isArray(patch.ops)) {
            return apiError('Invalid patch format', 400);
        }

        console.log(`[ApplyPatch] applying ${patch.ops.length} ops for ${userId}. Reason: ${patch.reason}`);

        const results: any[] = [];
        const errors: any[] = [];

        // 1. Determine affected date range to create a backup snapshot
        const affectedDates = new Set<string>();
        patch.ops.forEach(op => {
            if (op.event?.date) affectedDates.add(op.event.date);
            if (op.payload?.date) affectedDates.add(op.payload.date);
            // Ideally we'd look up existing blocks for updates/deletes to find their dates, 
            // but for MVP performance, we might skip precise date lookup or rely on provided context.
            // If the scope is provided, we can fallback to today/this week.
        });

        // Fallback if no dates found in ops (e.g. only updates by ID)
        if (affectedDates.size === 0) {
            const today = new Date().toISOString().split('T')[0];
            affectedDates.add(today);
        }

        const datesArray = Array.from(affectedDates).sort();
        const minDate = datesArray[0];
        const maxDate = datesArray[datesArray.length - 1];

        // 2. Create Backup (Version)
        const { data: currentBlocks, error: fetchError } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', minDate)
            .lte('date', maxDate);

        if (!fetchError && currentBlocks) {
            await supabase.from('schedule_versions').insert({
                user_id: userId,
                scope: scope || 'day',
                week_start: minDate, // Approximation
                snapshot: currentBlocks,
                source: 'pre_patch_backup',
                is_active: false
            });
        }

        // 3. Apply Operations
        for (const op of patch.ops) {
            try {
                // --- CREATE ---
                if (['create', 'create_event', 'create_block'].includes(op.op)) {
                    const event = op.event || op.payload;
                    if (!event) continue;

                    const blockType = event.block_type || 'adhoc';
                    // Allow 'task', 'focus', etc. to map to 'adhoc' or keep as is if DB supports allowed types
                    // Constraints: 'anchor', 'meal', 'habit_stack', 'goal', 'adhoc'
                    // If DB has check constraint, we might need mapping.
                    // Assuming types in DB are flexible or we map 'task'->'adhoc', 'focus'->'goal' etc.

                    const { data: newBlock, error } = await supabase.from('schedule_blocks').insert({
                        user_id: userId,
                        date: event.date || new Date().toISOString().split('T')[0],
                        start_time: event.start || event.start_time,
                        end_time: event.end || event.end_time,
                        title: event.title,
                        block_type: blockType,
                        status: 'planned',
                        goal_id: event.meta?.goal_id || event.goal_id || null,
                        is_locked: event.is_locked || false,
                        is_fixed: event.is_fixed || false,
                    }).select().single();

                    if (error) throw error;
                    results.push({ op: 'create', status: 'success', id: newBlock.id });
                }

                // --- UPDATE ---
                else if (['update', 'update_event', 'update_block'].includes(op.op)) {
                    const eventId = op.event_id || op.id;
                    const fields = op.fields || op.payload;
                    if (!eventId || !fields) continue;

                    const { error } = await supabase.from('schedule_blocks')
                        .update(fields)
                        .eq('id', eventId)
                        .eq('user_id', userId); // Security check

                    if (error) throw error;
                    results.push({ op: 'update', status: 'success', id: eventId });
                }

                // --- MOVE ---
                else if (['move', 'move_event', 'move_block'].includes(op.op)) {
                    const eventId = op.event_id || op.id;
                    const { to_start, to_end, date } = op; // standard args

                    const updates: any = {};
                    if (to_start) updates.start_time = to_start;
                    if (to_end) updates.end_time = to_end;
                    if (date) updates.date = date;

                    if (eventId && Object.keys(updates).length > 0) {
                        const { error } = await supabase.from('schedule_blocks')
                            .update(updates)
                            .eq('id', eventId)
                            .eq('user_id', userId);
                        if (error) throw error;
                        results.push({ op: 'move', status: 'success', id: eventId });
                    }
                }

                // --- DELETE ---
                else if (['delete', 'delete_event', 'delete_block'].includes(op.op)) {
                    const eventId = op.event_id || op.id;
                    if (!eventId) continue;

                    const { error } = await supabase.from('schedule_blocks')
                        .delete()
                        .eq('id', eventId)
                        .eq('user_id', userId);
                    if (error) throw error;
                    results.push({ op: 'delete', status: 'success', id: eventId });
                }

                // --- CREATE HABIT STACK ---
                else if (op.op === 'create_habit_stack') {
                    const { name, steps, preferred_window, schedule_now } = op.payload || op;
                    // 1. Insert Stack
                    const { data: stack, error: stackError } = await supabase.from('habit_stacks').insert({
                        user_id: userId,
                        name,
                        steps, // stored as jsonb
                        preferred_window: preferred_window || 'morning',
                        enabled: true
                    }).select().single();

                    if (stackError) throw stackError;

                    // 2. Schedule Now?
                    if (schedule_now) {
                        // TODO: Calculate time based on window or use current time
                        // For MVP, skip auto-schedule logic here, or add a simple block
                    }
                    results.push({ op: 'create_habit_stack', status: 'success', id: stack.id });
                }

                // --- UPDATE GOAL ---
                else if (op.op === 'update_goal') {
                    const goalId = op.goal_id || op.id;
                    const fields = op.fields || op.payload;
                    if (goalId && fields) {
                        const { error } = await supabase.from('goals')
                            .update(fields)
                            .eq('id', goalId)
                            .eq('user_id', userId);
                        if (error) throw error;
                        results.push({ op: 'update_goal', status: 'success', id: goalId });
                    }
                }

            } catch (err: any) {
                console.error(`Op failed: ${op.op}`, err);
                errors.push({ op: op.op, error: err.message });
            }
        }

        return apiSuccess({
            applied: results.length,
            results,
            errors,
            version_scope: scope
        });
    },
    { requireAuth: true, auditAction: 'apply_patch' }
);
