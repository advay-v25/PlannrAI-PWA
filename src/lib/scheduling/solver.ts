/**
 * Scheduling Solver
 * Pure functional logic for calendar operations.
 * Decoupled from Database and API layers.
 */

import { addMinutes, format, parse, differenceInMinutes, areIntervalsOverlapping, isWithinInterval } from 'date-fns';

// ============================================
// TYPES
// ============================================

export interface TimeSlot {
    start: Date;
    end: Date;
}

export interface ScheduleItem {
    id: string;
    start: Date;
    end: Date;
    type: 'fixed' | 'flexible';
}

export interface SolverConstraints {
    workStartHour: number; // e.g., 9
    workEndHour: number;   // e.g., 17
    minGapMinutes?: number;
}

// ============================================
// CORE LOGIC
// ============================================

/**
 * Finds the first available gap of a given duration options
 */
export function findNextAvailableSlot(
    items: ScheduleItem[],
    durationMinutes: number,
    referenceDate: Date,
    constraints: SolverConstraints = { workStartHour: 8, workEndHour: 22 }
): TimeSlot | null {
    const sortedItems = [...items]
        .filter(i => isSameDay(i.start, referenceDate))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    // Define search window
    const searchStart = new Date(referenceDate);
    searchStart.setHours(constraints.workStartHour, 0, 0, 0);

    const searchEnd = new Date(referenceDate);
    searchEnd.setHours(constraints.workEndHour, 0, 0, 0);

    // If current time is past start, search from now (rounded up to next 15 min)
    let cursor = new Date(Math.max(Date.now(), searchStart.getTime()));
    const remainder = cursor.getMinutes() % 15;
    if (remainder !== 0) {
        cursor = addMinutes(cursor, 15 - remainder);
    }

    // Iterate through day
    while (addMinutes(cursor, durationMinutes) <= searchEnd) {
        const candidateEnd = addMinutes(cursor, durationMinutes);
        const candidateSlot = { start: cursor, end: candidateEnd };

        // Check collision
        const hasCollision = sortedItems.some(item =>
            areIntervalsOverlapping(candidateSlot, { start: item.start, end: item.end })
        );

        if (!hasCollision) {
            return candidateSlot;
        }

        // Optimization: Jump to end of colliding block
        const collider = sortedItems.find(item =>
            areIntervalsOverlapping(candidateSlot, { start: item.start, end: item.end })
        );

        if (collider) {
            cursor = collider.end;
            // Round up to nearest 5 min
            const rem = cursor.getMinutes() % 5;
            if (rem !== 0) cursor = addMinutes(cursor, 5 - rem);
        } else {
            cursor = addMinutes(cursor, 15);
        }
    }

    return null;
}

/**
 * Rebuilds a day by keeping fixed items and reflowing flexible ones
 */
export function rebuildSchedule(
    fixedItems: ScheduleItem[],
    flexibleItems: { id: string, duration: number }[],
    referenceDate: Date,
    constraints: SolverConstraints = { workStartHour: 8, workEndHour: 22 }
): Map<string, TimeSlot> {
    const results = new Map<string, TimeSlot>();

    // Current placed items starts with fixed ones
    const placedItems = [...fixedItems];

    for (const flexItem of flexibleItems) {
        const slot = findNextAvailableSlot(
            placedItems,
            flexItem.duration,
            referenceDate,
            constraints
        );

        if (slot) {
            results.set(flexItem.id, slot);
            placedItems.push({
                id: flexItem.id,
                start: slot.start,
                end: slot.end,
                type: 'flexible'
            });
            // Sort again so finding next slot optimization works
            placedItems.sort((a, b) => a.start.getTime() - b.start.getTime());
        }
    }

    return results;
}

/**
 * Detects conflicts in a schedule
 */
export function detectConflicts(items: ScheduleItem[]): Array<{ a: string, b: string }> {
    const conflicts: Array<{ a: string, b: string }> = [];

    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            if (areIntervalsOverlapping(
                { start: items[i].start, end: items[i].end },
                { start: items[j].start, end: items[j].end }
            )) {
                conflicts.push({ a: items[i].id, b: items[j].id });
            }
        }
    }

    return conflicts;
}

/**
 * Resolves overlaps in a schedule by prioritizing Fixed items.
 * Flexible items are moved to the next available slot.
 */
export function resolveOverlaps(
    items: ScheduleItem[],
    referenceDate: Date,
    constraints: SolverConstraints = { workStartHour: 8, workEndHour: 22 }
): { resolved: ScheduleItem[], conflicts: string[], moved: string[] } {
    // 1. Separate Fixed and Flexible
    const fixed = items.filter(i => i.type === 'fixed');
    const flexible = items.filter(i => i.type === 'flexible'); // These are candidates to move

    const resolved: ScheduleItem[] = [];
    const movedIds: string[] = [];
    const unresolvableIds: string[] = [];

    // 2. Place Fixed items first (They are immutable in this context)
    // specific check: do fixed items overlap each other?
    fixed.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const f of fixed) {
        // specific check: does this fixed item overlap with already placed fixed items?
        const collision = resolved.find(r => areIntervalsOverlapping(
            { start: r.start, end: r.end },
            { start: f.start, end: f.end }
        ));

        if (collision) {
            // Anchor vs Anchor conflict -> Fatal
            unresolvableIds.push(f.id);
        } else {
            resolved.push(f);
        }
    }

    // 3. Place Flexible items, moving them if they collide with Fixed OR other placed Flexible
    // Sort flexible items by original start time to keep relative order
    flexible.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const flex of flexible) {
        const duration = differenceInMinutes(flex.end, flex.start);

        // Try original slot first
        const isClean = !resolved.some(r => areIntervalsOverlapping(
            { start: r.start, end: r.end },
            { start: flex.start, end: flex.end }
        ));

        if (isClean) {
            resolved.push(flex);
            continue;
        }

        // Collision! Find next slot.
        // We look for a slot that avoids ALL currently placed items (Fixed + Placed Flexible)
        // We start searching from the original start time (push forward)
        const newSlot = findNextAvailableSlot(
            resolved,
            duration,
            referenceDate,
            { ...constraints, workStartHour: Math.min(constraints.workStartHour, flex.start.getHours()) } // allow starting earlier if needed? No, usually push forward.
        );

        if (newSlot) {
            resolved.push({
                ...flex,
                start: newSlot.start,
                end: newSlot.end
            });
            movedIds.push(flex.id);
        } else {
            unresolvableIds.push(flex.id);
        }
    }

    return {
        resolved,
        conflicts: unresolvableIds,
        moved: movedIds
    };
}

// Helper
function isSameDay(d1: Date, d2: Date) {
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}
