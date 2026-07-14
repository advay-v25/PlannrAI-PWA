import { SupabaseClient } from '@supabase/supabase-js';
import sanitizeHtml from 'sanitize-html';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { generateWeekPlan } from '@/lib/calendar/ai/plan-week';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import crypto from 'crypto';

// --- Patch Op Types ---

type PatchOpType =
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
    | 'delete_todo'
    | 'create_habit_stack'
    | 'update_habit_stack'
    | 'delete_habit_stack'
    | 'replan_week'
    | 'replan_day'
    | 'update_memory';

export interface PatchOp {
    op: PatchOpType;
    event_id?: string;
    goal_id?: string;
    anchor_id?: string;
    todo_id?: string;
    stack_id?: string;
    event?: any;
    payload?: any;
    fields?: Record<string, any>;
    to_start?: string;
    to_end?: string;
    date?: string;
    // create_anchor fields
    title?: string;
    start_time?: string;
    end_time?: string;
    days_of_week?: number[];
    // update_memory fields
    key?: string;
    value?: any;
    kind?: string;
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

    private static async validateGoalConstraints(userId: string, goalId: string | null, date: string, newBlockMins: number, excludeBlockId: string | null, supabase: SupabaseClient, source: string = 'ai') {
        if (!goalId) return;
        const timeToMin = (t: string) => {
            const [h, m] = (t || '0:0').split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        const { data: goalData } = await supabase.from('goals').select('minutes_per_day, days_per_week').eq('id', goalId).maybeSingle();
        if (!goalData) return;
        
        // Coach has Master Authority to bypass user goal limits if instructed
        if (source === 'coach') return;
        
        const dailyLimit = goalData.minutes_per_day || 60;
        const weeklyDaysLimit = goalData.days_per_week || 5;

        const { data: existingGoalBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, start_time, end_time, date')
            .eq('user_id', userId)
            .eq('goal_id', goalId);
            
        if (existingGoalBlocks) {
            const existingMins = existingGoalBlocks
                .filter((b: any) => b.date === date && b.id !== excludeBlockId)
                .reduce((sum: number, b: any) => sum + Math.max(0, timeToMin(b.end_time) - timeToMin(b.start_time)), 0);
            
            if (existingMins + newBlockMins > dailyLimit) {
                throw new Error(`Daily limit reached: ${existingMins + newBlockMins}min exceeds ${dailyLimit}min/day limit`);
            }

            const getWeekStart = (d: string) => {
                const dateObj = new Date(d);
                const day = dateObj.getDay();
                const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(dateObj.setDate(diff)).toISOString().split('T')[0];
            };
            const targetWeekStart = getWeekStart(date);
            const activeDays = new Set(
                existingGoalBlocks
                    .filter((b: any) => getWeekStart(b.date) === targetWeekStart && b.id !== excludeBlockId)
                    .map((b: any) => b.date)
            );
            if (newBlockMins > 0) activeDays.add(date);
            
            if (activeDays.size > weeklyDaysLimit) {
                throw new Error(`Weekly limit reached: cannot schedule on ${activeDays.size} days (limit is ${weeklyDaysLimit} days/week)`);
            }
        }
    }

    private static timeToMin(t: string): number {
        const [h, m] = (t || '0:0').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    private static minToTime(m: number): string {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:00`;
    }

    /**
     * Recursively resolves overlapping blocks by shifting them forward in time.
     * Throws an error if an immutable block is encountered or if shifting pushes past midnight.
     */
    private static async cascadeOverlaps(userId: string, date: string, blockId: string, sTime: string, eTime: string, supabase: SupabaseClient) {
        const newStart = this.timeToMin(sTime);
        const newEnd = this.timeToMin(eTime);
        
        // Find all blocks on this date
        const { data: blocks } = await supabase.from('schedule_blocks').select('*').eq('user_id', userId).eq('date', date);
        if (!blocks) return;
        
        // Find overlapping blocks
        for (const block of blocks) {
            if (block.id === blockId) continue;
            
            const bStart = this.timeToMin(block.start_time);
            const bEnd = this.timeToMin(block.end_time);
            
            // Overlap condition
            if (bStart < newEnd && bEnd > newStart) {
                // If immutable, we cannot cascade it!
                if (['sleep', 'meal', 'wind_down', 'anchor'].includes(block.block_type)) {
                    throw new Error(`Cascading failed: Block overlaps with immutable ${block.block_type} block "${block.title}"`);
                }
                
                // Cascade it! Push it forward to start at newEnd
                const duration = bEnd - bStart;
                const cascadedStart = newEnd;
                const cascadedEnd = cascadedStart + duration;
                
                if (cascadedEnd > 1440) { // beyond midnight
                    throw new Error(`Cascading failed: Pushes block "${block.title}" beyond midnight`);
                }
                
                const newSTime = this.minToTime(cascadedStart);
                const newETime = this.minToTime(cascadedEnd);
                
                const { error } = await supabase.from('schedule_blocks').update({ start_time: newSTime, end_time: newETime }).eq('id', block.id);
                if (error) throw new Error(`Cascade update failed: ${error.message}`);
                
                // Recursively cascade any new overlaps caused by THIS block
                await this.cascadeOverlaps(userId, date, block.id, newSTime, newETime, supabase);
            }
        }
    }

    /**
     * Simulates the execution of all operations in the patch in-memory.
     * Computes the final state of all schedule blocks on the affected dates.
     * Throws an error if any constraint is violated or if cascading fails.
     */
    private static async simulateAndValidatePatch(
        userId: string,
        patch: Patch,
        supabase: SupabaseClient,
        source: string
    ): Promise<{
        success: boolean;
        errors: string[];
        updates: Array<{ id: string; fields: Record<string, any> }>;
        creates: any[];
        deletes: string[];
        preExecState: Record<string, any>;
    }> {
        const errors: string[] = [];
        const dates = new Set<string>();
        const blockIds = new Set<string>();

        // Gather touched dates and block IDs
        for (const op of patch.ops) {
            if (op.date) dates.add(op.date);
            if (op.payload?.date) dates.add(op.payload.date);
            if (op.event?.date) dates.add(op.event.date);
            if (op.event_id) blockIds.add(op.event_id);
        }

        // Fetch dates of modified blocks to cover moves/reschedules
        if (blockIds.size > 0) {
            try {
                const { data: dbBlocks } = await supabase
                    .from('schedule_blocks')
                    .select('date')
                    .in('id', Array.from(blockIds))
                    .eq('user_id', userId);
                if (dbBlocks) {
                    dbBlocks.forEach(b => dates.add(b.date));
                }
            } catch (e: any) {
                console.warn('[PatchService] Failed to pre-fetch dates:', e.message);
            }
        }

        if (dates.size === 0) {
            return { success: true, errors: [], updates: [], creates: [], deletes: [], preExecState: {} };
        }

        // Fetch all blocks on all touched dates
        const { data: dbBlocks, error } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .in('date', Array.from(dates));

        if (error) {
            return { success: false, errors: [`Database error: ${error.message}`], updates: [], creates: [], deletes: [], preExecState: {} };
        }

        const preExecState: Record<string, any> = {};
        dbBlocks?.forEach(b => {
            preExecState[b.id] = { ...b };
        });

        // Initialize simulated list
        const simulatedBlocks = (dbBlocks || []).map(b => ({ ...b }));
        
        // Fetch commitments and inject as virtual blocks for overlap detection
        const { data: commitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);
            
        if (commitments) {
            for (const cmt of commitments) {
                for (const date of dates) {
                    const dow = new Date(date + 'T12:00:00').getDay();
                    if (cmt.days_of_week && cmt.days_of_week.includes(dow)) {
                        const virtId = `virt-cmt-${cmt.id}-${date}`;
                        const virtBlock = {
                            id: virtId,
                            user_id: userId,
                            title: cmt.title,
                            start_time: cmt.start_time,
                            end_time: cmt.end_time,
                            date: date,
                            status: 'planned',
                            block_type: 'anchor',
                            is_fixed: true,
                            is_locked: true,
                            commitment_id: cmt.id
                        };
                        simulatedBlocks.push(virtBlock);
                        preExecState[virtId] = { ...virtBlock };
                    }
                }
            }
        }

        const deletedIds = new Set<string>();
        const modifiedBlockIds = new Set<string>();

        // Helper to perform in-memory cascade
        const simulateCascade = (blockId: string, sTime: string, eTime: string, date: string) => {
            const newStart = this.timeToMin(sTime);
            const newEnd = this.timeToMin(eTime);

            for (const block of simulatedBlocks) {
                if (block.id === blockId || block.date !== date || deletedIds.has(block.id)) continue;

                const bStart = this.timeToMin(block.start_time);
                const bEnd = this.timeToMin(block.end_time);

                // Overlap check
                if (bStart < newEnd && bEnd > newStart) {
                    if (['sleep', 'meal', 'wind_down', 'anchor'].includes(block.block_type)) {
                        throw new Error(`Cascading failed: Block overlaps with immutable ${block.block_type} block "${block.title}"`);
                    }

                    const duration = bEnd - bStart;
                    const cascadedStart = newEnd;
                    const cascadedEnd = cascadedStart + duration;

                    if (cascadedEnd > 1440) {
                        throw new Error(`Cascading failed: Pushes block "${block.title}" beyond midnight`);
                    }

                    const newSTime = this.minToTime(cascadedStart);
                    const newETime = this.minToTime(cascadedEnd);

                    block.start_time = newSTime;
                    block.end_time = newETime;
                    modifiedBlockIds.add(block.id);

                    // Recurse cascade
                    simulateCascade(block.id, newSTime, newETime, date);
                }
            }
        };

        // Run simulation for each operation
        for (const op of patch.ops) {
            const operation = op.op;

            if (operation === 'create' || operation === 'create_event') {
                const event = op.event || op.payload || {};
                const sTime = event.start_time || event.start || event.to_start;
                let eTime = event.end_time || event.end || event.to_end;
                const date = event.date || op.date;

                if (!sTime || !eTime || !date) {
                    return { success: false, errors: ['Create requires start_time, end_time, and date'], updates: [], creates: [], deletes: [], preExecState };
                }

                if (this.timeToMin(eTime) <= this.timeToMin(sTime)) {
                    eTime = '23:59:59';
                }

                const newId = event.id || crypto.randomUUID();
                op.event_id = newId; // Save generated ID back to op for undo mapping

                // Validate goal constraints for creates
                if (event.goal_id && event.block_type === 'goal') {
                    const newBlockMins = Math.max(0, this.timeToMin(eTime) - this.timeToMin(sTime));
                    try {
                        await this.validateGoalConstraints(userId, event.goal_id, date, newBlockMins, null, supabase, source);
                    } catch (goalErr: any) {
                        return { success: false, errors: [goalErr.message], updates: [], creates: [], deletes: [], preExecState };
                    }
                }

                const newBlock = {
                    id: newId,
                    user_id: userId,
                    title: event.title || event.context || 'New Block',
                    start_time: sTime,
                    end_time: eTime,
                    date,
                    status: event.status || 'planned',
                    block_type: ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'].includes(event.block_type) ? event.block_type : 'flex',
                    pillar: event.pillar || null,
                    goal_id: event.goal_id || null,
                    checklist: Array.isArray(event.checklist) ? event.checklist : null,
                    habit_stack_id: event.habit_stack_id || null,
                    is_locked: event.is_locked !== undefined ? event.is_locked : false,
                    context: event.context || event.title || null,
                };

                simulatedBlocks.push(newBlock);
                modifiedBlockIds.add(newId);

                if (source === 'coach') {
                    try {
                        simulateCascade(newId, sTime, eTime, date);
                    } catch (cascadeErr: any) {
                        return { success: false, errors: [cascadeErr.message], updates: [], creates: [], deletes: [], preExecState };
                    }
                }
            } 
            else if (operation === 'update' || operation === 'update_event') {
                const id = op.event_id;
                const fields = op.fields || op.payload || {};
                if (!id) {
                    return { success: false, errors: ['Update requires event_id'], updates: [], creates: [], deletes: [], preExecState };
                }

                const block = simulatedBlocks.find(b => b.id === id);
                if (!block) {
                    return { success: false, errors: [`Block not found: ${id}`], updates: [], creates: [], deletes: [], preExecState };
                }

                if (['sleep', 'meal', 'wind_down', 'anchor'].includes(block.block_type) && source !== 'coach') {
                    return { success: false, errors: [`Cannot modify immutable ${block.block_type} block "${block.title}"`], updates: [], creates: [], deletes: [], preExecState };
                }

                const sTime = fields.start_time || block.start_time;
                let eTime = fields.end_time || block.end_time;
                const date = fields.date || block.date;

                if (this.timeToMin(eTime) <= this.timeToMin(sTime)) {
                    eTime = '23:59:59';
                    fields.end_time = eTime;
                }

                // Validate goal constraints for updates
                if (block.goal_id) {
                    const newBlockMins = Math.max(0, this.timeToMin(eTime) - this.timeToMin(sTime));
                    try {
                        await this.validateGoalConstraints(userId, block.goal_id, date, newBlockMins, id, supabase, source);
                    } catch (goalErr: any) {
                        return { success: false, errors: [goalErr.message], updates: [], creates: [], deletes: [], preExecState };
                    }
                }

                Object.assign(block, fields);
                block.start_time = sTime;
                block.end_time = eTime;
                block.date = date;
                modifiedBlockIds.add(block.id);

                if (source === 'coach') {
                    try {
                        simulateCascade(id, sTime, eTime, date);
                    } catch (cascadeErr: any) {
                        return { success: false, errors: [cascadeErr.message], updates: [], creates: [], deletes: [], preExecState };
                    }
                }
            }
            else if (operation === 'move' || operation === 'move_event') {
                const id = op.event_id;
                const start = op.to_start || op.start_time;
                const end = op.to_end || op.end_time;
                const date = op.date || (op as any).new_date;

                if (!id || !start || !end) {
                    return { success: false, errors: ['Move requires event_id, to_start, to_end'], updates: [], creates: [], deletes: [], preExecState };
                }

                const block = simulatedBlocks.find(b => b.id === id);
                if (!block) {
                    return { success: false, errors: [`Block not found: ${id}`], updates: [], creates: [], deletes: [], preExecState };
                }

                if (['sleep', 'meal', 'wind_down', 'anchor'].includes(block.block_type) && source !== 'coach') {
                    return { success: false, errors: [`Cannot move immutable ${block.block_type} block "${block.title}"`], updates: [], creates: [], deletes: [], preExecState };
                }

                const sTime = start;
                let eTime = end;
                if (this.timeToMin(eTime) <= this.timeToMin(sTime)) {
                    eTime = '23:59:59';
                }

                const cascadeDate = date || block.date;

                if (block.goal_id) {
                    const newBlockMins = Math.max(0, this.timeToMin(eTime) - this.timeToMin(sTime));
                    try {
                        await this.validateGoalConstraints(userId, block.goal_id, cascadeDate, newBlockMins, id, supabase, source);
                    } catch (goalErr: any) {
                        return { success: false, errors: [goalErr.message], updates: [], creates: [], deletes: [], preExecState };
                    }
                }

                block.start_time = sTime;
                block.end_time = eTime;
                if (date) block.date = date;
                modifiedBlockIds.add(block.id);

                if (source === 'coach') {
                    try {
                        simulateCascade(id, sTime, eTime, cascadeDate);
                    } catch (cascadeErr: any) {
                        return { success: false, errors: [cascadeErr.message], updates: [], creates: [], deletes: [], preExecState };
                    }
                }
            }
            else if (operation === 'delete' || operation === 'delete_event') {
                const id = op.event_id;
                if (!id) {
                    return { success: false, errors: ['Delete requires event_id'], updates: [], creates: [], deletes: [], preExecState };
                }

                const block = simulatedBlocks.find(b => b.id === id);
                if (block) {
                    if (['sleep', 'meal', 'wind_down', 'anchor'].includes(block.block_type) && source !== 'coach') {
                        return { success: false, errors: [`Cannot delete immutable ${block.block_type} block "${block.title}"`], updates: [], creates: [], deletes: [], preExecState };
                    }
                    deletedIds.add(id);
                    const idx = simulatedBlocks.findIndex(b => b.id === id);
                    if (idx !== -1) simulatedBlocks.splice(idx, 1);
                }
            }
        }

        // Perform final overlap checks on simulated blocks
        const groupedByDate: Record<string, typeof simulatedBlocks> = {};
        simulatedBlocks.forEach(b => {
            if (deletedIds.has(b.id)) return;
            if (!groupedByDate[b.date]) groupedByDate[b.date] = [];
            groupedByDate[b.date].push(b);
        });

        for (const [date, blocks] of Object.entries(groupedByDate)) {
            const sorted = [...blocks].sort((a, b) => this.timeToMin(a.start_time) - this.timeToMin(b.start_time));
            for (let i = 0; i < sorted.length - 1; i++) {
                const b1 = sorted[i];
                const b2 = sorted[i + 1];
                const b1End = this.timeToMin(b1.end_time);
                const b2Start = this.timeToMin(b2.start_time);
                if (b1End > b2Start) {
                    if (modifiedBlockIds.has(b1.id) || modifiedBlockIds.has(b2.id)) {
                        errors.push(`Overlap detected on ${date} between "${b1.title}" (${b1.start_time}-${b1.end_time}) and "${b2.title}" (${b2.start_time}-${b2.end_time})`);
                    }
                }
            }
        }

        if (errors.length > 0) {
            return { success: false, errors, updates: [], creates: [], deletes: [], preExecState };
        }

        // Determine updates and creates
        const updates: Array<{ id: string; fields: Record<string, any> }> = [];
        const creates: any[] = [];
        const deletes = Array.from(deletedIds);

        simulatedBlocks.forEach(sb => {
            const original = preExecState[sb.id];
            if (!original) {
                creates.push(sb);
            } else {
                const hasChanged =
                    sb.start_time !== original.start_time ||
                    sb.end_time !== original.end_time ||
                    sb.date !== original.date ||
                    sb.title !== original.title ||
                    sb.block_type !== original.block_type ||
                    JSON.stringify(sb.checklist) !== JSON.stringify(original.checklist);

                if (hasChanged) {
                    updates.push({
                        id: sb.id,
                        fields: {
                            start_time: sb.start_time,
                            end_time: sb.end_time,
                            date: sb.date,
                            title: sb.title,
                            block_type: sb.block_type,
                            pillar: sb.pillar,
                            goal_id: sb.goal_id,
                            checklist: sb.checklist,
                            status: sb.status
                        }
                    });
                }
            }
        });

        return {
            success: true,
            errors: [],
            updates,
            creates,
            deletes,
            preExecState
        };
    }

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
        const errors: string[] = [];
        let changes = 0;

        const blockModOps = ['create', 'create_event', 'update', 'update_event', 'move', 'move_event', 'delete', 'delete_event'];
        const isBlockModsOnly = patch.ops.length > 0 && patch.ops.every(op => blockModOps.includes(op.op));

        if (isBlockModsOnly) {
            // 1. Create Snapshot (BEFORE applying) — for full-scope undo
            if (patch.scope === 'week' || patch.snapshot_requested) {
                try {
                    await this.createSnapshot(userId, patch, supabase);
                } catch (snapErr: any) {
                    console.warn('[PatchService] Snapshot failed:', snapErr.message);
                }
            }

            // 2. Pre-flight simulation
            const simResult = await this.simulateAndValidatePatch(userId, patch, supabase, source);
            if (!simResult.success) {
                console.error(`[PatchService] Simulation validation failed:`, simResult.errors);
                return { success: false, undo_token: null, changes: 0, errors: simResult.errors };
            }

            const { updates, creates, deletes, preExecState } = simResult;

            // 3. Sequential database execution
            // A. Deletes
            if (deletes.length > 0) {
                const { error: delErr } = await supabase.from('schedule_blocks').delete().in('id', deletes).eq('user_id', userId);
                if (delErr) {
                    console.error('[PatchService] DB Delete failed:', delErr.message);
                    return { success: false, undo_token: null, changes: 0, errors: [`Delete failed: ${delErr.message}`] };
                }
                changes += deletes.length;
            }

            // B. Updates (including cascaded)
            for (const upd of updates) {
                const { error: updErr } = await supabase.from('schedule_blocks').update(upd.fields).eq('id', upd.id).eq('user_id', userId);
                if (updErr) {
                    console.error('[PatchService] DB Update failed:', updErr.message);
                    return { success: false, undo_token: null, changes: 0, errors: [`Update failed: ${updErr.message}`] };
                }
                changes += 1;
            }

            // C. Creates
            if (creates.length > 0) {
                const { error: insErr } = await supabase.from('schedule_blocks').insert(creates);
                if (insErr) {
                    console.error('[PatchService] DB Insert failed:', insErr.message);
                    return { success: false, undo_token: null, changes: 0, errors: [`Insert failed: ${insErr.message}`] };
                }
                changes += creates.length;
            }

            // 4. Calculate Inverse Patch
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

            return { success: true, undo_token: undoToken, changes, errors: [] };
        }

        // --- Traditional Fallback Path (For non-block-modification operations) ---

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
        // 1. Find the latest assistant message
        const { data: latestMsg } = await supabase
            .from('coach_messages')
            .select('id, options')
            .eq('conversation_id', conversationId)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (latestMsg) {
            // 2. Update the message
            const { error: updateErr } = await supabase
                .from('coach_messages')
                .update({
                    selected_option_id: optionId,
                    patch_version_id: patchRunId // We use patchRunId as the undo token
                })
                .eq('id', latestMsg.id);

            if (updateErr) console.error("[PatchService] Update message error:", updateErr);

            // 3. Insert real "Changes applied" message into DB for AI history
            let finalMsg = "Changes applied.";
            if (latestMsg.options && Array.isArray(latestMsg.options)) {
                const opt = latestMsg.options.find((o: any) => o.id === optionId);
                if (opt) {
                    let blockTitle = 'The';
                    let targetTime = '';
                    let targetDay = '';
                    let targetDateStr = '';
                    
                    const titleMatch = opt.impact?.match(/Moved "(.*?)"/i);
                    if (titleMatch) blockTitle = titleMatch[1];

                    const ops = opt.ledger?.ops || opt.operations || opt.ops || [];
                    const moveOp = ops.find((o: any) => o.type === 'move_block' || o.type === 'move' || o.op === 'move_event');
                    
                    if (moveOp) {
                        const newStart = moveOp.new_start || moveOp.to_start || moveOp.start_time;
                        if (newStart) targetTime = newStart.substring(0, 5);
                        
                        const newDate = moveOp.new_date || moveOp.date;
                        if (newDate && newDate.includes('-')) {
                            const [yyyy, mm, dd] = newDate.split('-');
                            const dObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                            const dWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dObj.getDay()];
                            targetDay = dWeek;
                            targetDateStr = `${dd}/${mm}`;
                        }
                    }

                    finalMsg = `Changes applied: ${opt.impact}`;
                    if (targetTime && targetDay && targetDateStr) {
                        finalMsg = `Changes applied: ${blockTitle} block moved to ${targetTime}, on ${targetDay}, on ${targetDateStr}.`;
                    }
                }
            }

            const { error: insertErr } = await supabase
                .from('coach_messages')
                .insert({
                    conversation_id: conversationId,
                    user_id: userId,
                    role: 'assistant',
                    content: finalMsg,
                    mode: null,
                    options: null
                });

            if (insertErr) console.error("[PatchService] Insert message error:", insertErr);
        } else {
            console.warn("[PatchService] No latest assistant message found for conversation:", conversationId);
        }

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
                const timeToMin = (t: string) => {
                    const [h, m] = (t || '0:0').split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                };

                const sTime = event.start_time || event.start || event.to_start;
                let eTime = event.end_time || event.end || event.to_end;
                if (eTime && sTime && timeToMin(eTime) <= timeToMin(sTime)) {
                    eTime = '23:59:59';
                }

                const insertData: any = {
                    user_id: userId,
                    title: event.title || 'New Block',
                    start_time: sTime,
                    end_time: eTime,
                    date: event.date || op.date || new Date().toISOString().split('T')[0],
                    status: event.status || 'planned',
                    block_type: ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'].includes(event.block_type) ? event.block_type : 'flex',
                    pillar: event.pillar || null,
                    goal_id: event.goal_id || null,
                    checklist: Array.isArray(event.checklist) ? event.checklist : null,
                    habit_stack_id: event.habit_stack_id || null,
                    is_locked: event.is_locked ?? true,
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
                    // Do NOT set op.event_id — inverse patch builder would otherwise delete a pre-existing block on undo
                    break;
                }

                // GOAL OVER-ALLOCATION ENFORCEMENT: Check daily and weekly limits
                if (insertData.goal_id && insertData.block_type === 'goal') {
                    const timeToMin = (t: string) => {
                        const [h, m] = (t || '0:0').split(':').map(Number);
                        return (h || 0) * 60 + (m || 0);
                    };
                    const newBlockMins = Math.max(0, timeToMin(insertData.end_time) - timeToMin(insertData.start_time));
                    await this.validateGoalConstraints(userId, insertData.goal_id, insertData.date, newBlockMins, null, supabase, source);
                }

                const { data, error } = await supabase
                    .from('schedule_blocks')
                    .insert(insertData)
                    .select('id')
                    .single();
                if (error) throw new Error(`Create failed: ${error.message}`);
                if (data?.id && !event.id) {
                    op.event_id = data.id;
                }
                if (source === 'coach') {
                    await this.cascadeOverlaps(userId, insertData.date, data?.id || event.id, insertData.start_time, insertData.end_time, supabase);
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
                    .select('id, block_type, goal_id, start_time, end_time, date')
                    .eq('id', id)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (!existing) throw new Error(`Block not found for update: ${id}`);
                const IMMUTABLE_TYPES = ['sleep', 'meal', 'wind_down', 'anchor'];
                if (IMMUTABLE_TYPES.includes(existing.block_type) && source !== 'coach') {
                    console.log(`[PatchService] BLOCKED: Cannot modify immutable ${existing.block_type} block`);
                    break;
                }

                const timeToMin = (t: string) => {
                    const [h, m] = (t || '0:0').split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                };
                const sTime = fields.start_time || existing.start_time;
                let eTime = fields.end_time || existing.end_time;
                if (eTime && sTime && timeToMin(eTime) <= timeToMin(sTime)) {
                    eTime = '23:59:59';
                    fields.end_time = eTime;
                }

                if (existing.goal_id) {
                    const newDate = fields.date || existing.date;
                    const newBlockMins = Math.max(0, timeToMin(eTime) - timeToMin(sTime));
                    await this.validateGoalConstraints(userId, existing.goal_id, newDate, newBlockMins, id, supabase, source);
                }

                const allowedEventFields = ['title', 'start_time', 'end_time', 'date', 'status', 'block_type', 'pillar', 'goal_id', 'checklist', 'habit_stack_id', 'is_locked', 'context', 'description', 'is_fixed', 'commitment_id', 'deviation_reason', 'energy_cost', 'energy_level_required', 'meta', 'original_date', 'original_start_time', 'priority', 'source'];
                const sanitizedFields: any = {};
                for (const key of allowedEventFields) {
                    if (fields[key] !== undefined) {
                        if (key === 'description' && typeof fields[key] === 'string') {
                            sanitizedFields[key] = sanitizeHtml(fields[key]);
                        } else {
                            sanitizedFields[key] = fields[key];
                        }
                    }
                }
                
                // Ensure specific time fields from logic above are retained
                if (sTime) sanitizedFields.start_time = sTime;
                if (eTime) sanitizedFields.end_time = eTime;
                if (fields.date) sanitizedFields.date = fields.date;

                const { error } = await supabase
                    .from('schedule_blocks')
                    .update(sanitizedFields)
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Update failed: ${error.message}`);
                
                if (source === 'coach') {
                    const cascadeDate = fields.date || existing.date;
                    await this.cascadeOverlaps(userId, cascadeDate, id, sTime, eTime, supabase);
                }
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
                // Verify block exists and check immutability
                const { data: moveTarget } = await supabase
                    .from('schedule_blocks')
                    .select('id, block_type, goal_id, start_time, end_time, date')
                    .eq('id', id)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (!moveTarget) throw new Error(`Block not found: ${id} — the AI may have used a wrong or hallucinated ID`);
                const IMMUTABLE_MOVE = ['sleep', 'meal', 'wind_down', 'anchor'];
                if (IMMUTABLE_MOVE.includes(moveTarget.block_type) && source !== 'coach') {
                    console.log(`[PatchService] BLOCKED: Cannot move immutable ${moveTarget.block_type} block`);
                    break;
                }

                const timeToMin = (t: string) => {
                    const [h, m] = (t || '0:0').split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                };
                const sTime = start;
                let eTime = end;
                if (eTime && sTime && timeToMin(eTime) <= timeToMin(sTime)) {
                    eTime = '23:59:59';
                }

                const updateData: any = { start_time: sTime, end_time: eTime };
                if (op.date) updateData.date = op.date;

                if (moveTarget.goal_id) {
                    const newDate = op.date || moveTarget.date;
                    const newBlockMins = Math.max(0, timeToMin(eTime) - timeToMin(sTime));
                    await this.validateGoalConstraints(userId, moveTarget.goal_id, newDate, newBlockMins, id, supabase, source);
                }

                const { data: moved, error } = await supabase
                    .from('schedule_blocks')
                    .update(updateData)
                    .eq('id', id)
                    .eq('user_id', userId)
                    .select('id');
                if (error) throw new Error(`Move failed: ${error.message}`);
                if (!moved || moved.length === 0) throw new Error(`Move matched 0 rows for block ${id}`);
                
                if (source === 'coach') {
                    const cascadeDate = op.date || moveTarget.date;
                    await this.cascadeOverlaps(userId, cascadeDate, id, sTime, eTime, supabase);
                }
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
                const allowedGoalFields = ['title', 'pillar', 'category', 'importance', 'days_per_week', 'minutes_per_day', 'energy_demand', 'weekly_target_minutes', 'status', 'is_active', 'priority', 'description', 'color', 'emoji', 'is_archived', 'start_date', 'target_date'];
                const sanitizedFields: any = {};
                for (const key of allowedGoalFields) {
                    if (fields[key] !== undefined) {
                        if (key === 'description' && typeof fields[key] === 'string') {
                            sanitizedFields[key] = sanitizeHtml(fields[key]);
                        } else {
                            sanitizedFields[key] = fields[key];
                        }
                    }
                }

                const { error } = await supabase
                    .from('goals')
                    .update(sanitizedFields)
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

            case 'update_memory': {
                const payload = op.payload || {};
                const key = op.key || payload.key;
                const value = op.value !== undefined ? op.value : payload.value;
                const kind = op.kind || payload.kind || 'preference';
                
                if (!key) throw new Error('Update memory requires a key');

                // Upsert logic for memory fact
                const { error } = await supabase
                    .from('memory_facts')
                    .upsert({
                        user_id: userId,
                        key,
                        value,
                        kind,
                        confidence: 1.0,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id, key' });
                    
                if (error) throw new Error(`Update memory failed: ${error.message}`);
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
                const allowedTodoFields = ['title', 'description', 'is_completed', 'due_date', 'priority', 'category', 'block_id', 'goal_id', 'status', 'is_active', 'completed_at'];
                const sanitizedFields: any = {};
                for (const key of allowedTodoFields) {
                    if (fields[key] !== undefined) {
                        if (key === 'description' && typeof fields[key] === 'string') {
                            sanitizedFields[key] = sanitizeHtml(fields[key]);
                        } else {
                            sanitizedFields[key] = fields[key];
                        }
                    }
                }

                const { error } = await supabase
                    .from('todos')
                    .update(sanitizedFields)
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

            case 'create_habit_stack': {
                const payload = op.payload || {};
                const insertData: any = {
                    user_id: userId,
                    name: payload.name || 'New Stack',
                    preferred_window: payload.preferred_window || 'morning',
                    steps: Array.isArray(payload.steps) ? payload.steps : [],
                    is_active: true,
                    enabled: true,
                };
                const { data, error } = await supabase
                    .from('habit_stacks')
                    .insert(insertData)
                    .select('id')
                    .single();
                if (error) throw new Error(`Create habit stack failed: ${error.message}`);
                // Not returning ID anywhere, but standard convention
                break;
            }

            case 'update_habit_stack': {
                const id = op.stack_id;
                const fields = op.fields || op.payload;
                if (!id) throw new Error('Update habit stack requires stack_id');
                const { error } = await supabase
                    .from('habit_stacks')
                    .update(fields)
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Update habit stack failed: ${error.message}`);
                break;
            }

            case 'delete_habit_stack': {
                if (!op.stack_id) throw new Error('Delete habit stack requires stack_id');
                const { error } = await supabase
                    .from('habit_stacks')
                    .delete()
                    .eq('id', op.stack_id)
                    .eq('user_id', userId);
                if (error) throw new Error(`Delete habit stack failed: ${error.message}`);
                break;
            }

            case 'replan_week': {
                console.log('[PatchService] Starting replan_week...');
                // 1. Build context
                const calendarCtx = await buildCalendarContext(userId, supabase);
                
                // 2. Determine replan date (today) and correct week start (Monday) relative to user timezone
                const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
                const timezone = profile?.timezone || DEFAULT_TIMEZONE;
                const now = new Date();
                
                const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
                const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
                
                const todayStr = dateFormatter.format(now);
                const timeStr = timeFormatter.format(now);
                const [h, m] = timeStr.split(':').map(Number);
                const nowTime = h * 60 + m;
                
                // Timezone-safe Monday calculation
                const [yr, mo, dy] = todayStr.split('-').map(Number);
                const localToday = new Date(yr, mo - 1, dy, 12, 0, 0); // Noon to avoid shift
                const dayOfWeek = localToday.getDay(); // 0=Sun, 1=Mon, ...
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const localMonday = new Date(localToday.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
                const weekStartStr = `${localMonday.getFullYear()}-${String(localMonday.getMonth() + 1).padStart(2, '0')}-${String(localMonday.getDate()).padStart(2, '0')}`;
                
                // Calculate tomorrowStr relative to user timezone
                const localTomorrow = new Date(localToday.getTime() + 24 * 60 * 60 * 1000);
                const tomorrowStr = `${localTomorrow.getFullYear()}-${String(localTomorrow.getMonth() + 1).padStart(2, '0')}-${String(localTomorrow.getDate()).padStart(2, '0')}`;
                
                console.log(`[PatchService] User Timezone: ${timezone}, Week start: ${weekStartStr}, today: ${todayStr}, tomorrow: ${tomorrowStr}`);

                // 3. Generate new plan using the CORRECT week start (Monday) and tomorrowStr as replanFromDate
                const mode = op.payload?.mode || 'balanced';
                const allowWeekend = op.payload?.allow_weekend !== false;
                const variants = await generateWeekPlan(calendarCtx, weekStartStr, mode, allowWeekend, undefined, tomorrowStr);
                
                if (!variants || variants.length === 0) {
                    throw new Error('Replan failed to generate any variants');
                }
                
                // We just take the first variant (which is the selected mode)
                const newPlan = variants[0];
                console.log(`[PatchService] Generated ${newPlan.blocks.length} blocks for variant "${newPlan.label}"`);
                
                // 4. Delete future non-immutable blocks strictly from TOMORROW onwards (date > todayStr)
                const { data: futureBlocks } = await supabase
                    .from('schedule_blocks')
                    .select('id, block_type, start_time, status, date')
                    .eq('user_id', userId)
                    .gt('date', todayStr); // STRICTLY TOMORROW ONWARDS
                    
                if (futureBlocks) {
                    const IMMUTABLE = ['sleep', 'meal', 'wind_down', 'anchor'];
                    const idsToDelete = futureBlocks.filter((b: any) => {
                        if (IMMUTABLE.includes(b.block_type)) return false;
                        if (b.is_locked) return false;
                        if (b.status === 'done') return false;
                        return true;
                    }).map((b: any) => b.id);
                    
                    console.log(`[PatchService] Deleting ${idsToDelete.length} future non-immutable blocks from tomorrow onwards`);
                    if (idsToDelete.length > 0) {
                        const { error: delErr } = await supabase
                            .from('schedule_blocks')
                            .delete()
                            .eq('user_id', userId)
                            .in('id', idsToDelete);
                        if (delErr) throw new Error(`Replan failed to clear old blocks: ${delErr.message}`);
                    }
                }
                
                // 5. Insert new generated blocks strictly from TOMORROW onwards (date > todayStr)
                const blocksToInsert = newPlan.blocks.filter((b: any) => {
                    if (b.date <= todayStr) return false; // STRICTLY TOMORROW ONWARDS
                    
                    // Skip bio blocks (sleep, meal, wind_down) — they already exist as immutables
                    const BIO_TYPES = ['sleep', 'meal', 'wind_down'];
                    if (BIO_TYPES.includes(b.block_type)) return false;
                    return true;
                }).map((b: any) => ({
                    user_id: userId,
                    title: b.title,
                    start_time: b.start_time,
                    end_time: b.end_time,
                    date: b.date,
                    status: 'planned',
                    block_type: b.block_type,
                    pillar: b.pillar || null,
                    goal_id: b.goal_id || null,
                    checklist: b.checklist || null,
                }));
                
                console.log(`[PatchService] Inserting ${blocksToInsert.length} new blocks strictly from tomorrow onwards`);
                if (blocksToInsert.length > 0) {
                    const { error: insErr } = await supabase
                        .from('schedule_blocks')
                        .insert(blocksToInsert);
                    if (insErr) throw new Error(`Replan failed to insert new blocks: ${insErr.message}`);
                }
                
                break;
            }

            case 'replan_day': {
                console.log('[PatchService] Starting replan_day...');
                // 1. Build context
                const calendarCtx = await buildCalendarContext(userId, supabase);
                
                // 2. Determine replan date (today) and correct week start (Monday) relative to user timezone
                const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
                const timezone = profile?.timezone || DEFAULT_TIMEZONE;
                const now = new Date();
                
                const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
                const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
                
                const todayStr = dateFormatter.format(now);
                const timeStr = timeFormatter.format(now);
                const [h, m] = timeStr.split(':').map(Number);
                const nowTime = h * 60 + m;
                
                // Timezone-safe Monday calculation
                const [yr, mo, dy] = todayStr.split('-').map(Number);
                const localToday = new Date(yr, mo - 1, dy, 12, 0, 0); // Noon to avoid shift
                const dayOfWeek = localToday.getDay(); // 0=Sun, 1=Mon, ...
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const localMonday = new Date(localToday.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
                const weekStartStr = `${localMonday.getFullYear()}-${String(localMonday.getMonth() + 1).padStart(2, '0')}-${String(localMonday.getDate()).padStart(2, '0')}`;
                
                console.log(`[PatchService] User Timezone: ${timezone}, Week start: ${weekStartStr}, today: ${todayStr}, nowTime: ${nowTime} mins`);

                // 3. Generate new plan from today onwards
                const mode = op.payload?.mode || 'balanced';
                const allowWeekend = op.payload?.allow_weekend !== false;
                const variants = await generateWeekPlan(calendarCtx, weekStartStr, mode, allowWeekend, undefined, todayStr);
                
                if (!variants || variants.length === 0) {
                    throw new Error('Replan failed to generate any variants');
                }
                
                const newPlan = variants[0];
                console.log(`[PatchService] Generated ${newPlan.blocks.length} blocks for variant "${newPlan.label}"`);
                
                // 4. Delete future non-immutable blocks strictly from TODAY onwards
                const { data: futureBlocks } = await supabase
                    .from('schedule_blocks')
                    .select('id, block_type, start_time, status, date')
                    .eq('user_id', userId)
                    .gte('date', todayStr); // STRICTLY TODAY ONWARDS
                    
                if (futureBlocks) {
                    const IMMUTABLE = ['sleep', 'meal', 'wind_down', 'anchor'];
                    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                    const idsToDelete = futureBlocks.filter((b: any) => {
                        if (IMMUTABLE.includes(b.block_type)) return false;
                        if (b.is_locked) return false;
                        if (b.status === 'done') return false;
                        if (b.date === todayStr) {
                            const [h, m] = b.start_time.split(':').map(Number);
                            const startMins = h * 60 + m;
                            if (startMins < nowTime) return false; // past blocks today are safe
                        }
                        return true;
                    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                    }).map((b: any) => b.id);
                    
                    console.log(`[PatchService] Deleting ${idsToDelete.length} future non-immutable blocks for today onwards`);
                    if (idsToDelete.length > 0) {
                        const { error: delErr } = await supabase
                            .from('schedule_blocks')
                            .delete()
                            .eq('user_id', userId)
                            .in('id', idsToDelete);
                        if (delErr) throw new Error(`Replan failed to clear old blocks: ${delErr.message}`);
                    }
                }
                
                // 5. Insert new generated blocks from TODAY onwards
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                const blocksToInsert = newPlan.blocks.filter((b: any) => {
                    if (b.date < todayStr) return false; // STRICTLY TODAY ONWARDS
                    if (b.date === todayStr) {
                        const [h, m] = b.start_time.split(':').map(Number);
                        const startMins = h * 60 + m;
                        if (startMins < nowTime) return false;
                    }
                    
                    // Skip bio blocks
                    const BIO_TYPES = ['sleep', 'meal', 'wind_down'];
                    if (BIO_TYPES.includes(b.block_type)) return false;
                    return true;
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                }).map((b: any) => ({
                    user_id: userId,
                    title: b.title,
                    start_time: b.start_time,
                    end_time: b.end_time,
                    date: b.date,
                    status: 'planned',
                    block_type: b.block_type,
                    pillar: b.pillar || null,
                    goal_id: b.goal_id || null,
                    checklist: b.checklist || null,
                }));
                
                console.log(`[PatchService] Inserting ${blocksToInsert.length} new blocks for today`);
                if (blocksToInsert.length > 0) {
                    const { error: insErr } = await supabase
                        .from('schedule_blocks')
                        .insert(blocksToInsert);
                    if (insErr) throw new Error(`Replan failed to insert new blocks: ${insErr.message}`);
                }
                
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
                // We delete the created blocks and then recreate the old blocks.
            } else if (opType === 'replan_week' || opType === 'replan_day') {
                // To undo a replan_week, the system will rely entirely on the snapshot
                // created in step 1. Because the snapshot covers the whole week, 
                // the undo function in restoreFromSnapshot will wipe and restore.
                // We don't need inverse ops.
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
