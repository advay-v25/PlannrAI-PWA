/**
 * ⚡ PLANNRAI — OPTIMIZE DAY (deterministic)
 * Analyzes the target day's schedule and generates optimization options.
 *
 * Strategies:
 * - balanced: ensure every goal reaches its daily target with buffer time between blocks
 * - momentum: fill every goal's daily target tightly, then pull mind/craft goal blocks
 *   from later days this week into today's free slots (never body blocks)
 * - recovery: push low-priority blocks to the next day; medium/high priority stay
 *
 * Hard rules:
 * - NEVER moves, deletes, or overlaps sleep, meals, anchors, routines, or wind-down
 *   blocks (or anything fixed/locked/commitment-backed)
 * - Mind/craft goals may have multiple blocks on the same day; body goals may not
 */

import type { CalendarContext, ScheduleBlock } from '@/lib/calendar/context-builder';

// ── Types ────────────────────────────────────────────────────────

interface DayOptimization {
    id: string;
    label: string;
    description: string;
    tradeoff: string;
    ops: PatchOp[];
}

interface PatchOp {
    op: 'create_event' | 'move_event' | 'update_event' | 'delete_event';
    event_id?: string;
    payload?: any;
    to_start?: string;
    to_end?: string;
    fields?: Record<string, any>;
}

export interface OptimizeDayResult {
    analysis: {
        energy_state: string;
        schedule_health: string;
        recommendation: string;
    };
    options: DayOptimization[];
}

// ── Utilities ────────────────────────────────────────────────────

const PROTECTED_TYPES = ['sleep', 'meal', 'anchor', 'routine', 'wind_down'];

function timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function minutesToTime(mins: number): string {
    const safe = ((Math.round(mins) % 1440) + 1440) % 1440;
    return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function addDaysISO(dateStr: string, n: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

function isProtectedBlock(b: ScheduleBlock): boolean {
    return PROTECTED_TYPES.includes(b.block_type)
        || !!b.is_fixed
        || !!b.commitment_id
        || (b as any).is_locked === true;
}

type PriorityLevel = 'low' | 'medium' | 'high';

function goalPriority(goal: any): PriorityLevel {
    const p = goal?.importance ?? goal?.priority;
    if (typeof p === 'string') {
        if (p === 'high') return 'high';
        if (p === 'low') return 'low';
        return 'medium';
    }
    if (typeof p === 'number') {
        if (p >= 7) return 'high';
        if (p <= 3) return 'low';
        return 'medium';
    }
    return 'medium';
}

// ── Slot allocator ───────────────────────────────────────────────
// Tracks occupied intervals for one day and hands out free slots.

interface Interval { start: number; end: number }

class DayAllocator {
    private occupied: Interval[] = [];
    constructor(
        private dayStart: number,
        private dayEnd: number,
    ) { }

    block(start: number, end: number) {
        if (end > start) this.occupied.push({ start, end });
    }

    /** Find and consume the first slot that fits `duration`, keeping `buffer`
     *  minutes of separation from already-occupied time. */
    allocate(duration: number, buffer: number): Interval | null {
        const merged = [...this.occupied].sort((a, b) => a.start - b.start);
        let cursor = this.dayStart;
        for (const iv of merged) {
            if (iv.end <= cursor) continue;
            const gapEnd = Math.min(iv.start, this.dayEnd);
            const usableStart = cursor === this.dayStart ? cursor : cursor + buffer;
            const usableEnd = gapEnd >= this.dayEnd ? gapEnd : gapEnd - buffer;
            if (usableEnd - usableStart >= duration) {
                const slot = { start: usableStart, end: usableStart + duration };
                this.block(slot.start, slot.end);
                return slot;
            }
            cursor = Math.max(cursor, iv.end);
            if (cursor >= this.dayEnd) return null;
        }
        // Tail gap after the last occupied interval
        const usableStart = cursor === this.dayStart ? cursor : cursor + buffer;
        if (this.dayEnd - usableStart >= duration) {
            const slot = { start: usableStart, end: usableStart + duration };
            this.block(slot.start, slot.end);
            return slot;
        }
        return null;
    }
}

// ── Context helpers ──────────────────────────────────────────────

function blocksForDate(context: CalendarContext, date: string): ScheduleBlock[] {
    const seen = new Set<string>();
    const out: ScheduleBlock[] = [];
    const pools = date === context.current.date
        ? [context.schedule.today, context.schedule.this_week]
        : [context.schedule.this_week, context.schedule.today];
    for (const pool of pools) {
        for (const b of pool || []) {
            if (b.date !== date || seen.has(b.id)) continue;
            seen.add(b.id);
            out.push(b);
        }
    }
    return out.filter(b => b.status !== 'cancelled');
}

function commitmentsForDate(context: CalendarContext, date: string): Interval[] {
    const dow = new Date(date + 'T12:00:00').getDay();
    return (context.commitments || [])
        .filter((c: any) => c.is_active !== false && (c.days_of_week || []).map(Number).includes(dow))
        .map((c: any) => ({ start: timeToMinutes(c.start_time), end: timeToMinutes(c.end_time) }));
}

function buildAllocator(context: CalendarContext, date: string, extraBlocked: Interval[] = []): DayAllocator {
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const sleepMins = timeToMinutes(context.user.sleep_start || '23:00');
    const windDownStart = ((sleepMins - (context.user.wind_down_mins || 30)) + 1440) % 1440;

    const dayStartBase = wakeMins + (context.user.morning_routine_mins || 0);
    // If wind-down lands "before" wake numerically (sleep after midnight), cap at 23:59
    const dayEnd = windDownStart > dayStartBase ? windDownStart : 1439;

    // Never place anything before the current moment on today's schedule
    const nowMins = date === context.current.date ? timeToMinutes(context.current.time) : 0;
    const dayStart = Math.max(dayStartBase, nowMins);

    const alloc = new DayAllocator(dayStart, dayEnd);
    for (const b of blocksForDate(context, date)) {
        alloc.block(timeToMinutes(b.start_time), timeToMinutes(b.end_time));
    }
    for (const iv of commitmentsForDate(context, date)) alloc.block(iv.start, iv.end);
    for (const iv of extraBlocked) alloc.block(iv.start, iv.end);
    return alloc;
}

function scheduledMinutesForGoal(blocks: ScheduleBlock[], goalId: string): number {
    return blocks
        .filter(b => b.goal_id === goalId)
        .reduce((sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
}

function makeGoalCreateOp(goal: any, slot: Interval): PatchOp {
    return {
        op: 'create_event',
        payload: {
            title: goal.title,
            start_time: minutesToTime(slot.start),
            end_time: minutesToTime(slot.end),
            block_type: 'goal',
            goal_id: goal.id,
            pillar: goal.pillar || null,
            status: 'planned',
            checklist: [],
        },
    };
}

/** Create blocks that top every goal up to its daily target. Body goals get at
 *  most one block per day; mind/craft may split into multiple chunks. */
function fillGoalsToDailyTarget(
    context: CalendarContext,
    date: string,
    alloc: DayAllocator,
    buffer: number,
    goalFilter?: (g: any) => boolean,
): { ops: PatchOp[]; placed: string[] } {
    const dayBlocks = blocksForDate(context, date);
    const ops: PatchOp[] = [];
    const placed: string[] = [];

    const goals = [...(context.goals || [])]
        .filter(g => g.is_active !== false)
        .filter(g => !goalFilter || goalFilter(g))
        .sort((a, b) => (b.importance || 5) - (a.importance || 5));

    let bodyPlacedThisRun = dayBlocks.some(b => {
        const g = context.goals.find(gg => gg.id === b.goal_id);
        return (b.pillar || g?.pillar || '').toLowerCase() === 'body';
    });

    for (const goal of goals) {
        const target = goal.minutes_per_day || 60;
        // Never exceed the goal's daily allowance — chunks are capped at `remaining`
        let remaining = target - scheduledMinutesForGoal(dayBlocks, goal.id);
        if (remaining < 30) continue;

        const isBody = (goal.pillar || '').toLowerCase() === 'body';
        if (isBody && bodyPlacedThisRun) continue; // strictly one body block per day

        let chunksPlaced = 0;
        while (remaining >= 30) {
            const chunk = Math.min(90, remaining);
            const slot = alloc.allocate(chunk, buffer);
            if (!slot) break;
            ops.push(makeGoalCreateOp(goal, slot));
            placed.push(`${goal.title} (${minutesToTime(slot.start)}–${minutesToTime(slot.end)})`);
            remaining -= (slot.end - slot.start);
            chunksPlaced++;
            if (isBody) { bodyPlacedThisRun = true; break; } // body goals: single block only
            if (chunksPlaced >= 3) break; // sanity cap
        }
    }

    return { ops, placed };
}

// ── Main Function ────────────────────────────────────────────────

export async function optimizeDayAI(
    context: CalendarContext,
    focus?: string,
    targetDate?: string
): Promise<OptimizeDayResult> {
    const date = targetDate || context.current.date;
    const dayBlocks = blocksForDate(context, date);
    const currentMins = date === context.current.date ? timeToMinutes(context.current.time) : 0;

    const remainingBlocks = dayBlocks.filter(b =>
        timeToMinutes(b.start_time) >= currentMins && b.status !== 'done'
    );

    const health = remainingBlocks.length > 8 ? 'overloaded'
        : remainingBlocks.length > 4 ? 'busy but manageable'
        : remainingBlocks.length > 0 ? 'balanced'
        : 'light';

    const options: DayOptimization[] = [];

    // ── RECOVERY: push low-priority blocks to the next day ───────
    if (focus === 'recovery') {
        const nextDate = addDaysISO(date, 1);
        const nextAlloc = buildAllocator(context, nextDate);
        const ops: PatchOp[] = [];
        const movedTitles: string[] = [];
        const keptTitles: string[] = [];

        for (const b of remainingBlocks) {
            if (isProtectedBlock(b)) continue;
            const goal = context.goals.find(g => g.id === b.goal_id);
            const isLowPriority = goal
                ? goalPriority(goal) === 'low'
                : (b.block_type === 'flex'); // un-linked flex blocks are non-urgent
            if (!isLowPriority) {
                if (b.block_type === 'goal' || b.block_type === 'flex') keptTitles.push(b.title);
                continue;
            }

            const duration = Math.max(30, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
            const slot = nextAlloc.allocate(duration, 15);
            if (!slot) continue; // no space tomorrow — leave the block where it is

            ops.push({
                op: 'update_event',
                event_id: b.id,
                fields: {
                    date: nextDate,
                    start_time: minutesToTime(slot.start),
                    end_time: minutesToTime(slot.end),
                },
            });
            movedTitles.push(b.title);
        }

        options.push({
            id: 'recovery_push',
            label: 'Recovery Mode',
            description: movedTitles.length > 0
                ? `Moves ${movedTitles.length} low-priority block${movedTitles.length > 1 ? 's' : ''} to tomorrow: ${movedTitles.join(', ')}.${keptTitles.length ? ` Keeps: ${keptTitles.join(', ')}.` : ''}`
                : 'No low-priority blocks left to move — your remaining schedule is already essential.',
            tradeoff: movedTitles.length > 0
                ? 'Tomorrow will be slightly fuller, but today gets breathing room.'
                : 'No changes needed.',
            ops,
        });
        options.push({
            id: 'keep_current',
            label: 'Keep Current',
            description: `Keep your ${remainingBlocks.length} remaining block${remainingBlocks.length === 1 ? '' : 's'} as-is.`,
            tradeoff: 'No disruption to the existing plan.',
            ops: [],
        });
    }

    // ── MOMENTUM: fill today's goals + pull mind/craft from later days ──
    else if (focus === 'momentum') {
        const tightBuffer = 5;

        // Option 1: fill + pull forward
        const alloc1 = buildAllocator(context, date);
        const fill1 = fillGoalsToDailyTarget(context, date, alloc1, tightBuffer);
        const pullOps: PatchOp[] = [];
        const pulledTitles: string[] = [];

        const futureCandidates = (context.schedule.this_week || [])
            .filter(b => b.date > date && b.status === 'planned' && !isProtectedBlock(b))
            .filter(b => {
                const goal = context.goals.find(g => g.id === b.goal_id);
                const pillar = (b.pillar || goal?.pillar || '').toLowerCase();
                // Only mind/craft goal blocks may be pulled forward — never body
                return b.block_type === 'goal' && !!b.goal_id && (pillar === 'mind' || pillar === 'craft');
            })
            .sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

        for (const b of futureCandidates) {
            const duration = Math.max(30, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
            const slot = alloc1.allocate(duration, tightBuffer);
            if (!slot) break; // day is full
            pullOps.push({
                op: 'update_event',
                event_id: b.id,
                fields: {
                    date,
                    start_time: minutesToTime(slot.start),
                    end_time: minutesToTime(slot.end),
                },
            });
            pulledTitles.push(b.title);
        }

        options.push({
            id: 'full_momentum',
            label: 'Full Momentum',
            description: [
                fill1.placed.length > 0 ? `Fills today's goal targets: ${fill1.placed.join(', ')}.` : '',
                pulledTitles.length > 0 ? `Pulls forward from later this week: ${pulledTitles.join(', ')}.` : '',
            ].filter(Boolean).join(' ') || 'Today is already at maximum density — nothing more fits.',
            tradeoff: 'A packed day, but you get ahead on the week. Body blocks are never doubled.',
            ops: [...fill1.ops, ...pullOps],
        });

        // Option 2: fill today's targets only
        const alloc2 = buildAllocator(context, date);
        const fill2 = fillGoalsToDailyTarget(context, date, alloc2, tightBuffer);
        options.push({
            id: 'steady_momentum',
            label: 'Steady Momentum',
            description: fill2.placed.length > 0
                ? `Completes today's goal targets without borrowing from other days: ${fill2.placed.join(', ')}.`
                : 'All goals already meet their daily targets — nothing to add.',
            tradeoff: 'High output while keeping the rest of the week intact.',
            ops: fill2.ops,
        });
    }

    // ── BALANCED (default): meet today's goals with buffer time ──
    else {
        const buffer = Math.max(10, context.user.default_buffer_duration || 15);

        const alloc1 = buildAllocator(context, date);
        const fill1 = fillGoalsToDailyTarget(context, date, alloc1, buffer);
        options.push({
            id: 'balanced_day',
            label: 'Balanced Day',
            description: fill1.placed.length > 0
                ? `Schedules the remaining time for every goal with ${buffer}min buffers: ${fill1.placed.join(', ')}.`
                : 'All goals already meet their daily targets — your day is balanced.',
            tradeoff: 'Sustainable pace with recovery space between blocks.',
            ops: fill1.ops,
        });

        const alloc2 = buildAllocator(context, date);
        const fill2 = fillGoalsToDailyTarget(context, date, alloc2, buffer * 2,
            g => goalPriority(g) !== 'low');
        options.push({
            id: 'priority_focus',
            label: 'Priority Focus',
            description: fill2.placed.length > 0
                ? `Schedules only medium/high-priority goals with extra-wide ${buffer * 2}min buffers: ${fill2.placed.join(', ')}.`
                : 'No medium/high-priority goals need more time today.',
            tradeoff: 'Low-priority goals wait, giving the essentials maximum space.',
            ops: fill2.ops,
        });
    }

    const totalChanges = options.reduce((s, o) => s + o.ops.length, 0);

    return {
        analysis: {
            energy_state: `${context.user.energy_level || 5}/10 energy, ${context.user.stress_level || 3}/10 stress`,
            schedule_health: health,
            recommendation: totalChanges === 0
                ? 'Your schedule already satisfies this strategy — no changes needed.'
                : focus === 'recovery'
                    ? 'Lighten today and protect your energy — essentials stay put.'
                    : focus === 'momentum'
                        ? 'Maximize output today; fixed blocks and meals stay untouched.'
                        : 'Meet every goal today with breathing room between blocks.',
        },
        options,
    };
}
