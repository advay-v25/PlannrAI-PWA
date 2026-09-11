import { SupabaseClient } from '@supabase/supabase-js';
import sanitizeHtml from 'sanitize-html';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { generateWeekPlan } from '@/lib/calendar/ai/plan-week';
import { writeWeek } from './week-writer';
import { copyWeekForward, BIO_TYPES } from './week-copy';
import { validateGoalFields } from '@/lib/goals/schema';
import { AnchorService } from '@/lib/calendar/anchor-service';
import { SchedulingProtocol } from '@/lib/scheduling/protocol';
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
    | 'plan_current_week'
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


export interface PatchOpResult {
    op: PatchOpType;
    ok: boolean;
    error?: string;
    /** Whatever the op chose to report (e.g. plan_next_week's counts). */
    data?: any;
}

export interface PatchResult {
    success: boolean;
    undo_token: string | null;
    changes: number;
    errors: string[];
    /**
     * Per-op outcomes, in execution order. `success` alone is not enough: the
     * loop below continues past a failing op, so a patch where the goal writes
     * landed and plan_next_week threw still reports success === true.
     */
    op_results?: PatchOpResult[];
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
            // Deletes/updates/creates are three independent Supabase calls
            // (no wrapping transaction), so a failure partway leaves earlier
            // steps already committed. `changes` tracks what actually landed
            // so a partial-failure response doesn't misreport "0 changes"
            // when the DB has, in fact, been mutated — the caller/UI must be
            // able to tell a real partial-apply apart from a true no-op.
            // A. Deletes
            if (deletes.length > 0) {
                const { error: delErr } = await supabase.from('schedule_blocks').delete().in('id', deletes).eq('user_id', userId);
                if (delErr) {
                    console.error('[PatchService] DB Delete failed:', delErr.message);
                    return { success: false, undo_token: null, changes, errors: [`Delete failed: ${delErr.message}`] };
                }
                changes += deletes.length;
            }

            // B. Updates (including cascaded)
            for (const upd of updates) {
                const { error: updErr } = await supabase.from('schedule_blocks').update(upd.fields).eq('id', upd.id).eq('user_id', userId);
                if (updErr) {
                    console.error('[PatchService] DB Update failed:', updErr.message);
                    return { success: false, undo_token: null, changes, errors: [`Update failed: ${updErr.message} (${changes} change(s) already applied and cannot be auto-undone)`] };
                }
                changes += 1;
            }

            // C. Creates
            if (creates.length > 0) {
                const { error: insErr } = await supabase.from('schedule_blocks').insert(creates);
                if (insErr) {
                    console.error('[PatchService] DB Insert failed:', insErr.message);
                    return { success: false, undo_token: null, changes, errors: [`Insert failed: ${insErr.message} (${changes} change(s) already applied and cannot be auto-undone)`] };
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
        const opResults: PatchOpResult[] = [];
        for (const op of patch.ops) {
            try {
                const data = await this.executeOp(userId, op, supabase, source);
                opResults.push({ op: op.op, ok: true, data });
                changes++;
            } catch (e: any) {
                errors.push(`${op.op}: ${e.message}`);
                opResults.push({ op: op.op, ok: false, error: e.message });
                console.error(`[PatchService] Op failed:`, op.op, e.message);
            }
        }

        if (changes === 0) {
            return { success: false, undo_token: null, changes: 0, errors, op_results: opResults };
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
                        // Ops like replan_week / plan_next_week deliberately
                        // produce no inverse ops and rely on the snapshot.
                        // Recording it here is what lets undoPatch fall back to
                        // a restore instead of reporting "nothing to undo".
                        schedule_version_id: versionId,
                        created_at: new Date().toISOString()
                    })
                    .select('id')
                    .single();

                if (error) {
                    console.error('[PatchService] Failed to store patch run:', error);
                } else {
                    undoToken = run.id;
                    console.log(`[PatchService] Undo token created: ${undoToken} with ${inversePatch.ops.length} inverse ops (snapshot ${versionId || 'none'})`);
                }
            } catch (e: any) {
                console.error('[PatchService] Undo storage failed:', e.message);
            }
        }

        return { success: true, undo_token: undoToken, changes, errors, op_results: opResults };
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

        // Whole-week regeneration ops emit no inverse ops by design — the
        // snapshot taken before the patch IS their undo. A patch can mix them
        // with ops that DO have inverses (weekly review edits goals and
        // regenerates the week in one patch), so both halves must run:
        // the snapshot restores schedule_blocks, the inverse ops restore goals.
        const REGEN_OPS = ['replan_week', 'plan_next_week', 'replan_day'];
        const originalOps = ((run.patch as Patch)?.ops || []) as PatchOp[];
        const needsSnapshot = originalOps.some((o) => REGEN_OPS.includes(o.op));

        let snapshotChanges = 0;
        if (needsSnapshot && run.schedule_version_id) {
            console.log(`[PatchService] Restoring snapshot ${run.schedule_version_id} for regeneration op`);
            const restored = await this.restoreFromSnapshot(userId, run.schedule_version_id, supabase);
            if (restored) snapshotChanges = 1;
            else console.error('[PatchService] Snapshot restore failed');
        }

        if (!inverse || !inverse.ops || inverse.ops.length === 0) {
            if (snapshotChanges > 0) {
                await supabase.from('patch_runs').update({ applied: false }).eq('id', undoToken);
                return { success: true, changes: snapshotChanges };
            }
            console.error('[PatchService] Undo failed: No inverse operations available');
            return { success: false, changes: 0 };
        }

        console.log(`[PatchService] Undoing patch ${undoToken} with ${inverse.ops.length} inverse ops`);
        let changes = snapshotChanges;

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
                if (payload.preferred_windows !== undefined) insertData.preferred_windows = payload.preferred_windows;
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
                // §5: the SAME contract api/goals/route.ts uses. This path used
                // to validate nothing and write whatever it was handed, so the
                // coach could put a value in a goal that the goals page's own
                // schema then refused — and the database would reject it anyway,
                // failing the whole patch with an opaque error.
                const candidate: Record<string, unknown> = { ...fields };
                if (typeof candidate.description === 'string') {
                    candidate.description = sanitizeHtml(candidate.description as string);
                }
                const checked = validateGoalFields(candidate);
                if (!checked.ok) {
                    throw new Error(`Update goal rejected: ${checked.errors.join('; ')}`);
                }
                const sanitizedFields: any = checked.data;

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

                const todayStr = dateFormatter.format(now);
                // No clock arithmetic here: replan_week starts at tomorrow, so
                // time-of-day never enters into it.

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

                // This week's Sunday. `replan_week` owns tomorrow..Sunday and
                // nothing else — see the delete below.
                const localSunday = new Date(localMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
                const weekEndStr = `${localSunday.getFullYear()}-${String(localSunday.getMonth() + 1).padStart(2, '0')}-${String(localSunday.getDate()).padStart(2, '0')}`;

                // 3. Generate. protocolConfig was `undefined`, so the mode's
                //    configured caps fell back to internal defaults and a coach
                //    replan packed days differently from the Plan Week button at
                //    the very same mode. replanFromDate is correct here: unlike
                //    plan_next_week, the replan point is genuinely inside the
                //    week being planned, which is the case that arithmetic is for.
                const mode = op.payload?.mode || 'balanced';
                const allowWeekend = op.payload?.allow_weekend !== false;
                const modeConfig = SchedulingProtocol.getModeConfig(mode);
                const variants = await generateWeekPlan(calendarCtx, weekStartStr, mode, allowWeekend, {
                    maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
                    maxDeepWorkMins: modeConfig.maxDeepWorkMins,
                }, tomorrowStr);

                if (!variants || variants.length === 0) {
                    throw new Error('Replan failed to generate any variants');
                }

                const newPlan = variants[0];
                console.log(`[PatchService] Generated ${newPlan.blocks.length} blocks for variant "${newPlan.label}"`);

                // 4. Clear and rewrite ONLY tomorrow..Sunday, through the one
                //    shared writer.
                //
                //    The delete this replaces was `.gt('date', todayStr)` with no
                //    upper bound: it removed EVERY future block the user had —
                //    including the next week the weekly review had just planned —
                //    and then reinserted only the current week. One coach message
                //    wiped next week and put nothing back.
                //
                //    Dropping the BIO_TYPES filter and switching to writeWeek are
                //    a single change on purpose. The old pairing was internally
                //    consistent — the delete preserved sleep/meals/wind-down and
                //    the insert skipped them precisely because they survived.
                //    writeWeek uses the opposite model: it clears them and expects
                //    the caller to supply them. Either half alone breaks the day
                //    (duplicated meals, or genuinely empty mornings).
                const bounded = newPlan.blocks.filter(
                    (b: any) => b.date > todayStr && b.date <= weekEndStr
                );

                const write = await writeWeek({
                    userId,
                    supabase,
                    action: 'replan',
                    clearRange: { start: tomorrowStr, end: weekEndStr },
                    notBefore: todayStr,
                    add: bounded,
                    filterCommitmentOverlaps: true,
                    enforceGoalDailyLimits: true,
                    // applyPatch already snapshots scope:'week' patches, and
                    // REGEN_OPS undo depends on that specific version id.
                    snapshot: false,
                });

                console.log(
                    `[PatchService] replan_week ${tomorrowStr}..${weekEndStr}: ` +
                    `+${write.added} -${write.removed} skipped=${write.skipped.length} failed=${write.failed.length}`
                );

                // Reported rather than swallowed — the coach can now say "3 blocks
                // couldn't be placed" instead of claiming a clean success.
                return {
                    window_start: tomorrowStr,
                    window_end: weekEndStr,
                    blocks_created: write.added,
                    blocks_cleared: write.removed,
                    blocks_skipped: write.skipped,
                    blocks_failed: write.failed,
                };
            }

            case 'plan_current_week': {
                // Plans the CURRENT Monday–Sunday with the SAME pipeline as the
                // Plan Week button. The weekly review's only job is deciding
                // what changes about the goals; all scheduling belongs to the
                // planner that already works.
                //
                // The accepted change reaches the plan through the `goals`
                // table, not through the scheduler: ops execute sequentially,
                // so the `update_goal` ops in this same patch have already
                // written e.g. minutes_per_day = 35 before buildCalendarContext
                // runs below. The planner reads 35 and plans 35. Nothing has to
                // tell it a weekly review happened.
                console.log('[PatchService] Starting plan_current_week...');

                const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
                const timezone = profile?.timezone || DEFAULT_TIMEZONE;
                const now = new Date();

                const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
                const todayStr = dateFormatter.format(now);

                // Timezone-safe Monday calculation (noon avoids DST shifts)
                const [yr, mo, dy] = todayStr.split('-').map(Number);
                const localToday = new Date(yr, mo - 1, dy, 12, 0, 0);
                const dayOfWeek = localToday.getDay(); // 0=Sun, 1=Mon
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const localMonday = new Date(localToday.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
                const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                const currentMondayStr = fmt(localMonday);
                const currentSundayStr = fmt(new Date(localMonday.getTime() + 6 * 24 * 60 * 60 * 1000));

                console.log(`[PatchService] plan_current_week — tz=${timezone} today=${todayStr} window=${currentMondayStr}..${currentSundayStr}`);

                // Guard: don't plan if the whole week is in the past.
                if (currentSundayStr < todayStr) {
                    throw new Error(`plan_current_week refused: computed window ${currentMondayStr}..${currentSundayStr} is in the past compared to today ${todayStr}`);
                }

                const mode = op.payload?.mode || 'balanced';
                const allowWeekend = op.payload?.allow_weekend !== false;

                // Commitments become exclusion WINDOWS inside the generator, not
                // blocks, so the target week gets its anchors from the anchor
                // service. Idempotent per commitment, so this also repairs a week
                // beyond the 30-day horizon /api/anchors materialises on create.
                const { data: commitments } = await supabase
                    .from('commitments')
                    .select('id, title, start_time, end_time, days_of_week')
                    .eq('user_id', userId)
                    .eq('is_active', true);
                for (const c of commitments || []) {
                    try {
                        await AnchorService.materialize(
                            userId, c,
                            new Date(`${currentMondayStr}T12:00:00`),
                            new Date(`${currentSundayStr}T12:00:00`),
                            supabase
                        );
                    } catch (e: any) {
                        console.error(`[PatchService] Anchor "${c.title}" failed to materialise: ${e?.message || e}`);
                    }
                }

                const calendarCtx = await buildCalendarContext(userId, supabase, currentMondayStr);

                const modeConfig = SchedulingProtocol.getModeConfig(mode);

                // The generator is still run — but ONLY for the bio scaffolding
                // (sleep, meals, morning routine, wind-down), which is a
                // deterministic function of the profile. Goal blocks come from
                // the week that already works.
                const variants = await generateWeekPlan(calendarCtx, currentMondayStr, mode, allowWeekend, {
                    maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
                    maxDeepWorkMins: modeConfig.maxDeepWorkMins,
                });
                if (!variants || variants.length === 0) {
                    throw new Error('plan_current_week failed to generate any variants');
                }
                const generated = variants[0];

                const bioBlocks = generated.blocks.filter(
                    (b: any) => BIO_TYPES.has(b.block_type) && b.date >= currentMondayStr && b.date <= currentSundayStr
                );

                // §2: the source week is LAST week, because we are planning THIS week.
                const lastMonday = new Date(localMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
                const sourceWeekStart = op.payload?.source_week_start || fmt(lastMonday);
                const acceptedChanges = op.payload?.changes || [];
                const windDownMins = (() => {
                    const [h, m] = String(calendarCtx.user.sleep_start || '23:00').split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                })();

                const wakeMins = (() => {
                    const [h, m] = String(calendarCtx.user.sleep_end || '07:00').split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                })();
                const copy = await copyWeekForward({
                    supabase, userId,
                    sourceWeekStart,
                    targetWeekStart: currentMondayStr,
                    changes: acceptedChanges,
                    weekIsOvercommitted: !!calendarCtx.capacity?.is_overcommitted,
                    windDownMins,
                    wakeMins,
                    bioBlocks,
                    bufferMins: (calendarCtx.user as any).default_buffer_duration || 15,
                });

                let path: 'copy_forward' | 'full_generation' = 'copy_forward';
                let goalBlocksToWrite = copy.blocks;
                if (!copy.usable) {
                    // Nothing to copy — fall back to a full generation and say so.
                    path = 'full_generation';
                    goalBlocksToWrite = generated.blocks.filter(
                        (b: any) => !BIO_TYPES.has(b.block_type) && b.date >= currentMondayStr && b.date <= currentSundayStr
                    );
                }

                for (const n of copy.notes) console.log(`[PlanCurrentWeek] ${n}`);
                for (const t of copy.triage) {
                    console.log(`[PlanCurrentWeek] triage ${t.branch}: "${t.title}" ${t.date} ${t.time} — ${t.reason}`);
                }

                const write = await writeWeek({
                    userId,
                    supabase,
                    action: 'weekly_review',
                    clearRange: { start: currentMondayStr, end: currentSundayStr },
                    notBefore: todayStr,
                    add: [...bioBlocks, ...goalBlocksToWrite],
                    filterCommitmentOverlaps: true,
                    enforceGoalDailyLimits: true,
                    snapshot: false, // applyPatch records its own version
                });

                const byType: Record<string, number> = {};
                for (const b of [...bioBlocks, ...goalBlocksToWrite]) {
                    byType[b.block_type] = (byType[b.block_type] || 0) + 1;
                }

                // §5: sometimes the week genuinely cannot hold the goals. Say
                // which goal, how many minutes and why, rather than handing over
                // a calendar with silent gaps.
                const shortfalls = (path === 'full_generation' ? (generated.stats.goal_placements || []) : [])
                    .filter((p) => !p.already_met && p.placed_mins < p.target_mins)
                    .map((p) => ({
                        goal_id: p.goal_id,
                        title: p.title,
                        target_mins: p.target_mins,
                        placed_mins: p.placed_mins,
                        short_by_mins: p.target_mins - p.placed_mins,
                        reason: p.skipped_reason || 'no window could hold it',
                    }));
                for (const sf of shortfalls) {
                    console.warn(
                        `[PatchService] ${sf.title} is ${sf.short_by_mins}m short next week ` +
                        `(${sf.placed_mins}/${sf.target_mins}m): ${sf.reason}`
                    );
                }

                console.log(
                    `[PatchService] plan_current_week: +${write.added} -${write.removed} ` +
                    `skipped=${write.skipped.length} failed=${write.failed.length} | ${JSON.stringify(byType)}`
                );

                return {
                    week_end: currentSundayStr,
                    blocks_created: write.added,
                    blocks_cleared: write.removed,
                    blocks_by_type: byType,
                    blocks_skipped: write.skipped,
                    blocks_failed: write.failed,
                    goal_shortfalls: shortfalls,
                    path,
                    source_week_start: sourceWeekStart,
                    triage: copy.triage,
                    notes: copy.notes,
                    source_goal_hours: Math.round((copy.sourceGoalMinutes / 60) * 10) / 10,
                    copied_goal_hours: Math.round((copy.copiedGoalMinutes / 60) * 10) / 10,
                };
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

                // 3. Generate. protocolConfig was `undefined`; see replan_week.
                //    replanFromDate = todayStr is correct — the replan point is
                //    inside the week being planned.
                const mode = op.payload?.mode || 'balanced';
                const allowWeekend = op.payload?.allow_weekend !== false;
                const modeConfig = SchedulingProtocol.getModeConfig(mode);
                const variants = await generateWeekPlan(calendarCtx, weekStartStr, mode, allowWeekend, {
                    maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
                    maxDeepWorkMins: modeConfig.maxDeepWorkMins,
                }, todayStr);

                if (!variants || variants.length === 0) {
                    throw new Error('Replan failed to generate any variants');
                }

                const newPlan = variants[0];
                console.log(`[PatchService] Generated ${newPlan.blocks.length} blocks for variant "${newPlan.label}"`);

                /**
                 * Everything this op is allowed to touch: TODAY, at or after the
                 * current time. Applied identically to what is removed and what
                 * is added, which is what keeps the day internally consistent —
                 * a bio block earlier today is neither deleted nor re-inserted,
                 * so it simply survives.
                 */
                const withinToday = (date: string, startTime: string): boolean => {
                    if (date !== todayStr) return false;
                    const [bh, bm] = String(startTime).split(':').map(Number);
                    return (bh || 0) * 60 + (bm || 0) >= nowTime;
                };

                // 4. Compute the removals explicitly.
                //
                //    `clearRange` cannot express this: `notBefore` is date-
                //    granular, and "today, but only after 14:30" is not a date.
                //
                //    The delete this replaces was `.gte('date', todayStr)` with no
                //    upper bound — it removed every future block the user had,
                //    then reinserted only the current week, so a coach message
                //    asking to fix TODAY wiped next week. It also filtered on
                //    `is_locked` without ever selecting it, so that check has
                //    never once fired.
                const { data: todayBlocks, error: readErr } = await supabase
                    .from('schedule_blocks')
                    .select('id, block_type, start_time, status, date, is_locked')
                    .eq('user_id', userId)
                    .eq('date', todayStr);
                if (readErr) throw new Error(`Replan failed to read today: ${readErr.message}`);

                const idsToRemove = (todayBlocks || []).filter((b: any) => {
                    if (!withinToday(b.date, b.start_time)) return false; // earlier today is safe
                    if (b.is_locked) return false;
                    if (b.block_type === 'anchor') return false;
                    if (b.status === 'done' || b.status === 'in_progress') return false;
                    return true;
                }).map((b: any) => b.id);

                // 5. The replacement set, under the SAME predicate. Bio blocks
                //    are included now (the BIO_TYPES filter is gone) because the
                //    removals above no longer spare them — the two halves have to
                //    change together or the day ends up with duplicated meals or
                //    no evening at all.
                const dayBlocks = newPlan.blocks.filter((b: any) => withinToday(b.date, b.start_time));

                const bioToday = dayBlocks.filter((b: any) =>
                    ['sleep', 'meal', 'wind_down', 'routine'].includes(b.block_type)).length;
                console.log(
                    `[PatchService] replan_day ${todayStr} from ${String(Math.floor(nowTime / 60)).padStart(2, '0')}:` +
                    `${String(nowTime % 60).padStart(2, '0')} — removing ${idsToRemove.length}, adding ${dayBlocks.length} ` +
                    `(${bioToday} of them bio)`
                );

                const write = await writeWeek({
                    userId,
                    supabase,
                    action: 'replan',
                    clearRange: null,
                    remove: idsToRemove,
                    add: dayBlocks,
                    filterCommitmentOverlaps: true,
                    enforceGoalDailyLimits: true,
                    snapshot: false,
                });

                console.log(
                    `[PatchService] replan_day: +${write.added} -${write.removed} ` +
                    `skipped=${write.skipped.length} failed=${write.failed.length}`
                );

                return {
                    date: todayStr,
                    from_minute: nowTime,
                    blocks_created: write.added,
                    blocks_cleared: write.removed,
                    blocks_skipped: write.skipped,
                    blocks_failed: write.failed,
                };
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
            } else if (opType === 'replan_week' || opType === 'plan_current_week' || opType === 'replan_day') {
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
