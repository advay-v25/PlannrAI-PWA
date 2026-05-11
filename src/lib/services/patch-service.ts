import { SupabaseClient } from '@supabase/supabase-js';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';

// --- Patch Op Types ---

export type PatchOpType =
    | 'create' | 'create_event'
    | 'update' | 'update_event'
    | 'delete' | 'delete_event'
    | 'move' | 'move_event'
    | 'create_goal'
    | 'update_goal'
    | 'delete_goal'
    | 'update_settings'
    | 'create_anchor'
    | 'delete_anchor'
    | 'create_todo'
    | 'update_todo'
    | 'delete_todo';

export interface PatchOp {
    op: PatchOpType;
    event_id?: string;
    goal_id?: string;
    anchor_id?: string;
    todo_id?: string;
    event?: any;
    payload?: any;
    fields?: Record<string, any>;
    to_start?: string;
    to_end?: string;
    // create_anchor fields
    title?: string;
    start_time?: string;
    end_time?: string;
    days_of_week?: number[];
    date?: string;
}

export interface Patch {
    ops: PatchOp[];
    undoable?: boolean;
    reason?: string;
    scope?: 'day' | 'week';
    snapshot_requested?: boolean;
}


export interface PatchResult {
    success: boolean;
    undo_token: string | null;
    changes: number;
    errors: string[];
}

// --- Unified Patch Service ---

export class PatchService {

    /**
     * Apply a patch to the calendar/goals/settings.
     * Returns undo_token for reversal.
     */
    static async applyPatch(
        userId: string,
        patch: Patch,
        supabase: SupabaseClient,
        source: string = 'ai'
    ): Promise<PatchResult> {
        let errors: string[] = [];
        let changes = 0;

        // 0. Pre-Flight Validation via Engine (Deterministic Check)
        // Skip for coach patches — AI may generate approximate block IDs that fail lookup
        if (source !== 'coach') {
            try {
                const validation = await CalendarEngine.validatePatch(userId, patch, supabase);
                if (!validation.valid) {
                    console.error(`[PatchService] Pre-flight validation failed:`, validation.errors);
                    return { success: false, undo_token: null, changes: 0, errors: validation.errors };
                }
            } catch (validateErr: any) {
                // Don't crash if validation itself fails — proceed with ops
                console.warn('[PatchService] Validation check failed, proceeding:', validateErr.message);
            }
        }

        // 1. Create Snapshot (BEFORE applying) — for full-scope undo
        let versionId: string | null = null;

        if (patch.scope === 'week' || patch.snapshot_requested) {
            try {
                const snapshot = await this.createSnapshot(userId, patch, supabase);
                versionId = snapshot.id;
            } catch (snapErr: any) {
                console.warn('[PatchService] Snapshot failed:', snapErr.message);
            }
        }

        // 2. Calculate pre-execution state for inverse patch
        // We need to capture the CURRENT state of blocks that will be modified/deleted/moved
        // BEFORE executing, so we can revert them.
        let preExecState: Record<string, any> = {};
        try {
            const touchedEventIds = patch.ops
                .filter(op => op.event_id)
                .map(op => op.event_id as string);
            if (touchedEventIds.length > 0) {
                const { data } = await supabase
                    .from('schedule_blocks')
                    .select('*')
                    .in('id', touchedEventIds)
                    .eq('user_id', userId);
                if (data) {
                    preExecState = data.reduce((acc: any, block: any) => ({ ...acc, [block.id]: block }), {});
                }
            }
            const touchedGoalIds = patch.ops
                .filter(op => op.goal_id)
                .map(op => op.goal_id as string);
            if (touchedGoalIds.length > 0) {
                const { data } = await supabase
                    .from('goals')
                    .select('*')
                    .in('id', touchedGoalIds)
                    .eq('user_id', userId);
                if (data) {
                    preExecState = data.reduce((acc: any, goal: any) => ({ ...acc, [goal.id]: goal }), preExecState);
                }
            }
        } catch (e: any) {
            console.warn('[PatchService] Pre-exec state fetch failed:', e.message);
        }

        // 3. Execute Operations
        for (const op of patch.ops) {
            try {
                await this.executeOp(userId, op, supabase, source);
                changes++;
            } catch (e: any) {
                errors.push(`${op.op}: ${e.message}`);
                console.error(`[PatchService] Op failed:`, op.op, e.message);
            }
        }

        if (changes === 0) {
            return { success: false, undo_token: null, changes: 0, errors };
        }

        // 4. Calculate Inverse Patch AFTER execution
        // Now create_event ops have their generated IDs stored on op.event_id
        let inversePatch: Patch = { ops: [] };
        try {
            inversePatch = this.buildInversePatchFromOps(patch, preExecState);
        } catch (invErr: any) {
            console.warn('[PatchService] Inverse patch calc failed:', invErr.message);
        }

        // 5. Store Undo Token
        let undoToken: string | null = null;
        if (patch.undoable !== false) {
            try {
                const { data: run, error } = await supabase
                    .from('patch_runs')
                    .insert({
                        user_id: userId,
                        patch: patch as any,
                        inverse_patch: inversePatch as any,
                        applied: true,
                        source,
                        created_at: new Date().toISOString()
                    })
                    .select('id')
                    .single();

                if (error) {
                    console.error('[PatchService] Failed to store patch run:', error);
                } else {
                    undoToken = run.id;
                    console.log(`[PatchService] Undo token created: ${undoToken} with ${inversePatch.ops.length} inverse ops`);
                }
            } catch (e: any) {
                console.error('[PatchService] Undo storage failed:', e.message);
            }
        }

        return { success: true, undo_token: undoToken, changes, errors };
    }

    /**
     * Revert a specific patch by undo_token.
     */
    static async undoPatch(
        userId: string,
        undoToken: string,
        supabase: SupabaseClient
    ): Promise<{ success: boolean; changes: number }> {
        // 1. Fetch the run
        const { data: run, error } = await supabase
            .from('patch_runs')
            .select('*')
            .eq('id', undoToken)
            .eq('user_id', userId)
            .single();

        if (error || !run) {
            console.error('[PatchService] Undo failed: Patch not found for token:', undoToken);
            return { success: false, changes: 0 };
        }

        if (!run.applied) {
            console.warn('[PatchService] Undo skipped: patch already reverted');
            return { success: false, changes: 0 };
        }

        const inverse = run.inverse_patch as Patch;
        
        if (!inverse || !inverse.ops || inverse.ops.length === 0) {
            console.error('[PatchService] Undo failed: No inverse operations available');
            return { success: false, changes: 0 };
        }

        console.log(`[PatchService] Undoing patch ${undoToken} with ${inverse.ops.length} inverse ops`);
        let changes = 0;

        // 2. Apply Inverse
        for (const op of inverse.ops) {
            try {
                await this.executeOp(userId, op, supabase, 'undo');
                changes++;
            } catch (e: any) {
                console.error('[PatchService] Undo op failed:', op.op, e.message);
            }
        }

        // 3. Mark as reverted
        await supabase
            .from('patch_runs')
            .update({ applied: false })
            .eq('id', undoToken);

        console.log(`[PatchService] Undo complete: ${changes} ops reverted`);
        return { success: changes > 0, changes };
    }

    /**
     * Undo the most recent patch for a user
     */
    static async undoLast(userId: string, supabase: SupabaseClient): Promise<{ success: boolean; changes: number }> {
        const { data: lastRun } = await supabase
            .from('patch_runs')
            .select('id')
            .eq('user_id', userId)
            .eq('applied', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!lastRun) return { success: false, changes: 0 };
        return this.undoPatch(userId, lastRun.id, supabase);
    }

    /**
     * Record a coach action (increment conversation, update message)
     */
    static async recordCoachAction(
        userId: string,
        conversationId: string,
        optionId: string,
        patchRunId: string,
        supabase: SupabaseClient
    ) {
        // 1. Update the message
        await supabase
            .from('coach_messages')
            .update({
                selected_option_id: optionId,
                patch_version_id: patchRunId, // We use patchRunId as the undo token
                patch_applied_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1);

        // 2. Mark conversation as recently active (replaces non-existent increment_actions_taken RPC)
        try {
            await supabase
                .from('coach_conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);
        } catch {
            // Non-fatal
        }
    }


    /**
     * Create a full schedule snapshot in schedule_versions
     */
    private static async createSnapshot(userId: string, patch: Patch, supabase: SupabaseClient) {
        // Find relevant dates from operations
        const dates = new Set<string>();
        patch.ops.forEach(op => {
            if (op.date) dates.add(op.date);
            if (op.payload?.date) dates.add(op.payload.date);
            if (op.event?.date) dates.add(op.event.date);
        });

        const query = supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId);

        if (dates.size > 0 && dates.size < 10) {
            query.in('date', Array.from(dates));
        } else {
            // Default to ±1 week if dates are vague or too many
            const now = new Date();
            const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query.gte('date', start).lte('date', end);
        }

        const { data: blocks } = await query;

        const { data: version, error } = await supabase
            .from('schedule_versions')
            .insert({
                user_id: userId,
                week_start: new Date().toISOString().split('T')[0], // Placeholder
                snapshot: blocks || [],
                source: 'ai_optimize',
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (error) throw error;
        return { id: version.id };
    }

    /**
     * Restore schedule from a snapshot
     */
    private static async restoreFromSnapshot(userId: string, versionId: string, supabase: SupabaseClient): Promise<boolean> {
        const { data: version } = await supabase
            .from('schedule_versions')
            .select('snapshot')
            .eq('id', versionId)
            .eq('user_id', userId)
            .single();

        if (!version) return false;

        const snapshot = version.snapshot as any[];
        const dates = Array.from(new Set(snapshot.map(b => b.date)));

        if (dates.length > 0) {
            // 1. Clear existing for those dates
            await supabase
                .from('schedule_blocks')
                .delete()
                .eq('user_id', userId)
                .in('date', dates);
        }

        // 2. Insert snapshot (preserving IDs if possible, but careful with constraints)
        // We'll insert without IDs to avoid PK conflicts if they were already deleted
        const blocksToInsert = snapshot.map(b => {
            const { created_at, updated_at, ...rest } = b;
            return { ...rest, user_id: userId };
        });

        if (blocksToInsert.length > 0) {
            const { error } = await supabase.from('schedule_blocks').insert(blocksToInsert);
            if (error) {
                console.error('[PatchService] Restore insert failed:', error);
                return false;
            }
        }

        return true;
    }


    // --- Internal Op Execution ---

    private static async executeOp(userId: string, op: PatchOp, supabase: SupabaseClient, source: string = 'ai') {
        const operation = op.op;

        switch (operation) {
            case 'create':
            case 'create_event': {
                const event = op.event || op.payload || {};
                const insertData: any = {
                    user_id: userId,
                    title: event.title || 'New Block',
                    start_time: event.start_time || event.start || event.to_start,
                    end_time: event.end_time || event.end || event.to_end,
                    date: event.date || op.date || new Date().toISOString().split('T')[0],
                    status: event.status || 'planned',
                    block_type: ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'].includes(event.block_type) ? event.block_type : 'flex',
                    pillar: event.pillar || null,
                    goal_id: event.goal_id || null,
                    checklist: Array.isArray(event.checklist) ? event.checklist : null,
                    habit_stack_id: event.habit_stack_id || null,
                };

                // Generate ID if provided (for reliable undo)
                if (event.id) insertData.id = event.id;

                // DEDUPLICATION: Skip if identical block already exists
                const { data: existing } = await supabase
                    .from('schedule_blocks')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('title', insertData.title)
                    .eq('date', insertData.date)
                    .eq('start_time', insertData.start_time)
                    .eq('end_time', insertData.end_time)
                    .maybeSingle();

                if (existing) {
                    console.log(`[PatchService] Skipping duplicate block: "${insertData.title}" on ${insertData.date} ${insertData.start_time}-${insertData.end_time}`);
                    op.event_id = existing.id;
                    break;
                }

                // GOAL OVER-ALLOCATION ENFORCEMENT: Check daily goal minutes limit
                if (insertData.goal_id && insertData.block_type === 'goal') {
                    const timeToMin = (t: string) => {
                        const [h, m] = (t || '0:0').split(':').map(Number);
                        return (h || 0) * 60 + (m || 0);
                    };

                    // Fetch goal's daily limit
                    const { data: goalData } = await supabase
                        .from('goals')
                        .select('minutes_per_day')
                        .eq('id', insertData.goal_id)
                        .maybeSingle();

                    if (goalData) {
                        const dailyLimit = goalData.minutes_per_day || 60;

                        // Sum existing goal minutes for this day
                        const { data: existingGoalBlocks } = await supabase
                            .from('schedule_blocks')
                            .select('start_time, end_time')
                            .eq('user_id', userId)
                            .eq('goal_id', insertData.goal_id)
                            .eq('date', insertData.date);

                        const existingMins = (existingGoalBlocks || []).reduce((sum: number, b: any) => {
                            return sum + Math.max(0, timeToMin(b.end_time) - timeToMin(b.start_time));
                        }, 0);

                        const newBlockMins = Math.max(0, timeToMin(insertData.end_time) - timeToMin(insertData.start_time));

                        if (existingMins + newBlockMins > dailyLimit) {
                            console.log(`[PatchService] BLOCKED over-allocation: "${insertData.title}" on ${insertData.date} would be ${existingMins + newBlockMins}min (limit: ${dailyLimit}min/day)`);
                            break; // Skip this insert entirely
                        }
                    }
                }

                const { data, error } = await supabase
                    .from('schedule_blocks')
                    .insert(insertData)
                    .select('id')
                    .single();
                if (error) throw new Error(`Create failed: ${error.message}`);
                // Store the generated ID back on the op for inverse calculation
                if (data?.id && !event.id) {
                    op.event_id = data.id;
                }
                break;
            }

            case 'update':
            case 'update_event': {
                const id = op.event_id;
                const fields = op.fields || op.payload;
                if (!id) throw new Error('Update requires event_id');
                // Protect immutable blocks from modification
                const { data: existing } = await supabase
                    .from('schedule_blocks')
                    .select('block_type')
                    .eq('id', id)
                    .eq('user_id', userId)
                    .maybeSingle();
                const IMMUTABLE_TYPES = ['sleep', 'meal', 'wind_down', 'anchor'];
                if (existing && IMMUTABLE_TYPES.includes(existing.block_type) && source !== 'coach') {
                    console.log(`[PatchService] BLOCKED: Cannot modify immutable ${existing.block_type} block`);
                    break; // Skip silently rather than throwing
                }
                const { error } = await supabase
                    .from('schedule_blocks')
                    .update(fields)
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Update failed: ${error.message}`);
                break;
            }

            case 'delete':
            case 'delete_event': {
                if (!op.event_id) throw new Error('Delete requires event_id');
                // Protect immutable blocks from deletion (sleep, meal, wind_down, anchor)
                const { data: delTarget } = await supabase
                    .from('schedule_blocks')
                    .select('block_type')
                    .eq('id', op.event_id)
                    .eq('user_id', userId)
                    .maybeSingle();
                const IMMUTABLE_DEL = ['sleep', 'meal', 'wind_down', 'anchor'];
                if (delTarget && IMMUTABLE_DEL.includes(delTarget.block_type) && source !== 'coach') {
                    console.log(`[PatchService] BLOCKED: Cannot delete immutable ${delTarget.block_type} block`);
                    break; // Skip silently
                }
                const { error } = await supabase
                    .from('schedule_blocks')
                    .delete()
                    .eq('id', op.event_id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Delete failed: ${error.message}`);
                break;
            }

            case 'move':
            case 'move_event': {
                const id = op.event_id;
                const start = op.to_start || op.start_time;
                const end = op.to_end || op.end_time;
                if (!id || !start || !end) throw new Error('Move requires event_id, to_start, to_end');
                // Protect immutable blocks from being moved
                const { data: moveTarget } = await supabase
                    .from('schedule_blocks')
                    .select('block_type')
                    .eq('id', id)
                    .eq('user_id', userId)
                    .maybeSingle();
                const IMMUTABLE_MOVE = ['sleep', 'meal', 'wind_down', 'anchor'];
                if (moveTarget && IMMUTABLE_MOVE.includes(moveTarget.block_type) && source !== 'coach') {
                    console.log(`[PatchService] BLOCKED: Cannot move immutable ${moveTarget.block_type} block`);
                    break; // Skip silently
                }
                const updateData: any = { start_time: start, end_time: end };
                if (op.date) updateData.date = op.date;
                const { error } = await supabase
                    .from('schedule_blocks')
                    .update(updateData)
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Move failed: ${error.message}`);
                break;
            }
            case 'create_goal': {
                const payload = op.payload || {};
                const insertData: any = {
                    user_id: userId,
                    title: payload.title || 'New Goal',
                    pillar: payload.pillar || 'General',
                    minutes_per_day: payload.minutes_per_day || 60,
                    days_per_week: payload.days_per_week || 5,
                    weekly_target_minutes: (payload.minutes_per_day || 60) * (payload.days_per_week || 5),
                    is_active: true,
                    priority: 5,
                };
                const { data, error } = await supabase
                    .from('goals')
                    .insert(insertData)
                    .select('id')
                    .single();
                if (error) throw new Error(`Create goal failed: ${error.message}`);
                if (data?.id) op.goal_id = data.id;
                break;
            }

            case 'delete_goal': {
                const id = op.goal_id;
                if (!id) throw new Error('Delete goal requires goal_id');
                const { error } = await supabase
                    .from('goals')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Delete goal failed: ${error.message}`);
                break;
            }

            case 'update_goal': {
                const id = op.goal_id;
                const fields = op.fields || op.payload;
                if (!id) throw new Error('Update goal requires goal_id');
                const { error } = await supabase
                    .from('goals')
                    .update(fields)
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Update goal failed: ${error.message}`);
                break;
            }

            case 'update_settings': {
                const fields = op.fields || op.payload;
                const { error } = await supabase
                    .from('profile_preferences')
                    .update(fields)
                    .eq('user_id', userId);
                if (error) throw new Error(`Update settings failed: ${error.message}`);
                break;
            }

            case 'create_anchor': {
                const title = op.title || op.payload?.title;
                const startTime = op.start_time || op.payload?.start_time;
                const endTime = op.end_time || op.payload?.end_time;
                const daysOfWeek = op.days_of_week || op.payload?.days_of_week || [1, 2, 3, 4, 5];
                if (!title || !startTime || !endTime) throw new Error('Create anchor requires title, start_time, end_time');

                const { data, error } = await supabase
                    .from('commitments')
                    .insert({
                        user_id: userId,
                        title,
                        start_time: startTime,
                        end_time: endTime,
                        days_of_week: daysOfWeek,
                        is_active: true
                    })
                    .select('id')
                    .single();
                if (error) throw new Error(`Create anchor failed: ${error.message}`);
                if (data?.id) op.anchor_id = data.id;
                break;
            }

            case 'delete_anchor': {
                const anchorId = op.anchor_id;
                if (!anchorId) throw new Error('Delete anchor requires anchor_id');
                const { error } = await supabase
                    .from('commitments')
                    .delete()
                    .eq('id', anchorId)
                    .eq('user_id', userId);
                if (error) throw new Error(`Delete anchor failed: ${error.message}`);
                break;
            }

            case 'create_todo': {
                const payload = op.payload || {};
                const insertData: any = {
                    user_id: userId,
                    title: payload.title || 'New Task',
                    is_completed: false,
                    due_date: payload.due_date || null,
                    priority: payload.priority || 'medium',
                };
                const { data, error } = await supabase
                    .from('todos')
                    .insert(insertData)
                    .select('id')
                    .single();
                if (error) throw new Error(`Create todo failed: ${error.message}`);
                if (data?.id) op.todo_id = data.id;
                break;
            }

            case 'update_todo': {
                const id = op.todo_id;
                const fields = op.fields || op.payload;
                if (!id) throw new Error('Update todo requires todo_id');
                const { error } = await supabase
                    .from('todos')
                    .update(fields)
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Update todo failed: ${error.message}`);
                break;
            }

            case 'delete_todo': {
                if (!op.todo_id) throw new Error('Delete todo requires todo_id');
                const { error } = await supabase
                    .from('todos')
                    .delete()
                    .eq('id', op.todo_id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Delete todo failed: ${error.message}`);
                break;
            }

            default:
                console.warn(`[PatchService] Unknown op: ${operation}`);
        }
    }

    // --- Inverse Calculation ---

    /**
     * Build inverse patch from executed ops using pre-execution state.
     * This runs AFTER executeOp, so create_event ops have their generated IDs on op.event_id.
     */
    private static buildInversePatchFromOps(
        patch: Patch,
        preExecState: Record<string, any>
    ): Patch {
        const inverseOps: PatchOp[] = [];

        // Process in REVERSE order for correct undo sequence
        for (const op of [...patch.ops].reverse()) {
            const opType = op.op;

            if (opType === 'create' || opType === 'create_event') {
                // Inverse of Create = Delete the created block
                // After executeOp, op.event_id holds the generated ID
                const id = op.event_id;
                if (id) {
                    inverseOps.push({ op: 'delete_event', event_id: id });
                } else {
                    console.warn('[PatchService] Cannot undo create: no event_id captured');
                }
            } else if (opType === 'delete' || opType === 'delete_event') {
                // Inverse of Delete = Re-create the original block
                const original = preExecState[op.event_id!];
                if (original) {
                    const { created_at, updated_at, ...blockData } = original;
                    inverseOps.push({ op: 'create_event', event: blockData });
                }
            } else if (opType === 'update' || opType === 'update_event') {
                // Inverse of Update = Revert to original field values
                const original = preExecState[op.event_id!];
                if (original && op.fields) {
                    const revertFields: any = {};
                    for (const key of Object.keys(op.fields)) {
                        revertFields[key] = original[key];
                    }
                    inverseOps.push({ op: 'update_event', event_id: op.event_id, fields: revertFields });
                }
            } else if (opType === 'move' || opType === 'move_event') {
                // Inverse of Move = Move back to original position
                const original = preExecState[op.event_id!];
                if (original) {
                    inverseOps.push({
                        op: 'move_event',
                        event_id: op.event_id,
                        to_start: original.start_time,
                        to_end: original.end_time,
                        date: original.date
                    });
                }
            } else if (opType === 'create_todo') {
                const id = op.todo_id;
                if (id) {
                    inverseOps.push({ op: 'delete_todo', todo_id: id });
                }
            } else if (opType === 'create_goal') {
                const id = op.goal_id;
                if (id) {
                    inverseOps.push({ op: 'delete_goal', goal_id: id });
                }
            } else if (opType === 'delete_goal') {
                const original = preExecState[op.goal_id!];
                if (original) {
                    const { created_at, updated_at, ...goalData } = original;
                    // We can reuse 'create_goal' or update_goal depending on our inverse capabilities
                    // But our patch system doesn't directly support create_goal with a specific ID yet, 
                    // though insert allows it if we supply it. 
                    inverseOps.push({ op: 'create_goal', payload: goalData });
                }
            } else if (opType === 'update_goal') {
                const original = preExecState[op.goal_id!];
                if (original && op.fields) {
                    const revertFields: any = {};
                    for (const key of Object.keys(op.fields)) {
                        revertFields[key] = original[key];
                    }
                    inverseOps.push({ op: 'update_goal', goal_id: op.goal_id, fields: revertFields });
                }
            } else if (opType === 'delete_todo') {
                // We don't have pre-exec state for todos in this path,
                // so we'd need to extend preExecState. For now, skip.
                console.warn('[PatchService] Todo delete undo not fully supported yet');
            }
        }

        return {
            ops: inverseOps,
            scope: patch.scope,
            reason: `Undo: ${patch.reason || 'applied patch'}`
        };
    }

    private static async calculateInversePatch(
        userId: string,
        patch: Patch,
        supabase: SupabaseClient
    ): Promise<Patch> {
        const inverseOps: PatchOp[] = [];

        // Fetch current state of touched rows
        const touchedEventIds = patch.ops
            .filter(op => op.event_id)
            .map(op => op.event_id as string);

        const touchedAnchorIds = patch.ops
            .filter(op => op.anchor_id)
            .map(op => op.anchor_id as string);

        const touchedTodoIds = patch.ops
            .filter(op => op.todo_id)
            .map(op => op.todo_id as string);

        let currentBlocks: Record<string, any> = {};
        let currentAnchors: Record<string, any> = {};
        let currentTodos: Record<string, any> = {};

        if (touchedEventIds.length > 0) {
            const { data } = await supabase
                .from('schedule_blocks')
                .select('*')
                .in('id', touchedEventIds)
                .eq('user_id', userId);
            if (data) {
                currentBlocks = data.reduce((acc, block) => ({ ...acc, [block.id]: block }), {});
            }
        }

        if (touchedAnchorIds.length > 0) {
            const { data } = await supabase
                .from('commitments')
                .select('*')
                .in('id', touchedAnchorIds)
                .eq('user_id', userId);
            if (data) {
                currentAnchors = data.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});
            }
        }

        if (touchedTodoIds.length > 0) {
            const { data } = await supabase
                .from('todos')
                .select('*')
                .in('id', touchedTodoIds)
                .eq('user_id', userId);
            if (data) {
                currentTodos = data.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
            }
        }

        // Build Inverse Ops (in REVERSE order)
        for (const op of [...patch.ops].reverse()) {
            const opType = op.op;

            if (opType === 'create' || opType === 'create_event') {
                // Inverse of Create is Delete
                const id = op.event_id || op.event?.id || op.payload?.id;
                if (id) {
                    inverseOps.push({ op: 'delete_event', event_id: id });
                }
            } else if (opType === 'delete' || opType === 'delete_event') {
                // Inverse of Delete is Create (Restore)
                const original = currentBlocks[op.event_id!];
                if (original) {
                    inverseOps.push({ op: 'create_event', event: original });
                }
            } else if (opType === 'update' || opType === 'update_event') {
                // Inverse of Update is Update (Revert fields)
                const original = currentBlocks[op.event_id!];
                if (original && op.fields) {
                    const revertFields: any = {};
                    for (const key of Object.keys(op.fields)) {
                        revertFields[key] = original[key];
                    }
                    inverseOps.push({ op: 'update_event', event_id: op.event_id, fields: revertFields });
                }
            } else if (opType === 'move' || opType === 'move_event') {
                // Inverse of Move is Move (Back)
                const original = currentBlocks[op.event_id!];
                if (original) {
                    inverseOps.push({
                        op: 'move_event',
                        event_id: op.event_id,
                        to_start: original.start_time,
                        to_end: original.end_time,
                        date: original.date
                    });
                }
            } else if (opType === 'update_goal') {
                // For goals, we'd need to fetch original state — simplify for now
                inverseOps.push({ op: 'update_goal', goal_id: op.goal_id, fields: {} });
            } else if (opType === 'create_anchor') {
                const id = op.anchor_id;
                if (id) {
                    inverseOps.push({ op: 'delete_anchor', anchor_id: id });
                }
            } else if (opType === 'delete_anchor') {
                const original = currentAnchors[op.anchor_id!];
                if (original) {
                    inverseOps.push({
                        op: 'create_anchor',
                        title: original.title,
                        start_time: original.start_time,
                        end_time: original.end_time,
                        days_of_week: original.days_of_week,
                    });
                }
            } else if (opType === 'create_todo') {
                const id = op.todo_id;
                if (id) {
                    inverseOps.push({ op: 'delete_todo', todo_id: id });
                }
            } else if (opType === 'delete_todo') {
                const original = currentTodos[op.todo_id!];
                if (original) {
                    inverseOps.push({ 
                        op: 'create_todo', 
                        payload: {
                            title: original.title,
                            due_date: original.due_date,
                            priority: original.priority
                        } 
                    });
                }
            } else if (opType === 'update_todo') {
                const original = currentTodos[op.todo_id!];
                if (original && op.fields) {
                    const revertFields: any = {};
                    for (const key of Object.keys(op.fields)) {
                        revertFields[key] = original[key];
                    }
                    inverseOps.push({ op: 'update_todo', todo_id: op.todo_id, fields: revertFields });
                }
            }
        }

        return {
            ops: inverseOps,
            scope: patch.scope,
            reason: `Undo: ${patch.reason || 'applied patch'}`
        };
    }
}
