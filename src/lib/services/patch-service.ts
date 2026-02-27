import { SupabaseClient } from '@supabase/supabase-js';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';

// --- Patch Op Types ---

export type PatchOpType =
    | 'create' | 'create_event'
    | 'update' | 'update_event'
    | 'delete' | 'delete_event'
    | 'move' | 'move_event'
    | 'update_goal'
    | 'update_settings'
    | 'create_anchor'
    | 'delete_anchor';

export interface PatchOp {
    op: PatchOpType;
    event_id?: string;
    goal_id?: string;
    anchor_id?: string;
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

        // 1. Calculate Inverse Patch (BEFORE applying) — for undo support
        let inversePatch: any = { ops: [] };
        try {
            inversePatch = await this.calculateInversePatch(userId, patch, supabase);
        } catch (invErr: any) {
            console.warn('[PatchService] Inverse patch calc failed (undo will be unavailable):', invErr.message);
        }

        // 2. Execute Operations
        for (const op of patch.ops) {
            try {
                await this.executeOp(userId, op, supabase);
                changes++;
            } catch (e: any) {
                errors.push(`${op.op}: ${e.message}`);
                console.error(`[PatchService] Op failed:`, op.op, e.message);
            }
        }

        if (changes === 0) {
            return { success: false, undo_token: null, changes: 0, errors };
        }

        // 3. Store Undo Token
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
            console.error('[PatchService] Undo failed: Patch not found');
            return { success: false, changes: 0 };
        }

        if (!run.applied) {
            console.warn('[PatchService] Patch already undone');
            return { success: false, changes: 0 };
        }

        const inverse = run.inverse_patch as Patch;
        let changes = 0;

        // 2. Apply Inverse
        for (const op of inverse.ops) {
            try {
                await this.executeOp(userId, op, supabase);
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

        return { success: true, changes };
    }

    // --- Internal Op Execution ---

    private static async executeOp(userId: string, op: PatchOp, supabase: SupabaseClient) {
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
                    block_type: event.block_type || 'task',
                    is_focus: event.is_focus || false,
                    pillar: event.pillar || null,
                    goal_id: event.goal_id || null,
                };

                // Generate ID if provided (for reliable undo)
                if (event.id) insertData.id = event.id;

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

            default:
                console.warn(`[PatchService] Unknown op: ${operation}`);
        }
    }

    // --- Inverse Calculation ---

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

        let currentBlocks: Record<string, any> = {};
        let currentAnchors: Record<string, any> = {};

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
            }
        }

        return {
            ops: inverseOps,
            scope: patch.scope,
            reason: `Undo: ${patch.reason || 'applied patch'}`
        };
    }
}
