import { addMinutes, startOfDay, format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

/**
 * Patch Generator (Contract Compliant)
 * 
 * Generates schedule adjustments using the official CalendarPatch schema.
 * Supports patterns for Busy, Fatigue, Tasks, and Appointments.
 */

export interface PatchOp {
    op: 'CREATE_ANCHOR' | 'MOVE' | 'HIDE' | 'UPDATE';
    [key: string]: any;
}

export const PatchGenerator = {
    /**
     * Pattern 1: Busy Block
     * Shifts conflicting tasks 2 hours later.
     */
    async handleBusy(
        ctx: any,
        busyStart: string,
        busyEnd: string
    ): Promise<PatchOp[]> {
        const busyS = new Date(busyStart);
        const busyE = new Date(busyEnd);

        const conflicts = (ctx.schedule || []).filter((b: any) => {
            const bStart = new Date(b.start_time);
            const bEnd = new Date(b.end_time);
            return bStart < busyE && bEnd > busyS && !b.is_locked && b.block_type !== 'anchor';
        });

        if (conflicts.length === 0) return [];

        return conflicts.map((b: any) => ({
            op: 'MOVE',
            event_id: b.id,
            new_start_ts: addMinutes(new Date(b.start_time), 120).toISOString(),
            new_end_ts: addMinutes(new Date(b.end_time), 120).toISOString()
        }));
    },

    /**
     * Pattern 2: Fatigue / Overwhelm
     * Shortens flexible task durations by 50%.
     */
    async handleFatigue(ctx: any): Promise<PatchOp[]> {
        const rangeEnd = new Date(ctx.now);
        rangeEnd.setHours(23, 59, 59, 999);

        const heavyBlocks = (ctx.schedule || []).filter((b: any) => {
            const bStart = new Date(b.start_time);
            return bStart > new Date(ctx.now) &&
                bStart < rangeEnd &&
                (b.energy_cost === 'high' || b.block_type === 'task');
        });

        return heavyBlocks.map((b: any) => {
            const start = new Date(b.start_time);
            const end = new Date(b.end_time);
            const duration = (end.getTime() - start.getTime()) / 60000;
            const newDuration = Math.max(15, Math.floor(duration * 0.5));

            return {
                op: 'MOVE',
                event_id: b.id,
                new_start_ts: start.toISOString(),
                new_end_ts: addMinutes(start, newDuration).toISOString()
            };
        });
    },

    /**
     * Pattern 3: Simple Task Insertion
     */
    async handleAdd(
        ctx: any,
        title: string,
        durationMinutes: number = 30,
        preferredTime?: string
    ): Promise<PatchOp[]> {
        const start = preferredTime ? new Date(preferredTime) : addMinutes(new Date(ctx.now), 30);
        const end = addMinutes(start, durationMinutes);

        return [{
            op: 'CREATE_ANCHOR',
            title,
            start_ts: start.toISOString(),
            end_ts: end.toISOString(),
            locked: true,
            block_type: 'goal'
        }];
    },

    /**
     * Pattern 4: Fixed Appointment / Commitment
     */
    async handleCommitment(
        ctx: any,
        title: string,
        startIso: string,
        endIso: string
    ): Promise<PatchOp[]> {
        const ops: PatchOp[] = [];

        ops.push({
            op: 'CREATE_ANCHOR',
            title,
            start_ts: startIso,
            end_ts: endIso,
            locked: true,
            block_type: 'anchor'
        });

        const cStart = new Date(startIso);
        const cEnd = new Date(endIso);

        (ctx.schedule || []).forEach((b: any) => {
            const bStart = new Date(b.start_time);
            const bEnd = new Date(b.end_time);
            if (bStart < cEnd && bEnd > cStart && !b.is_locked) {
                ops.push({
                    op: 'MOVE',
                    event_id: b.id,
                    new_start_ts: addMinutes(bStart, 60).toISOString(),
                    new_end_ts: addMinutes(bEnd, 60).toISOString()
                });
            }
        });

        return ops;
    },

    /**
     * Pattern 5: Recovery Mode
     * Clears all flexible blocks for rest of day.
     */
    async handleRecovery(ctx: any): Promise<PatchOp[]> {
        const rangeEnd = new Date(ctx.now);
        rangeEnd.setHours(23, 59, 59, 999);

        const tasks = (ctx.schedule || []).filter((b: any) => {
            const bStart = new Date(b.start_time);
            return bStart > new Date(ctx.now) &&
                bStart < rangeEnd &&
                !b.is_locked &&
                b.block_type !== 'anchor';
        });

        return tasks.map((b: any) => ({
            op: 'HIDE',
            event_id: b.id
        }));
    }
};
