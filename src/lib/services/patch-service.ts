import { createClient } from '@/lib/supabase/server';
import { Patch, PatchOpSchema } from '@/lib/ai/schemas';
import { z } from 'zod';

type PatchOp = z.infer<typeof PatchOpSchema>;

export class PatchService {
    /**
     * Apply a patch transactionally (as much as possible)
     * Snapshots schedule if calendar is touched.
     * Computes inverse patch for non-calendar entities.
     */
    static async applyPatch(userId: string, patch: Patch, source: string = 'ai_assist', requestId?: string) {
        if (requestId) console.log(`[PatchService] [${requestId}] Applying patch from ${source}`);
        const supabase = await createClient();
        const results = {
            created: [] as string[],
            updated: [] as string[],
            deleted: [] as string[],
            errors: [] as string[],
        };

        const inverseOps: PatchOp[] = [];
        let scheduleVersionId: string | null = null;
        const today = new Date().toISOString().split('T')[0];

        // 1. Check if calendar is touched -> Snapshot Schedule
        const touchesCalendar = patch.ops.some(op =>
            ['create_event', 'move_event', 'update_event', 'delete_event'].includes(op.op)
        );

        if (touchesCalendar) {
            try {
                const { data: currentBlocks } = await supabase
                    .from('schedule_blocks')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('date', today);

                if (currentBlocks && currentBlocks.length > 0) {
                    const { data: version } = await supabase
                        .from('schedule_versions')
                        .insert({
                            user_id: userId,
                            week_start: today, // Using today as key for daily snapshots
                            source: source,
                            snapshot: currentBlocks,
                            active: true
                        })
                        .select('id')
                        .single();
                    scheduleVersionId = version?.id || null;
                }
            } catch (e) {
                console.warn('[PatchService] Snapshot failed:', e);
            }
        }

        // 2. Apply Ops
        for (const op of patch.ops) {
            try {
                if (op.op === 'create_event') {
                    // Normalize payload
                    const payload = op.payload || {};
                    const evt = {
                        user_id: userId,
                        date: payload.date || today,
                        start_time: payload.start_time,
                        end_time: payload.end_time,
                        title: payload.title || 'New Task',
                        block_type: payload.block_type || 'task',
                        goal_id: payload.goal_id || null,
                        status: 'planned',
                        is_fixed: false
                    };
                    const { data, error } = await supabase.from('schedule_blocks').insert(evt).select('id').single();
                    if (error) throw error;
                    if (data) {
                        results.created.push(data.id);

                        // Link habit instance if specified
                        if (payload.habit_stack_id) {
                            try {
                                await supabase.from('habit_instances').upsert({
                                    habit_stack_id: payload.habit_stack_id,
                                    user_id: userId,
                                    schedule_block_id: data.id,
                                    date: evt.date || today,
                                    status: 'pending'
                                }, { onConflict: 'habit_stack_id,date' });
                            } catch (e) {
                                console.warn('[PatchService] Failed to link habit instance:', e);
                            }
                        }
                    }

                } else if (op.op === 'move_event') {
                    const { event_id, to_start, to_end } = op;
                    const { error } = await supabase.from('schedule_blocks').update({
                        start_time: to_start,
                        end_time: to_end,
                    }).eq('id', event_id).eq('user_id', userId);

                    if (error) throw error;
                    results.updated.push(event_id);

                } else if (op.op === 'update_event') {
                    const { event_id, fields } = op;
                    const { error } = await supabase.from('schedule_blocks').update(fields)
                        .eq('id', event_id).eq('user_id', userId);

                    if (error) throw error;
                    results.updated.push(event_id);

                } else if (op.op === 'delete_event') {
                    const { event_id } = op;
                    const { error } = await supabase.from('schedule_blocks').delete()
                        .eq('id', event_id).eq('user_id', userId);

                    if (error) throw error;
                    results.deleted.push(event_id);

                } else if (op.op === 'update_goal') {
                    const { goal_id, fields } = op;
                    // Read for inverse
                    const { data: oldGoal } = await supabase.from('goals').select('*').eq('id', goal_id).single();
                    if (oldGoal) {
                        const undoFields: any = {};
                        Object.keys(fields).forEach(k => undoFields[k] = oldGoal[k]);
                        inverseOps.push({ op: 'update_goal', goal_id, fields: undoFields });
                    }

                    const { error } = await supabase.from('goals').update(fields).eq('id', goal_id).eq('user_id', userId);
                    if (error) throw error;
                    results.updated.push(goal_id);

                } else if (op.op === 'create_habit_stack') {
                    const { name, steps, preferred_window, schedule_now, trigger, action, duration } = (op as any).payload || op; // Support both payload and flat op

                    // Map steps to Trigger/Action (Tiny Habits Model)
                    let triggerText = trigger || '';
                    let actionText = action || '';
                    let actionDuration = duration || 2;

                    if (steps && Array.isArray(steps) && steps.length > 0) {
                        triggerText = steps[0]?.title || triggerText;
                        // Combine remaining steps into action
                        if (steps.length > 1) {
                            actionText = steps.slice(1).map((s: any) => s.title).join(' + ');
                            actionDuration = steps.slice(1).reduce((acc: number, s: any) => acc + (s.minutes || 0), 0) || 2;
                        }
                    }

                    const { data: stack, error } = await supabase.from('habit_stacks').insert({
                        user_id: userId,
                        trigger_habit: triggerText, // Map to DB column
                        action_habit: actionText,   // Map to DB column
                        action_duration_mins: actionDuration,
                        time_of_day: preferred_window || 'anytime',
                        // Store the name perhaps in trigger or action if needed? 
                        // The DB has no 'name' column? Let me check types again.
                        // It does NOT have 'name'. 
                        // I will prepend Name to Trigger if it's distinct?
                        // Or just rely on trigger/action.
                    }).select('id').single();

                    if (error) throw error;
                    if (stack) {
                        results.created.push(stack.id);
                        inverseOps.push({ op: 'delete_habit_stack', stack_id: stack.id });
                    }

                } else if (op.op === 'update_habit_stack') {
                    const { stack_id, fields } = op;
                    const { data: oldStack } = await supabase.from('habit_stacks').select('*').eq('id', stack_id).single();
                    if (oldStack) {
                        const undoFields: any = {};
                        Object.keys(fields).forEach(k => undoFields[k] = oldStack[k]);
                        inverseOps.push({ op: 'update_habit_stack', stack_id, fields: undoFields });
                    }

                    const { error } = await supabase.from('habit_stacks').update(fields).eq('id', stack_id).eq('user_id', userId);
                    if (error) throw error;
                    results.updated.push(stack_id);

                } else if (op.op === 'delete_habit_stack') {
                    const { stack_id } = op;
                    // Read for inverse (restore)
                    const { data: oldStack } = await supabase.from('habit_stacks').select('*').eq('id', stack_id).single();
                    if (oldStack) {
                        // Inverse isn't perfect but allows restore. We'd map fields back to create.
                        // Simplified: just store ID if we had soft delete, but for hard delete we lose data unless we store full object.
                        // For MVP: hard delete, no undo for habit deletion unless specific inverse logic added.
                    }

                    const { error } = await supabase.from('habit_stacks').delete().eq('id', stack_id).eq('user_id', userId);
                    if (error) throw error;
                    results.deleted.push(stack_id);

                } else if (op.op === 'create_anchor') {
                    const { title, start_time, end_time, days_of_week } = op;
                    const { data: anchor, error } = await supabase.from('anchors').insert({
                        user_id: userId,
                        title,
                        start_time,
                        end_time,
                        days_of_week,
                        is_fixed: true
                    }).select('id').single();

                    if (error) throw error;
                    if (anchor) {
                        results.created.push(anchor.id);
                        inverseOps.push({ op: 'delete_anchor', anchor_id: anchor.id });
                    }

                } else if (op.op === 'delete_anchor') {
                    const { anchor_id } = op;
                    const { error } = await supabase.from('anchors').delete().eq('id', anchor_id).eq('user_id', userId);
                    if (error) throw error;
                    results.deleted.push(anchor_id);
                }

            } catch (err: any) {
                console.error(`[PatchService] Op failed: ${op.op}`, err);
                results.errors.push(`${op.op}: ${err.message}`);
            }
        }

        // 3. Log Run
        // We only log if there's something to undo
        if (scheduleVersionId || inverseOps.length > 0) {
            try {
                await supabase.from('patch_runs').insert({
                    user_id: userId,
                    source,
                    patch: patch,
                    inverse_patch: { ops: inverseOps, undoable: true },
                    schedule_version_id: scheduleVersionId
                });
            } catch (e) {
                console.error('[PatchService] Failed to log run:', e);
            }
        }

        // 4. Return updated block view
        // Only fetch if touched calendar
        let updatedBlocks = [];
        if (touchesCalendar) {
            const { data } = await supabase
                .from('schedule_blocks')
                .select('*, goal:goals(*)')
                .eq('user_id', userId)
                .eq('date', today)
                .order('start_time', { ascending: true });
            updatedBlocks = data || [];
        }

        return { success: true, results, updatedBlocks, versionId: scheduleVersionId };
    }

    /**
     * Undo the last patch run
     */
    static async undoLast(userId: string) {
        const supabase = await createClient();

        // 1. Get last run
        const { data: lastRun } = await supabase
            .from('patch_runs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!lastRun) return { success: false, message: 'Nothing to undo' };

        // 2. Restore Schedule if versioned
        if (lastRun.schedule_version_id) {
            const { data: version } = await supabase
                .from('schedule_versions')
                .select('*')
                .eq('id', lastRun.schedule_version_id)
                .single();

            if (version && version.snapshot) {
                // Wipe today
                const today = version.week_start;
                await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today).neq('is_fixed', true);

                // Restore
                const blocksToRestore = (version.snapshot as any[]).map(b => ({
                    user_id: userId,
                    date: b.date,
                    start_time: b.start_time,
                    end_time: b.end_time,
                    title: b.title,
                    block_type: b.block_type,
                    status: b.status,
                    goal_id: b.goal_id,
                    context: b.context,
                    is_fixed: b.is_fixed
                }));

                if (blocksToRestore.length > 0) {
                    await supabase.from('schedule_blocks').insert(blocksToRestore);
                }
            }
        }

        // 3. Apply Inverse Patch (for non-schedule stuff)
        if (lastRun.inverse_patch) {
            const inverse = lastRun.inverse_patch as Patch;
            if (inverse.ops && inverse.ops.length > 0) {
                // Apply operations manually to avoid recursion or creating new undo logs for undo actions
                for (const op of inverse.ops) {
                    try {
                        if (op.op === 'update_goal') {
                            await supabase.from('goals').update(op.fields).eq('id', op.goal_id).eq('user_id', userId);
                        } else if (op.op === 'delete_habit_stack') {
                            await supabase.from('habit_stacks').delete().eq('id', op.stack_id).eq('user_id', userId);
                        } else if (op.op === 'update_habit_stack') {
                            await supabase.from('habit_stacks').update(op.fields).eq('id', op.stack_id).eq('user_id', userId);
                        } else if (op.op === 'delete_anchor') {
                            await supabase.from('anchors').delete().eq('id', op.anchor_id).eq('user_id', userId);
                        }
                    } catch (e) {
                        console.error('[PatchService] Undo op failed:', e);
                    }
                }
            }
        }

        // 4. Delete the run (pop from stack)
        await supabase.from('patch_runs').delete().eq('id', lastRun.id);

        // Terminate any version if we restored it? 
        // We just restored the snapshot blocks. The version record itself can stay or strictly speaking we should mark it used.
        // But deleting patch_run is good enough to prevent double-undo of the same action.

        // Return updated blocks
        const today = new Date().toISOString().split('T')[0];
        const { data: updatedBlocks } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(*)')
            .eq('user_id', userId)
            .eq('date', today)
            .order('start_time', { ascending: true });

        return { success: true, updatedBlocks };
    }
}
