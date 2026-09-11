/**
 * 🗓️ PLANNRAI — PLAN WEEK DETERMINISTIC GENERATOR
 * Generates 3 weekly schedule variants using strict mathematical constraints.
 * Replaces unreliable LLM bin-packing with guaranteed day/minute accuracy.
 */

import type { CalendarContext } from '@/lib/calendar/context-builder';
import { addDays, format, parseISO } from 'date-fns';
import {
    computeDayPhases,
    type DayPhase,
    filterWindowsByEnergyCompat,
    scoreWindowAffinity,
    getDaySessionState,
    computeSessionRoomLeft,
    requiresSessionBreakGap,
    resolveAdjacencyBuffer,
    getFailureModeAdjustments,
} from './practical-constraints';

// ── Types ────────────────────────────────────────────────────────

export interface GoalPlacement {
    goal_id: string;
    title: string;
    target_mins: number;
    placed_mins: number;
    blocks: number;
    days_used: number;
    days_allowed: number;
    already_met?: boolean;
    skipped_reason?: string;
}

export interface WeekPlanVariant {
    id: string;
    label: string;
    description: string;
    philosophy: string;
    blocks: PlanBlock[];
    stats: {
        total_blocks: number;
        total_hours: number;
        days_with_work: number;
        unscheduled_minutes: Record<string, number>;
        goal_placements?: GoalPlacement[];
        /**
         * §4: low-importance goals deliberately omitted from a recovery week.
         * These are NOT shortfalls — surfacing them as "Reading is 315 min
         * short" makes recovery look broken at exactly the moment it did what
         * was asked.
         */
        deferred_goals?: Array<{ goal_id: string; title: string; reason: string }>;
    };
}

interface PlanBlock {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    block_type: string;
    goal_id?: string;
    pillar?: string;
    checklist?: Array<{ text: string }>;
    energy_demand?: string; // stored on goal blocks so later adjacency checks don't need to re-look-up the goal
}

// ── Utilities ────────────────────────────────────────────────────

function calculateWindDown(ctx: CalendarContext): string {
    const sleepMins = timeToMinutes(ctx.user.sleep_start);
    const windDownStart = sleepMins - (ctx.user.wind_down_mins || 30);
    const h = Math.floor((windDownStart + 1440) % 1440 / 60);
    const m = (windDownStart + 1440) % 1440 % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function minutesToTime(mins: number): string {
    // §3: the `% 24` silently WRAPPED anything past midnight — a block starting
    // at 23:30 for 60min produced end_time "00:30", which is before its own
    // start. week-writer then rewrote that to 23:59:59, turning a visible bug
    // into a plausible-looking wrong answer. Clamp to the end of the day
    // instead, so an out-of-range value stays ordered and the validation pass
    // can still catch a zero-length block.
    if (!Number.isFinite(mins)) {
        throw new Error(`minutesToTime received a non-finite value: ${mins}`);
    }
    const clamped = Math.max(0, Math.min(Math.round(mins), 1439));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function safeAddMins(hhmm: string, mins: number) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + mins) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

// ── Protocol Config (from SchedulingProtocol) ───────────────────

export interface ProtocolConfig {
    bufferMinutes?: number;
    maxGoalBlocksPerDay?: number;
    maxDeepWorkMins?: number;
}

// ── Buffer Routing Helper ────────────────────────────────────────

/**
 * Returns the appropriate buffer size (minutes) for a given strategy and variant.
 * Ensures strategy choice is respected consistently throughout plan generation.
 *
 * MOMENTUM: 0 min (back-to-back blocks for maximum output)
 * BALANCED: 15 min (default cognitive switching buffer)
 * RECOVERY: 60-120 min (depends on variant: Spaced Mindfulness/Gentle Afternoon=120, Weekend Shift=60)
 */
export function getBufferMinutes(
    strategyId: string,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday',
    userDefaultBuffer?: number
): number {
    if (strategyId === 'momentum') {
        return 0; // Zero buffers: back-to-back blocks
    } else if (strategyId === 'balanced') {
        return userDefaultBuffer || 15; // Default cognitive switching buffer
    } else if (strategyId === 'recovery') {
        // Recovery variants must differ from EACH OTHER, not just from the
        // other modes.
        //
        // Both no-weekend recovery variants used to return 120, so recovery was
        // the one mode whose two options shared a single extreme parameter. If
        // that stack produced a defect, both variants were rejected,
        // `variants.length === 0`, and the whole mode returned a 500 — one bug
        // took the feature down instead of costing one option.
        //
        // - Spaced Mindfulness: 120 min — the mode's full intent
        // - Weekend Shift:       60 min
        // - Gentle Afternoon:    45 min — deliberately the gentler fallback, so
        //                        a 120-minute-buffer defect cannot claim both
        return timeFocus === 'weekend' ? 60 : timeFocus === 'afternoon' ? 45 : 120;
    }
    return userDefaultBuffer || 15; // Safe default
}

// ── Scheduling Constants ─────────────────────────────────────────

/**
 * The smallest goal block worth creating. Every active goal is guaranteed at
 * least this much when importance-weighted allocation has to ration a week —
 * importance decides who gets the SURPLUS, it must never starve a goal to zero.
 */
export const MIN_BLOCK_MINS = 15;

/**
 * How long a body block must finish before wind-down begins.
 *
 * Hard training pressed up against bedtime is a poor way to end a day. This is
 * deliberately much larger than the general pre-wind-down gap (20min, or 30 on
 * recovery) because the cost of getting it wrong is specific to physical work.
 */
export const BODY_WIND_DOWN_GAP_MINS = 60;

/**
 * The floor the body gap relaxes to on the final pass, when the alternative is
 * leaving the body goal unplaced entirely. Non-zero on purpose: a body block
 * must never end exactly when wind-down starts, however desperate the pass.
 */
export const BODY_WIND_DOWN_GAP_RELAXED_MINS = 15;

/**
 * The library default for the ultradian single-session cap, mirroring
 * DEFAULT_ADJUSTMENTS.maxSessionBlockMins in practical-constraints.
 *
 * Only a value BELOW this represents a real, user-derived preference (a
 * declared failure mode lowered it). At or above it, the goal's own
 * minutes_per_day governs the session length instead — see §1.
 */
const DEFAULT_SESSION_CAP_MINS = 90;

/** How many flexible blocks the swap pass may relocate in total. */
export const MAX_SWAP_RELOCATIONS = 8;

/**
 * §1: how far a bio block (meal, routine, wind-down) may drift from its
 * configured time before the placement is worth recording. Beyond this it is
 * still placed — the closest usable slot is better than skipping a meal — but
 * it is logged rather than silent.
 */
export const BIO_MAX_DRIFT_MINS = 90;

/**
 * Thrown when a generated variant contains an overlapping or malformed block.
 * The variant is dropped rather than emitted — a calendar with two blocks in
 * the same slot is worse than one option fewer.
 */
export class VariantValidationError extends Error {
    constructor(public variantLabel: string, public defects: string[]) {
        super(`Variant "${variantLabel}" produced ${defects.length} invalid block(s): ${defects.join('; ')}`);
        this.name = 'VariantValidationError';
    }
}

interface TimedBlock {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    block_type: string;
    goal_id?: string;
    pillar?: string;
    [k: string]: any;
}

const blockMins = (b: TimedBlock) => timeToMinutes(b.end_time) - timeToMinutes(b.start_time);

/**
 * §3: every emitted block must be well-formed and disjoint from its neighbours.
 *
 * Nothing validated this before — `resolveBioBlockOverlap` only guards bio
 * blocks against hard zones, so overlapping GOAL blocks were not caused by a
 * subtle bug so much as permitted by the absence of any check. Returns a list
 * of problems; an empty list means the variant is safe to emit.
 */
export function findBlockDefects(blocks: TimedBlock[]): string[] {
    const problems: string[] = [];
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

    for (const b of blocks) {
        const where = `${b.date} "${b.title}"`;
        if (!b.start_time || !timeRe.test(b.start_time)) {
            problems.push(`${where}: invalid start_time ${JSON.stringify(b.start_time)}`);
            continue;
        }
        if (!b.end_time || !timeRe.test(b.end_time)) {
            problems.push(`${where}: invalid end_time ${JSON.stringify(b.end_time)}`);
            continue;
        }
        if (timeToMinutes(b.end_time) <= timeToMinutes(b.start_time)) {
            problems.push(`${where}: end_time ${b.end_time} is not after start_time ${b.start_time}`);
        }
    }

    const byDate = new Map<string, TimedBlock[]>();
    for (const b of blocks) {
        if (!byDate.has(b.date)) byDate.set(b.date, []);
        byDate.get(b.date)!.push(b);
    }
    for (const [date, dayBlocks] of byDate) {
        const sorted = [...dayBlocks].sort(
            (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        );
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            if (timeToMinutes(cur.start_time) < timeToMinutes(prev.end_time)) {
                problems.push(
                    `${date}: OVERLAP "${prev.title}" ${prev.start_time}–${prev.end_time} ` +
                    `overlaps "${cur.title}" ${cur.start_time}–${cur.end_time}`
                );
            }
        }
    }
    return problems;
}

/**
 * §4: the real free gaps on a day, after bio blocks, anchors and everything
 * already placed. `ignoreGoalBlocks` gives the view the swap pass needs — what
 * the day would look like if the flexible work were moved out of the way.
 */
export function freeIntervalsOn(
    blocks: TimedBlock[],
    dateStr: string,
    lowerBound: number,
    upperBound: number,
    opts: { ignoreGoalBlocks?: boolean; ignoreBlocks?: TimedBlock[]; extraOccupied?: Array<{ start: number; end: number }> } = {}
): Array<{ start: number; end: number }> {
    const ignore = new Set(opts.ignoreBlocks || []);
    const occupied = [
        ...blocks
            .filter(b => b.date === dateStr)
            .filter(b => !(opts.ignoreGoalBlocks && b.block_type === 'goal'))
            .filter(b => !ignore.has(b))
            .map(b => ({ start: timeToMinutes(b.start_time), end: timeToMinutes(b.end_time) })),
        ...(opts.extraOccupied || [])
    ].sort((a, b) => a.start - b.start);

    const free: Array<{ start: number; end: number }> = [];
    let cursor = lowerBound;
    for (const o of occupied) {
        if (o.start > cursor) free.push({ start: cursor, end: Math.min(o.start, upperBound) });
        cursor = Math.max(cursor, o.end);
        if (cursor >= upperBound) break;
    }
    if (cursor < upperBound) free.push({ start: cursor, end: upperBound });
    return free.filter(f => f.end > f.start);
}

/**
 * §2: the directed swap pass.
 *
 * Placement is greedy, goal-major and first-fit — each goal is filled against
 * whatever remains and nothing ever revisits an earlier decision. So a craft
 * block that could have sat anywhere takes the one morning window, and a body
 * goal that cannot sit near meals, cannot split, gets one block a day and must
 * stay clear of wind-down finds nothing left.
 *
 * §2c, made explicit: **a block that can sit anywhere yields to a block that
 * can sit almost nowhere.** When a constrained goal cannot be placed at full
 * length, find the windows that WOULD hold it, check whether the flexible
 * blocks sitting in them have somewhere else to go, and if so move them.
 *
 * Bounded deliberately: one pass, at most MAX_SWAP_RELOCATIONS moves, a body
 * block is never relocated to make room for anything, and nothing is split.
 */
export function runSwapPass(params: {
    blocks: TimedBlock[];
    label: string;
    /** Goals still short, most-constrained first. */
    needs: Array<{ goalId: string; title: string; pillar?: string; sessionMins: number; dates: string[] }>;
    dayBounds: Map<string, { lower: number; upper: number }>;
    /** Upper bound override for body goals (the wind-down exclusion). */
    bodyUpperBound: Map<string, number>;
    bufferMins: number;
}): { relocations: number; placed: number } {
    const { blocks, label, needs, dayBounds, bodyUpperBound, bufferMins } = params;
    let relocations = 0;
    let placed = 0;

    for (const need of needs) {
        if (relocations >= MAX_SWAP_RELOCATIONS) break;

        for (const dateStr of need.dates) {
            if (relocations >= MAX_SWAP_RELOCATIONS) break;
            const bounds = dayBounds.get(dateStr);
            if (!bounds) continue;
            const upper = need.pillar === 'body'
                ? (bodyUpperBound.get(dateStr) ?? bounds.upper)
                : bounds.upper;

            // 1. Windows that would hold it, ignoring current goal occupancy.
            const candidateWindows = freeIntervalsOn(blocks, dateStr, bounds.lower, upper, {
                ignoreGoalBlocks: true,
            }).filter(w => (w.end - w.start) >= need.sessionMins + bufferMins);
            if (candidateWindows.length === 0) continue;

            for (const win of candidateWindows) {
                if (relocations >= MAX_SWAP_RELOCATIONS) break;

                // 2. EVERY goal block occupying the window — not just the
                //    flexible ones.
                //
                //    Filtering to `pillar !== 'body'` here was a real bug: the
                //    window was computed with `ignoreGoalBlocks: true`, so it
                //    ignored ALL goal blocks, while only non-body ones were
                //    relocated. A body block in the window was therefore
                //    invisible — not moved, but treated as absent — and the
                //    needy goal was placed straight on top of it. That is the
                //    `PlannrAI 10:45–12:45` / `Studying 10:45–11:30` overlap.
                //
                //    A body block is never relocated to make room for anything,
                //    so a window containing one is simply not a candidate.
                const occupants = blocks.filter(b =>
                    b.date === dateStr &&
                    b.block_type === 'goal' &&
                    timeToMinutes(b.start_time) < win.end &&
                    timeToMinutes(b.end_time) > win.start
                );
                if (occupants.length === 0) continue;
                if (occupants.some(b => b.pillar === 'body')) continue;
                if (relocations + occupants.length > MAX_SWAP_RELOCATIONS) continue;

                // 3. Does every occupant have somewhere else to go, whole?
                const moves: Array<{ block: TimedBlock; date: string; start: number }> = [];
                let allMovable = true;
                const claimed: Array<{ date: string; start: number; end: number }> = [];
                for (const occ of occupants) {
                    const mins = blockMins(occ);
                    let found: { date: string; start: number } | null = null;
                    for (const [altDate, altBounds] of dayBounds) {
                        const altUpper = altBounds.upper;
                        const ignoreBlocks = [occ, ...occupants];
                        const extraOccupied = claimed.filter(c => c.date === altDate).map(c => ({ start: c.start, end: c.end }));
                        const windows = freeIntervalsOn(blocks, altDate, altBounds.lower, altUpper, { ignoreBlocks, extraOccupied })
                            .filter(w => !(altDate === dateStr && w.start < win.end && w.end > win.start));
                        for (const w of windows) {
                            if (w.end - w.start >= mins + bufferMins) {
                                found = { date: altDate, start: w.start };
                                break;
                            }
                        }
                        if (found) break;
                    }
                    if (!found) { allMovable = false; break; }
                    claimed.push({ date: found.date, start: found.start, end: found.start + mins + bufferMins });
                    moves.push({ block: occ, date: found.date, start: found.start });
                }
                if (!allMovable) continue;

                // 4. Move them, then place the constrained goal.
                const wouldCollide = (
                    date: string, start: number, end: number, exclude: TimedBlock[]
                ) => blocks.some(b =>
                    !exclude.includes(b) &&
                    b.date === date &&
                    timeToMinutes(b.start_time) < end &&
                    timeToMinutes(b.end_time) > start
                );

                const movingBlocks = moves.map(m => m.block);
                let aborted = false;
                const newPlacements: Array<{ date: string; start: number; end: number }> = [];
                for (const m of moves) {
                    const mins = blockMins(m.block);
                    const mEnd = m.start + mins;
                    if (wouldCollide(m.date, m.start, mEnd, movingBlocks)) {
                        console.warn(
                            `[PlanWeek] "${label}" SWAP ABORTED: moving "${m.block.title}" to ` +
                            `${m.date} ${minutesToTime(m.start)} would collide with an existing block.`
                        );
                        aborted = true;
                        break;
                    }
                    if (newPlacements.some(p => p.date === m.date && p.start < mEnd && p.end > m.start)) {
                        console.warn(
                            `[PlanWeek] "${label}" SWAP ABORTED: moving "${m.block.title}" to ` +
                            `${m.date} ${minutesToTime(m.start)} would collide with another moved block.`
                        );
                        aborted = true;
                        break;
                    }
                    newPlacements.push({ date: m.date, start: m.start, end: mEnd });
                }
                if (aborted) continue;

                for (const m of moves) {
                    const mins = blockMins(m.block);
                    console.log(
                        `[PlanWeek] "${label}" SWAP: moving "${m.block.title}" ` +
                        `${m.block.date} ${m.block.start_time}–${m.block.end_time} → ` +
                        `${m.date} ${minutesToTime(m.start)}–${minutesToTime(m.start + mins)} ` +
                        `to make room for "${need.title}" (${need.pillar || 'goal'}) on ${dateStr}`
                    );
                    m.block.date = m.date;
                    m.block.start_time = minutesToTime(m.start);
                    m.block.end_time = minutesToTime(m.start + mins);
                    relocations++;
                }

                // The occupants have now actually moved, so this is the real
                // occupancy — not the `ignoreGoalBlocks` view the window came
                // from. If anything still sits in the slot, do not place.
                if (wouldCollide(dateStr, win.start, win.start + need.sessionMins, [])) {
                    const clash = blocks.find(b =>
                        b.date === dateStr &&
                        timeToMinutes(b.start_time) < win.start + need.sessionMins &&
                        timeToMinutes(b.end_time) > win.start
                    );
                    console.warn(
                        `[PlanWeek] "${label}" SWAP DECLINED: "${need.title}" cannot take ${dateStr} ` +
                        `${minutesToTime(win.start)} — "${clash?.title}" ${clash?.start_time}–${clash?.end_time} is still there.`
                    );
                    continue;
                }

                blocks.push({
                    date: dateStr,
                    start_time: minutesToTime(win.start),
                    end_time: minutesToTime(win.start + need.sessionMins),
                    title: need.title,
                    block_type: 'goal',
                    goal_id: need.goalId,
                    pillar: need.pillar,
                } as TimedBlock);
                placed += need.sessionMins;
                console.log(
                    `[PlanWeek] "${label}" SWAP: placed "${need.title}" ${dateStr} ` +
                    `${minutesToTime(win.start)}–${minutesToTime(win.start + need.sessionMins)} ` +
                    `after ${moves.length} relocation(s)`
                );
                break; // one placement per goal-day
            }
        }
    }

    return { relocations, placed };
}

// ── Recovery triage ───────────────────────────────────────────────

/**
 * Importance bands, by THRESHOLD not equality.
 *
 * `normalizeImportance` maps 'low'|'medium'|'high' to 2|5|9, but it also lets a
 * raw numeric value through untouched, so a goal can legitimately arrive with
 * any number. Comparing `=== 5` would silently misband it.
 */
export const IMPORTANCE_HIGH_MIN = 7;
export const IMPORTANCE_MEDIUM_MIN = 4;

export type ImportanceBand = 'high' | 'medium' | 'low';

export function importanceBand(importance: number | undefined): ImportanceBand {
    const v = importance ?? 5;
    if (v >= IMPORTANCE_HIGH_MIN) return 'high';
    if (v >= IMPORTANCE_MEDIUM_MIN) return 'medium';
    return 'low';
}

export interface TriagedGoal {
    id: string;
    title: string;
    importance: number;
    band: ImportanceBand;
    /** What recovery will actually plan. */
    minutes_per_day: number;
    days_per_week: number;
    /** What the goal asked for, kept for the log and for reporting. */
    originalMinutesPerDay: number;
    originalDaysPerWeek: number;
    [k: string]: any;
}

export interface RecoveryTriage {
    goals: TriagedGoal[];
    deferred: Array<{ id: string; title: string; importance: number }>;
    summary: { full: number; halved: number; deferred: number };
}

/**
 * Recovery decides WHAT to schedule, not how much to trim.
 *
 * The old mechanism expressed "take it easier" as a 90-minute-per-day ceiling,
 * which cannot represent a 120-minute Gym at all — it produced a shortened Gym
 * before Prompt 48 and no Gym after it. Choosing which goals get scheduled, and
 * then planning each of them properly, sidesteps that: nothing is compromised,
 * some things simply wait.
 *
 *  - high   → untouched, scheduled in full
 *  - medium → halved BY DAYS, so every block keeps its full requested length
 *  - low    → deferred entirely, and reported as deferred rather than short
 *
 * Halving by days rather than minutes is deliberate. Prompts 47–49 established
 * that a block is `minutes_per_day` long as one continuous session and that
 * `(Shortened)` is a failure state; halving minutes would make shortened blocks
 * the STANDARD recovery output and undo all of it. It matters most for body
 * goals, where a 120-minute session cut to 60 is a different activity, while
 * doing it twice instead of four times is the same activity, rested.
 */
export function applyRecoveryTriage(goals: any[]): RecoveryTriage {
    const triaged: TriagedGoal[] = [];
    const deferred: RecoveryTriage['deferred'] = [];
    let full = 0;
    let halved = 0;

    for (const g of goals) {
        const importance = g.importance ?? 5;
        const band = importanceBand(importance);
        const minutes = g.minutes_per_day || 60;
        const days = Math.max(1, Math.min(7, g.days_per_week || 5));

        if (band === 'low') {
            deferred.push({ id: g.id, title: g.title, importance });
            continue;
        }

        if (band === 'high') {
            full++;
            triaged.push({
                ...g, band, importance,
                minutes_per_day: minutes, days_per_week: days,
                originalMinutesPerDay: minutes, originalDaysPerWeek: days,
            });
            continue;
        }

        // Medium: halve by days. `Math.ceil` guarantees at least one day, so
        // "no medium goal is ever dropped" falls out of the arithmetic —
        // missing one goal entirely is worse than halving all of them.
        halved++;
        let recoveryDays = Math.ceil(days / 2);
        let recoveryMinutes = minutes;

        if (days === 1) {
            // ceil(1/2) = 1, so halving days does nothing here. This is the one
            // case where minutes give instead — floored at MIN_BLOCK_MINS and
            // snapped to the 15-minute grid.
            recoveryDays = 1;
            recoveryMinutes = Math.max(MIN_BLOCK_MINS, Math.round(minutes / 2 / 15) * 15);
        }

        triaged.push({
            ...g, band, importance,
            minutes_per_day: recoveryMinutes, days_per_week: recoveryDays,
            originalMinutesPerDay: minutes, originalDaysPerWeek: days,
        });
    }

    return { goals: triaged, deferred, summary: { full, halved, deferred: deferred.length } };
}

/** The one-line record of what recovery decided, for the placement log. */
export function describeRecoveryTriage(t: RecoveryTriage): string {
    const fullList = t.goals.filter(g => g.band === 'high')
        .map(g => `${g.title.trim()}(${g.importance})`).join(' ') || '—';
    const halfList = t.goals.filter(g => g.band === 'medium')
        .map(g => g.originalDaysPerWeek === 1
            ? `${g.title.trim()}(${g.importance}) ${g.originalMinutesPerDay}m→${g.minutes_per_day}m`
            : `${g.title.trim()}(${g.importance}) ${g.originalDaysPerWeek}d→${g.days_per_week}d`)
        .join(', ') || '—';
    const deferredList = t.deferred.map(g => `${g.title.trim()}(${g.importance})`).join(' ') || '—';
    return `FULL ${fullList} | HALF ${halfList} | DEFERRED ${deferredList}`;
}

/**
 * §2 (Prompt 52): a weekend day should carry about half a weekday's blocks.
 * A weighting, not a hard cap — a week that genuinely needs the weekend can
 * still use it, it just goes there last.
 */
export const RECOVERY_WEEKEND_WEIGHT = 0.5;
/** Stronger penalty on a variant whose whole identity is a quiet weekend. */
export const RECOVERY_LIGHT_WEEKEND_WEIGHT = 0.25;
/**
 * Worth one whole block of load to avoid running a goal on back-to-back days.
 * Deliberately soft: it spaces sessions when there is a choice and gets out of
 * the way when there is not. A hard rule would push goals short on tight weeks,
 * which is a worse failure than two Gym sessions landing Tue/Wed.
 */
export const RECOVERY_ADJACENCY_PENALTY = 1.0;

/**
 * Rank days for the NEXT block of a recovery goal.
 *
 * Evaluated live, per block. `preferredDays` used to be sorted once before a
 * goal started placing, while `workloadPerDay` only updated after each block
 * landed — so a goal's own placements never influenced where its next block
 * went. At the start of a variant every day sits at zero, the tie-break was the
 * day number, and the first goal walked straight down Mon/Tue/Wed. On a
 * recovery week, with a third of the usual blocks, nothing later evens that out.
 *
 * Block COUNT is the primary quantity, not minutes: a day holding one
 * 120-minute Gym is not busier than a day holding three 45-minute blocks, and
 * ranking on minutes made the balancer keep feeding the second day.
 *
 * Lower score wins.
 */
export function rankRecoveryDay(
    isoDay: number,
    opts: {
        goalBlockCountPerDay: Map<number, number>;
        workloadPerDay: Map<number, number>;
        /** ISO days this goal already occupies in this variant. */
        daysUsedByThisGoal: Set<number>;
        forceLightWeekend?: boolean;
    }
): { score: number; blocks: number; gap: number; mins: number } {
    const blocks = opts.goalBlockCountPerDay.get(isoDay) || 0;
    const mins = opts.workloadPerDay.get(isoDay) || 0;
    const isWeekend = isoDay >= 6;
    const dayWeight = isWeekend
        ? (opts.forceLightWeekend ? RECOVERY_LIGHT_WEEKEND_WEIGHT : RECOVERY_WEEKEND_WEIGHT)
        : 1.0;

    const loadScore = (blocks + 1) / dayWeight;
    const adjacent =
        opts.daysUsedByThisGoal.has(isoDay - 1) || opts.daysUsedByThisGoal.has(isoDay + 1);
    const score = loadScore + (adjacent ? RECOVERY_ADJACENCY_PENALTY : 0);

    // Distance to this goal's nearest existing day — bigger is better, so a
    // 3-of-5 goal lands Mon/Wed/Fri rather than Mon/Tue/Wed.
    let gap = Number.POSITIVE_INFINITY;
    for (const d of opts.daysUsedByThisGoal) gap = Math.min(gap, Math.abs(d - isoDay));

    return { score, blocks, gap, mins };
}

/** Index of the best day in `candidates`, by the ranking above. */
export function pickRecoveryDayIndex(
    candidates: number[],
    opts: Parameters<typeof rankRecoveryDay>[1]
): number {
    let bestIdx = 0;
    let best = rankRecoveryDay(candidates[0], opts);
    for (let i = 1; i < candidates.length; i++) {
        const r = rankRecoveryDay(candidates[i], opts);
        const better =
            r.score < best.score - 1e-9 ||
            (Math.abs(r.score - best.score) < 1e-9 && (
                // ties, in order: larger gap from this goal's nearest day …
                r.gap > best.gap ||
                // … then fewer total minutes on the day …
                (r.gap === best.gap && r.mins < best.mins) ||
                // … then the lower day number.
                (r.gap === best.gap && r.mins === best.mins && candidates[i] < candidates[bestIdx])
            ));
        if (better) { bestIdx = i; best = r; }
    }
    return bestIdx;
}

/**
 * §2a: make an over-full day fit by shortening as FEW blocks as possible.
 *
 * The instinct when a day is 60 minutes over is to shave a little off
 * everything, which feels even-handed and produces a week where nothing is the
 * length you asked for. Taking the whole 60 out of one low-priority block
 * leaves every other block intact and gives one clearly identified casualty
 * instead of a diffuse sense that the planner has been trimming.
 *
 * So: sort candidates by ascending importance (ties broken by the most slack),
 * and EXHAUST each one's slack before touching the next.
 *
 * Never goes below MIN_BLOCK_MINS, never touches a block already at the floor,
 * and only ever considers blocks on the over-full day itself.
 */
export function concentrateShortfall(
    dayBlocks: Array<{ id: string; goalId: string; title: string; mins: number; importance: number }>,
    overByMins: number
): Array<{ id: string; title: string; importance: number; from: number; to: number }> {
    if (overByMins <= 0) return [];

    const candidates = dayBlocks
        .filter(b => b.mins > MIN_BLOCK_MINS)
        .sort((a, b) => (a.importance - b.importance) || (b.mins - a.mins));

    const cuts: Array<{ id: string; title: string; importance: number; from: number; to: number }> = [];
    let remaining = overByMins;

    for (const b of candidates) {
        if (remaining <= 0) break;
        const slack = b.mins - MIN_BLOCK_MINS;
        if (slack <= 0) continue;
        const take = Math.min(remaining, slack);
        cuts.push({ id: b.id, title: b.title, importance: b.importance, from: b.mins, to: b.mins - take });
        remaining -= take;
    }

    return cuts;
}

/**
 * §1: two blocks of the same goal on the same day, separated by less than the
 * buffer, are one session that got split for no reason the user asked for.
 * Merge them back into a single block spanning both.
 *
 * This is a safety net. With the session cap now following minutes_per_day it
 * should rarely fire, so every merge is logged — a merge means the shape logic
 * split something it should not have.
 */
export function mergeAdjacentGoalBlocks(
    blocks: TimedBlock[],
    bufferMins: number,
    label: string
): { blocks: TimedBlock[]; merges: number } {
    const goalBlocks = blocks.filter(b => b.block_type === 'goal' && b.goal_id);
    const others = blocks.filter(b => !(b.block_type === 'goal' && b.goal_id));

    const groups = new Map<string, TimedBlock[]>();
    for (const b of goalBlocks) {
        const key = `${b.date}|${b.goal_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(b);
    }

    const merged: TimedBlock[] = [];
    let merges = 0;
    for (const [, group] of groups) {
        const sorted = group.sort(
            (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        );
        let current = { ...sorted[0] };
        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            const gap = timeToMinutes(next.start_time) - timeToMinutes(current.end_time);

            // The gap must be EMPTY. Checking only its size was a real bug:
            // with recovery's 120-minute buffer, two Studying blocks 90 minutes
            // apart merged into one 165-minute block that swallowed the
            // SiteSmith block sitting between them — a genuine overlap, which
            // findBlockDefects then correctly rejected, taking the whole
            // variant down with it. Merging is only ever valid across dead
            // space.
            const withinBuffer = gap >= 0 && gap < bufferMins;
            const gapStart = timeToMinutes(current.end_time);
            const gapEnd = timeToMinutes(next.start_time);
            const intruder = withinBuffer && gap > 0
                ? blocks.find(b =>
                    b !== current && b !== next &&
                    b.date === current.date &&
                    timeToMinutes(b.start_time) < gapEnd &&
                    timeToMinutes(b.end_time) > gapStart)
                : undefined;

            if (intruder) {
                console.warn(
                    `[PlanWeek] "${label}" MERGE DECLINED: "${current.title}" ${current.start_time}–${current.end_time} ` +
                    `and ${next.start_time}–${next.end_time} on ${current.date} are ${gap}min apart, but ` +
                    `"${intruder.title}" ${intruder.start_time}–${intruder.end_time} sits between them.`
                );
            }

            if (withinBuffer && !intruder) {
                console.warn(
                    `[PlanWeek] "${label}" MERGE: "${current.title}" ${current.start_time}–${current.end_time} + ` +
                    `${next.start_time}–${next.end_time} on ${current.date} (${gap}min apart, buffer ${bufferMins}min) ` +
                    `→ one ${current.start_time}–${next.end_time} block. The shape logic split a session it should not have.`
                );
                current.end_time = next.end_time;
                merges++;
            } else {
                merged.push(current);
                current = { ...next };
            }
        }
        merged.push(current);
    }

    return { blocks: [...others, ...merged], merges };
}

/**
 * §1: `(Part)` and `(Shortened)` are claims about a block's relationship to the
 * goal's daily target, so they can only be decided once every block for that
 * goal-day is final — after merging, not while placing. Re-derives both from
 * the finished layout.
 */
export function retitleGoalBlocks(
    blocks: TimedBlock[],
    targetMinsPerDayByGoal: Map<string, number>,
    /**
     * Goals that finish the week below their weekly target. Without this, the
     * final smaller session of a goal whose week is fully covered (a 315min
     * goal at 90min/day ends on a 45min block) was labelled "(Shortened)" —
     * it is the remainder, not a shortfall, and mislabelling it made the
     * importance-ordering invariant look violated when it was not.
     */
    goalsShortForWeek: Set<string> = new Set()
): TimedBlock[] {
    const totals = new Map<string, { mins: number; count: number }>();
    for (const b of blocks) {
        if (b.block_type !== 'goal' || !b.goal_id) continue;
        const key = `${b.date}|${b.goal_id}`;
        const cur = totals.get(key) || { mins: 0, count: 0 };
        cur.mins += blockMins(b);
        cur.count += 1;
        totals.set(key, cur);
    }

    return blocks.map(b => {
        if (b.block_type !== 'goal' || !b.goal_id) return b;
        const base = b.title.replace(/\s*\((Part|Shortened)\)\s*$/, '');
        const key = `${b.date}|${b.goal_id}`;
        const t = totals.get(key)!;
        const target = targetMinsPerDayByGoal.get(b.goal_id) ?? t.mins;

        // More than one block for this goal today → each really is a part.
        if (t.count > 1) return { ...b, title: `${base} (Part)` };
        // One block below the daily target, on a goal that also ends the week
        // short → genuinely shortened.
        if (t.mins < target && goalsShortForWeek.has(b.goal_id)) {
            return { ...b, title: `${base} (Shortened)` };
        }
        // One block covering what was left → not a part of anything.
        return { ...b, title: base };
    });
}

/**
 * The single source of truth for how much room a goal must leave before
 * wind-down.
 *
 * Both placement paths (the main pass loop and the last-resort top-up sweep)
 * used to compute this inline and disagree — the main loop applied a 20-minute
 * gap that `isRelaxedBuffer` collapsed to ZERO from pass 4 onward, and the
 * top-up sweep hardcoded 15. That collapse is exactly how a Gym block came to
 * end at 23:15 with wind-down starting at 23:15.
 *
 * Body is handled separately from the general gap and is never collapsed to
 * zero by buffer relaxation: it holds the full gap until the final pass, and
 * even then keeps a non-zero floor.
 */
export function resolvePreWindDownGapMins(opts: {
    pillar?: string | null;
    goalEnergy: 'low' | 'medium' | 'high';
    strategyId: string;
    isRelaxedBuffer: boolean;
    /** The last pass, where the only remaining alternative is not placing at all. */
    isFinalPass: boolean;
    preWindDownGapBonus?: number;
}): { gapMins: number; bodyGapRelaxed: boolean } {
    const generalGap = (opts.goalEnergy === 'low' || opts.isRelaxedBuffer)
        ? 0
        : (opts.strategyId === 'recovery' ? 30 : 20) + (opts.preWindDownGapBonus || 0);

    if (opts.pillar !== 'body') return { gapMins: generalGap, bodyGapRelaxed: false };

    // Body: the last constraint to give. Energy, session pacing and day caps
    // have all already relaxed by the time the final pass runs.
    if (!opts.isFinalPass) {
        return { gapMins: Math.max(BODY_WIND_DOWN_GAP_MINS, generalGap), bodyGapRelaxed: false };
    }
    return {
        gapMins: Math.max(BODY_WIND_DOWN_GAP_RELAXED_MINS, generalGap),
        bodyGapRelaxed: true,
    };
}

/**
 * Importance-weighted weekly minute allocation.
 *
 * When the week genuinely cannot hold every goal, the shortfall must land on
 * the least important goals rather than on whichever one happened to be placed
 * last. Every goal first reserves `MIN_BLOCK_MINS` so nothing is starved to
 * zero; the surplus is then handed out in descending importance, each goal
 * taking its full remaining need before any less important goal gets anything
 * beyond its floor.
 *
 * On a week with headroom this is a deliberate no-op — every goal is allocated
 * its full need and placement behaves exactly as it did before.
 */
export function allocateDayShares(
    goals: Array<{ id: string; importance: number; needMins: number }>,
    weeklyCapacityMins: number
): Map<string, number> {
    const allocation = new Map<string, number>();
    const totalNeed = goals.reduce((sum, g) => sum + Math.max(0, g.needMins), 0);

    if (totalNeed <= weeklyCapacityMins) {
        for (const g of goals) allocation.set(g.id, Math.max(0, g.needMins));
        return allocation;
    }

    // Floors first — the anti-starvation guarantee.
    let budget = weeklyCapacityMins;
    for (const g of goals) {
        const floor = Math.min(Math.max(0, g.needMins), MIN_BLOCK_MINS);
        allocation.set(g.id, floor);
        budget -= floor;
    }

    // Surplus in descending importance; ties go to the larger need so a big
    // goal isn't repeatedly beaten to the remainder by a small one.
    const byImportance = [...goals].sort(
        (a, b) => (b.importance - a.importance) || (b.needMins - a.needMins)
    );
    for (const g of byImportance) {
        if (budget <= 0) break;
        const outstanding = Math.max(0, g.needMins) - (allocation.get(g.id) || 0);
        if (outstanding <= 0) continue;
        const grant = Math.min(outstanding, budget);
        allocation.set(g.id, (allocation.get(g.id) || 0) + grant);
        budget -= grant;
    }

    return allocation;
}

// ── Day-Capacity Helpers ──────────────────────────────────────────

const RECOVERY_LIGHT_LOAD_THRESHOLD = 0.75;

/**
 * Relaxes mode-level daily caps (maxGoalBlocksPerDay / maxDeepWorkMins) when
 * the user's total weekly goal load is already comfortably under what the
 * caps would allow across the week. The caps exist to force lighter days
 * when there's real cramming pressure — they shouldn't block a genuinely
 * light week from being fully scheduled.
 */
function computeEffectiveDailyCaps(
    totalWeeklyMinsNeeded: number,
    protocolConfig: ProtocolConfig | undefined,
    eligibleDayCount: number,
    /**
     * §3: the goals that SURVIVED the recovery triage. A mode cap may never
     * make a surviving goal's own requested session length impossible.
     * Undefined for balanced and momentum, which keeps their behaviour byte
     * for byte identical.
     */
    triagedGoals?: Array<{ minutes_per_day: number; days_per_week: number }>
): { maxGoalBlocksPerDay?: number; maxDeepWorkMins?: number } {
    if (!protocolConfig?.maxDeepWorkMins) {
        return { maxGoalBlocksPerDay: protocolConfig?.maxGoalBlocksPerDay, maxDeepWorkMins: protocolConfig?.maxDeepWorkMins };
    }
    const weeklyCapacityUnderCaps = protocolConfig.maxDeepWorkMins * Math.max(1, eligibleDayCount);
    const isLightLoad = totalWeeklyMinsNeeded <= weeklyCapacityUnderCaps * RECOVERY_LIGHT_LOAD_THRESHOLD;
    if (isLightLoad) {
        return { maxGoalBlocksPerDay: undefined, maxDeepWorkMins: undefined };
    }

    // §3: with the triage in place, recovery's lightness comes from scheduling
    // FEWER GOALS — a far better mechanism than a per-day minute ceiling that
    // cannot express "one long Gym session". The 90-minute cap made a
    // 120-minute goal unplaceable on every day, and since full length became a
    // hard requirement of window selection (Prompt 48 §2a), unplaceable means
    // NOT PLACED rather than trimmed. So the cap is raised to whatever the
    // surviving goals actually need; it keeps its shaping role, but can no
    // longer starve one to zero.
    if (triagedGoals && triagedGoals.length > 0) {
        const days = Math.max(1, eligibleDayCount);
        const largestSession = Math.max(...triagedGoals.map(g => g.minutes_per_day || 0));
        const triagedWeeklyMins = triagedGoals.reduce(
            (s, g) => s + (g.minutes_per_day || 0) * (g.days_per_week || 0), 0
        );
        const triagedBlockCount = triagedGoals.reduce((s, g) => s + (g.days_per_week || 0), 0);

        const maxDeepWorkMins = Math.max(
            protocolConfig.maxDeepWorkMins,
            largestSession,
            Math.ceil(triagedWeeklyMins / days)
        );
        const maxGoalBlocksPerDay = Math.max(
            protocolConfig.maxGoalBlocksPerDay ?? 0,
            Math.ceil(triagedBlockCount / days)
        );

        console.log(
            `[PlanWeek] recovery caps: maxDeepWorkMins ${protocolConfig.maxDeepWorkMins}→${maxDeepWorkMins} ` +
            `(largest session ${largestSession}m, ${triagedWeeklyMins}m over ${days} days), ` +
            `maxGoalBlocksPerDay ${protocolConfig.maxGoalBlocksPerDay}→${maxGoalBlocksPerDay} ` +
            `(${triagedBlockCount} blocks over ${days} days)`
        );

        return { maxGoalBlocksPerDay, maxDeepWorkMins };
    }

    return { maxGoalBlocksPerDay: protocolConfig.maxGoalBlocksPerDay, maxDeepWorkMins: protocolConfig.maxDeepWorkMins };
}

interface DayCapacity {
    hasBlockRoom: boolean;
    minutesHeadroom: number; // Infinity if no cap is set
}

/**
 * Checks remaining room for a given day against the (possibly relaxed)
 * daily caps. Block-count and minutes are tracked GLOBALLY per day across
 * ALL goals within one generateVariant() run — the caps are a total-per-day
 * ceiling, not per-goal or per-pillar.
 */
function getDayCapacity(
    isoDay: number,
    goalBlockCountPerDay: Map<number, number>,
    workloadPerDay: Map<number, number>,
    effectiveCaps: { maxGoalBlocksPerDay?: number; maxDeepWorkMins?: number }
): DayCapacity {
    const maxBlocks = effectiveCaps.maxGoalBlocksPerDay ?? Infinity;
    const maxMins = effectiveCaps.maxDeepWorkMins ?? Infinity;
    const blockCount = goalBlockCountPerDay.get(isoDay) || 0;
    const minutesUsed = workloadPerDay.get(isoDay) || 0;
    return {
        hasBlockRoom: blockCount < maxBlocks,
        minutesHeadroom: Math.max(0, maxMins - minutesUsed),
    };
}

/**
 * Records a placed block against BOTH global per-day trackers in one call —
 * keeps block-count tracking from ever drifting out of sync with minutes.
 */
function recordGoalBlockPlacement(
    isoDay: number,
    minsPlaced: number,
    goalBlockCountPerDay: Map<number, number>,
    workloadPerDay: Map<number, number>
): void {
    goalBlockCountPerDay.set(isoDay, (goalBlockCountPerDay.get(isoDay) || 0) + 1);
    workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + minsPlaced);
}

// ── Window Ordering & Anchoring Helpers ───────────────────────────

/**
 * Orders candidate windows within a day by mode/timeFocus preference. Shared
 * by both Pass 1 and the Cram Pass so they can't drift apart — previously
 * only Pass 1 had this and Cram Pass fell back to raw chronological order.
 */
function sortWindowsByPreference(
    windows: Array<{ start: number; end: number }>,
    opts: {
        timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday';
        pillar?: string;
        strategyId: string;
        goalImportance?: number;
        // "Energy-Synced" variant only: energy-phase affinity becomes the
        // PRIMARY sort key (windows in the goal's best-matched phase come
        // first) instead of the usual time-of-day/pillar tiebreakers, which
        // only apply among windows of equal affinity.
        energyPrimary?: { goalEnergy: 'low' | 'medium' | 'high'; phases: DayPhase[] };
    }
): Array<{ start: number; end: number }> {
    const { timeFocus, pillar, strategyId, goalImportance, energyPrimary } = opts;
    return [...windows].sort((a, b) => {
        if (energyPrimary) {
            const aScore = scoreWindowAffinity(a.start, energyPrimary.goalEnergy, energyPrimary.phases);
            const bScore = scoreWindowAffinity(b.start, energyPrimary.goalEnergy, energyPrimary.phases);
            if (aScore !== bScore) return bScore - aScore; // best-matched phase first
        }
        if (timeFocus === 'morning') return a.start - b.start;
        if (timeFocus === 'afternoon') return Math.abs(a.start - 780) - Math.abs(b.start - 780);
        if (timeFocus === 'evening') return b.start - a.start;
        // Weekday Sprint's real identity isn't a time-of-day preference at
        // all (unlike morning/afternoon/evening) — it's day-of-week
        // concentration, already handled by the Mon-Thu day-bucket sort
        // above. But leaving window-level ordering unhandled here meant it
        // silently fell through to the same pillar-based default Peak Hour
        // Blitz uses, which under abundant capacity converges to a
        // byte-identical schedule (day order alone doesn't change the final
        // block set once every day has room). Bias toward later-in-day
        // slots — "grinding through Mon-Thu" rather than Blitz's strict
        // early-morning clustering — so the two variants stay genuinely
        // distinct even when nothing is capacity-constrained.
        if (timeFocus === 'weekday') return b.start - a.start;

        if (pillar === 'mind') return a.start - b.start;
        if (pillar === 'body') {
            if (strategyId === 'momentum') {
                if ((goalImportance || 5) >= 8) return a.start - b.start; // Frog-eating: early morning
                return a.start - b.start;
            }
            if (strategyId === 'recovery') {
                const aIsAfternoon = a.start >= 720;
                const bIsAfternoon = b.start >= 720;
                if (aIsAfternoon && !bIsAfternoon) return -1;
                if (!aIsAfternoon && bIsAfternoon) return 1;
                return a.start - b.start;
            }
            return a.start - b.start; // balanced: flexible/ascending
        }
        return a.start - b.start;
    });
}

/**
 * Decides WHERE within a chosen window a block starts. An explicit
 * timeFocus anchors the block toward that edge of the window (the window
 * itself was already preference-ordered by sortWindowsByPreference);
 * mathematical centering is reserved for the mode's undefined-timeFocus
 * ("Standard"/default) variant. Momentum always packs at the early edge.
 */
function computeWindowAnchorStart(
    winStart: number,
    winEnd: number,
    blockMins: number,
    buffer: number,
    strategyId: string,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday'
): number {
    if (strategyId !== 'balanced' && strategyId !== 'recovery') {
        return winStart; // momentum: pack at the window's early edge
    }
    if (timeFocus === 'evening') {
        return Math.max(winStart, winEnd - blockMins); // hug the late edge
    }
    if (timeFocus === 'morning' || timeFocus === 'afternoon') {
        // Window was already chosen for morning/afternoon proximity; hug its
        // early edge rather than centering further within it.
        return winStart;
    }
    // timeFocus undefined (mode's default/"Standard" variant): original
    // mathematical-centering behavior, preserved as-is.
    const available = winEnd - winStart;
    if (available > blockMins + buffer * 2) {
        const freeSpace = available - blockMins;
        return winStart + Math.floor(freeSpace / 2);
    }
    if (strategyId === 'recovery') {
        const possibleStart = winStart + Math.min(buffer, available - blockMins);
        return Math.max(winStart, possibleStart);
    }
    return winStart;
}

// Snap a computed start time to the nearest 15-minute mark. Nothing in this
// file previously snapped a start (only a duration, at the splinter-prevention
// site above), so centering math like `winStart + Math.floor(freeSpace / 2)`
// — and non-15 buffer/gap constants feeding a chained `winStart += consumed`
// — could drift a block onto an arbitrary minute (e.g. 17:11). Clamped back
// inside [winStart, winEnd - blockMins] so rounding can never push a block
// past its window's real edge into whatever it was placed to avoid.
function snapStartToGrid(start: number, winStart: number, winEnd: number, blockMins: number): number {
    const snapped = Math.round(start / 15) * 15;
    return Math.max(winStart, Math.min(snapped, winEnd - blockMins));
}

function slugify(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

/**
 * How many minutes of this goal are actually left to schedule this week.
 * Single source of truth shared by the main per-goal placement loop and the
 * body-pillar day-lane apportionment (which runs before that loop) — they
 * must never compute this independently or the lane math can drift out of
 * sync with what the main loop actually tries to place.
 */
function computeRemainingWeeklyMins(
    goal: any,
    ctx: CalendarContext,
    replanFromDate?: string
): number {
    const progress = ctx.goalProgress?.find(p => p.goal_id === goal.id);
    let remainingMins = progress ? progress.remaining_minutes : (goal.days_per_week || 5) * (goal.minutes_per_day || 60);

    // §2's trap: `goalProgress.remaining_minutes` is derived from the goal's
    // REAL weekly target and knows nothing about the recovery triage. Without
    // this clamp a halved goal would quietly demand its full time back and the
    // triage would look implemented while doing nothing at all.
    //
    // `originalDaysPerWeek` is only present on a triaged goal, so this is inert
    // for balanced and momentum.
    if (goal.originalDaysPerWeek !== undefined) {
        remainingMins = Math.min(
            remainingMins,
            (goal.days_per_week || 5) * (goal.minutes_per_day || 60)
        );
    }

    if (!replanFromDate) return remainingMins;
    const targetMins = (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
    const minsBeforeReplan = ctx.schedule.target_week
        .filter(b => b.goal_id === goal.id && b.date < replanFromDate && b.status !== 'cancelled' && b.status !== 'missed')
        .reduce((sum, b) => {
            const duration = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
            return sum + Math.max(0, duration);
        }, 0);
    return Math.min(remainingMins, Math.max(0, targetMins - minsBeforeReplan));
}

/**
 * Largest Remainder Method: apportions `totalSlots` integer slots across
 * `needs` proportionally to each entry's `need`, capped so no entry ever
 * receives more than its own `need`. Used to split a week's body-pillar
 * "1 block/day" slots fairly between competing body goals when their
 * combined need exceeds what the week can hold.
 */
function largestRemainderApportion(
    needs: Array<{ id: string; need: number }>,
    totalSlots: number
): Map<string, number> {
    const totalNeed = needs.reduce((s, n) => s + n.need, 0);
    const quotas = new Map<string, number>();
    if (totalNeed === 0) {
        needs.forEach(n => quotas.set(n.id, 0));
        return quotas;
    }
    const entries = needs.map(n => {
        const exact = totalSlots * n.need / totalNeed;
        return { id: n.id, need: n.need, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    entries.forEach(e => quotas.set(e.id, Math.min(e.floor, e.need)));
    let remainder = totalSlots - entries.reduce((s, e) => s + quotas.get(e.id)!, 0);
    const byFracDesc = [...entries].sort((a, b) => b.frac - a.frac);
    let idx = 0;
    let safety = 0;
    while (remainder > 0 && safety < byFracDesc.length * 3) {
        const e = byFracDesc[idx % byFracDesc.length];
        const current = quotas.get(e.id)!;
        if (current < e.need) {
            quotas.set(e.id, current + 1);
            remainder--;
        }
        idx++;
        safety++;
    }
    return quotas;
}

/**
 * Finds the nearest already-placed goal block or anchor ending at-or-before
 * `candidateStart` on the same day — used by the cross-goal/cross-pillar
 * adjacency floor to know what a new placement would actually sit next to.
 */
function findPrevAdjacentBlock(
    dateStr: string,
    candidateStart: number,
    dayBlocks: PlanBlock[],
    dayExclusions: Array<{ start: number; end: number; title: string; type: string }>
): { pillar?: string; energy_demand?: string; block_type: string } | null {
    let best: { end: number; pillar?: string; energy_demand?: string; block_type: string } | null = null;

    for (const b of dayBlocks) {
        if (b.date !== dateStr || b.block_type !== 'goal') continue;
        const bEnd = timeToMinutes(b.end_time);
        if (bEnd <= candidateStart && (!best || bEnd > best.end)) {
            best = { end: bEnd, pillar: b.pillar, energy_demand: b.energy_demand, block_type: 'goal' };
        }
    }
    for (const ex of dayExclusions) {
        if (ex.type !== 'anchor') continue;
        if (ex.end <= candidateStart && (!best || ex.end > best.end)) {
            best = { end: ex.end, block_type: 'anchor' };
        }
    }
    return best;
}

// ── Tier-2 Bio-Block Overlap Resolver ─────────────────────────────
// Anchors (Tier 1) are never moved. Meals/sleep/routine/wind-down (Tier 2)
// are movable ONLY by the minimum amount needed to clear a Tier-1 overlap —
// this is that minimal-nudge algorithm, applied uniformly to every bio
// element so none of them can silently double-book with an anchor.

interface HardZone {
    start: number;
    end: number;
    /**
     * §5: this zone's bounds ALREADY include their own separation padding —
     * anchors carry ±15min from commitmentsByDay. Requiring the user's buffer
     * on top of that is double-counting, and it is what pushed a 07:00 morning
     * routine to 10:10: the real anchor started at 08:00, its padded zone at
     * 07:45, and demanding another 15min turned a comfortable 45-minute gap
     * into an unusable one.
     */
    prePadded?: boolean;
}

function mergeIntervals(sorted: HardZone[]): HardZone[] {
    const out: HardZone[] = [];
    for (const z of sorted) {
        const last = out[out.length - 1];
        if (last && z.start <= last.end) {
            last.end = Math.max(last.end, z.end);
            // A merged zone is pre-padded only if every part of it is.
            last.prePadded = last.prePadded && z.prePadded;
        } else out.push({ ...z });
    }
    return out;
}

/**
 * Computes the smallest forward/backward shift of a bio block's template
 * [start, end) that clears all overlaps with a day's hard zones (anchors +
 * already-resolved earlier bio blocks that day), preserving the block's
 * original duration. Returns null if no placement fits anywhere within
 * [minBound, maxBound) — caller should skip the element for that day only.
 */
function resolveBioBlockOverlap(
    tmplStart: number,
    tmplEnd: number,
    hardZones: HardZone[],
    minBound: number,
    maxBound: number,
    opts: {
        /** The user's configured buffer, required clear on BOTH sides. */
        bufferMins?: number;
        /** For the drift/skip log — e.g. "Breakfast". */
        label?: string;
        date?: string;
        maxDriftMins?: number;
    } = {}
): { start: number; end: number } | null {
    const duration = tmplEnd - tmplStart;
    const buffer = Math.max(0, opts.bufferMins ?? 0);
    const maxDrift = opts.maxDriftMins ?? BIO_MAX_DRIFT_MINS;
    const what = `${opts.label || 'bio block'}${opts.date ? ` on ${opts.date}` : ''}`;

    const zones = mergeIntervals([...hardZones].sort((a, b) => a.start - b.start));

    // The genuine free intervals inside the day's bounds, each carrying whether
    // the zone bounding it already includes its own padding.
    //
    // Rule 4 (a sliver between two anchors is not a real option) falls out of
    // the usability test below rather than needing zones pre-merged: a 15-min
    // gap between two lectures fails `latest < earliest` once both buffers are
    // required, so it is never offered. Merging zones up front instead was
    // actively wrong — it also swallowed the gap between the end of sleep and
    // the first anchor.
    const gaps: Array<{ start: number; end: number; leftPrePadded: boolean; rightPrePadded: boolean }> = [];
    let cursor = minBound;
    let prevZone: HardZone | null = null;
    for (const z of zones) {
        if (z.start > cursor) {
            gaps.push({
                start: cursor,
                end: Math.min(z.start, maxBound),
                leftPrePadded: !!prevZone?.prePadded,
                rightPrePadded: !!z.prePadded,
            });
        }
        cursor = Math.max(cursor, z.end);
        prevZone = z;
        if (cursor >= maxBound) break;
    }
    if (cursor < maxBound) {
        gaps.push({ start: cursor, end: maxBound, leftPrePadded: !!prevZone?.prePadded, rightPrePadded: false });
    }

    // Rule 2: a slot is usable only if it holds the block AND leaves the
    // configured buffer clear against a neighbouring zone on each side. The
    // buffer is not required against the day's own bounds (wake / wind-down) —
    // there is no block there to crowd.
    let best: { start: number; distance: number } | null = null;
    for (const gap of gaps) {
        if (gap.end <= gap.start) continue;
        // No extra buffer against the day's own bounds (there is no block
        // there to crowd), and none against a zone that already carries its
        // own padding — see HardZone.prePadded.
        const leftPad = gap.start > minBound && !gap.leftPrePadded ? buffer : 0;
        const rightPad = gap.end < maxBound && !gap.rightPrePadded ? buffer : 0;
        const earliest = gap.start + leftPad;
        const latest = gap.end - rightPad - duration;
        if (latest < earliest) continue; // not usable

        // Rule 3: distance from the configured time decides — not direction,
        // not the shape of the overlap. Within a usable gap the closest
        // possible start is the clamp of the intended start into it.
        const candidate = Math.max(earliest, Math.min(tmplStart, latest));
        const distance = Math.abs(candidate - tmplStart);
        if (!best || distance < best.distance) best = { start: candidate, distance };
    }

    // Rule 6: nothing usable — skip this element for this day, and say why.
    if (!best) {
        console.warn(
            `[PlanWeek] ${what}: no usable ${duration}min slot with a ${buffer}min buffer ` +
            `between ${minutesToTime(minBound)} and ${minutesToTime(maxBound)} — skipping it today.`
        );
        return null;
    }

    // Rule 5: place at the closest usable slot regardless, but never silently.
    if (best.distance > maxDrift) {
        console.warn(
            `[PlanWeek] ${what}: placed at ${minutesToTime(best.start)}, ` +
            `${best.distance}min from the configured ${minutesToTime(tmplStart)} ` +
            `(drift limit ${maxDrift}min). Nothing closer was usable.`
        );
    }

    return { start: best.start, end: best.start + duration };
}

/**
 * Computes energy affinity score for placing a goal in a given time window.
 * Matches goal energy_demand with phase allowed_energy to optimize placement.
 *
 * Returns multiplier 0.5x (poor fit) to 2.0x (excellent fit).
 * High-energy goals strongly prefer peak/rebound; low-energy prefer trough/wind_down.
 */
// (Energy-affinity scoring now lives in practical-constraints.ts as
// scoreWindowAffinity, alongside the hard energy-phase filter it complements
// — this file's own long-dead copy of the same logic has been removed.)

// ── Main Deterministic Generator ─────────────────────────────────

export async function generateWeekPlan(
    context: CalendarContext,
    weekStartDate: string,
    mode: 'balanced' | 'momentum' | 'recovery' = 'balanced',
    allowWeekend: boolean = true,
    protocolConfig?: ProtocolConfig,
    replanFromDate?: string
): Promise<WeekPlanVariant[]> {
    const windDown = calculateWindDown(context);
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const windDownMins = timeToMinutes(windDown);
    // We no longer manually constrain windows with wakeMins and windDownMins.
    // Instead, we just let Sleep and Wind Down blocks act as natural bounds.
    
    // 1. Build Base Bio Blocks
    // Explicitly typed: these are now read from inside the tryPush closures
    // below, which defeats TypeScript's evolving-any inference for `[]`.
    const bioTemplates: Array<{ title: string; block_type: string; start: string; end: string }> = [];
    const mealsPerDay = context.user.meals_per_day || 3;
    const mealWindows = context.user.meal_windows || {};
    
    const sleepStart = context.user.sleep_start || '23:00';
    const sleepEnd = context.user.sleep_end || '07:00';

    if (timeToMinutes(sleepStart) < timeToMinutes(sleepEnd)) {
        // Sleep happens entirely within the same calendar day (e.g., 01:00 to 08:00 or 00:00 to 08:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: sleepEnd });
        if (sleepStart === '00:00') {
            // Sleep starts at midnight — wind down occupies the tail end of the active calendar day
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
        } else if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        }
    } else {
        // Sleep crosses midnight (e.g., 23:00 to 07:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: '00:00', end: sleepEnd });
        if (timeToMinutes(sleepStart) < 1439) { // 1439 is 23:59
            bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: '23:59' });
        }
        if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        } else {
            // Wind down crosses midnight
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
            if (timeToMinutes(sleepStart) > 0) {
                bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: '00:00', end: sleepStart });
            }
        }
    }

    // Morning routine occupies wake → wake + routine mins; breakfast must never clash with it.
    // Built BEFORE the meal templates (and pushed into bioTemplates first) so the
    // Tier-2 resolver processes it first and Breakfast naturally lands after
    // wherever Morning Routine's REAL (possibly anchor-shifted) position ends up.
    const morningRoutineMins = (context.user as any).morning_routine_mins || 0;
    if (morningRoutineMins > 0) {
        const wakeTimeMins = timeToMinutes(context.user.sleep_end || '07:00');
        const morningRoutineEnd = wakeTimeMins + morningRoutineMins;
        bioTemplates.push({
            title: 'Morning Routine',
            block_type: 'routine',
            start: minutesToTime(wakeTimeMins),
            end: minutesToTime(morningRoutineEnd)
        });
    }

    if (mealsPerDay >= 1) {
        const wakeTime = context.user.sleep_end || '07:00';
        const effWakeMins = timeToMinutes(wakeTime) + morningRoutineMins;
        const windowStart = (mealWindows as any)?.breakfast?.start;
        // Prefer the user's onboarding breakfast time. If it falls during the
        // morning routine (or before wake), the routine wins and breakfast
        // follows immediately after it.
        const start = (windowStart && timeToMinutes(windowStart) >= effWakeMins)
            ? windowStart
            : minutesToTime(effWakeMins);
        bioTemplates.push({ title: 'Breakfast', block_type: 'meal', start, end: safeAddMins(start, 30) });
    }
    if (mealsPerDay >= 2) {
        const start = (mealWindows as any)?.lunch?.start || '12:30';
        bioTemplates.push({ title: 'Lunch', block_type: 'meal', start, end: safeAddMins(start, 45) });
    }
    if (mealsPerDay >= 3) {
        let start = (mealWindows as any)?.dinner?.start || '19:30';
        let end = safeAddMins(start, 45);
        // Ensure dinner ends before wind down starts to avoid clashing
        const wdMins = timeToMinutes(windDown);
        const endMins = timeToMinutes(end);
        if (wdMins > 720 && endMins > wdMins) {
            // Dinner overlaps with wind down, compress or shift back
            const startMins = timeToMinutes(start);
            if (wdMins - startMins >= 30) {
                end = minutesToTime(wdMins); // Compress to at least 30 mins
            } else {
                start = minutesToTime(wdMins - 45); // Shift back
                end = minutesToTime(wdMins);
            }
        }
        bioTemplates.push({ title: 'Dinner', block_type: 'meal', start, end });
    }

    const commitmentsByDay = new Map<number, Array<{ start: number; end: number; title: string, type: string }>>();
    for (let i = 1; i <= 7; i++) commitmentsByDay.set(i, []);

    // Load anchors into exclusion zones
    for (const cmt of context.commitments) {
        if (!cmt.is_active) continue;
        const days = ((cmt.days_of_week || []) as any[]).map(Number);
        for (let d of days) {
            if (d === 0) d = 7;
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(cmt.start_time) - 15, // 15m buffer before
                end: timeToMinutes(cmt.end_time) + 15,   // 15m buffer after
                title: cmt.title,
                type: 'anchor'
            });
        }
    }

    // NOTE: bio blocks (Sleep/Wind Down/Morning Routine/meals) are deliberately
    // NOT loaded into commitmentsByDay/baseExclusions here anymore. They are
    // resolved per-day against anchors inside generateVariant() (Tier-2 nudge
    // resolver) since their real position can shift; baseExclusions now holds
    // ONLY anchors and existing/fixed blocks (Tier 1 — truly immovable).

    // NEW: Load existing schedule blocks (fixed or done) into exclusion zones to prevent overwrites
    const exclusionsByDate = new Map<string, HardZone[]>();
    for (const block of context.schedule.target_week) {
        if (block.status === 'done' || block.is_fixed || block.commitment_id) {
            if (!exclusionsByDate.has(block.date)) exclusionsByDate.set(block.date, []);
            exclusionsByDate.get(block.date)!.push({
                start: timeToMinutes(block.start_time),
                end: timeToMinutes(block.end_time)
            });
        }
    }

    // Generate Variants: 2-option matrix per mode (6 total). Reduced from the
    // earlier 8-option matrix — fewer, more practically-trustworthy choices
    // rather than many numerically-differentiated ones. Index 0 of every
    // mode keeps its original label/identity since patch-service.ts's coach
    // replan path relies on variants[0].
    const variants: WeekPlanVariant[] = [];

    // §3: a variant that produced an overlapping or malformed block is dropped
    // rather than emitted. One option fewer beats a calendar with two blocks in
    // the same slot. If every variant is invalid there is nothing safe to show,
    // so the failure surfaces instead of being hidden.
    const rejected: string[] = [];
    const tryPush = (build: () => WeekPlanVariant) => {
        try {
            variants.push(build());
        } catch (e) {
            if (e instanceof VariantValidationError) {
                console.error(`[PlanWeek] DROPPED variant "${e.variantLabel}": ${e.defects.join('; ')}`);
                rejected.push(e.variantLabel);
                return;
            }
            throw e;
        }
    };

    if (mode === 'balanced') {
        // BALANCED MODE: Consistency & Rhythm
        tryPush(() => generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Standard Balanced', 'Evenly distributed tasks throughout the week to maintain consistent rhythm and ultradian rhythm.', 'Consistency builds momentum.', false, false, protocolConfig, undefined, replanFromDate));
        // Energy-Synced: energy-phase affinity is the PRIMARY window sort key
        // (not just a tiebreaker) — goals actively chase their chronotype-
        // matched peak/rebound window instead of following a flat time rule.
        tryPush(() => generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Energy-Synced', 'Tasks are matched to your personal energy phases (chronotype-aware) instead of a fixed time-of-day rule — demanding work lands when you are naturally sharpest.', 'Work with your energy, not against it.', false, false, protocolConfig, undefined, replanFromDate, true));
    } else if (mode === 'momentum') {
        // MOMENTUM MODE: Output Maximization
        tryPush(() => generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Peak Hour Blitz', 'Zero buffers, hard goals clustered at chronotype peak (usually 9am-12pm). High intensity, high output.', 'Attack your peak energy.', false, false, protocolConfig, 'morning', replanFromDate));
        // NOTE: previously hardcoded `false` here, permanently locking this
        // variant out of weekends regardless of the user's real Weekend Work
        // setting or how much was left unfulfilled. `timeFocus:'weekday'`'s
        // day-sort is day-number-dominated (Mon tried before Sun in every
        // pass, including fully-relaxed ones), so "Fri-Sun lighter" still
        // emerges naturally as the first preference — weekends now remain
        // available as real overflow capacity instead of being categorically
        // excluded.
        tryPush(() => generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Weekday Sprint', 'Compress hard goals Mon-Thu with back-to-back blocks and minimal buffers; Fri-Sun are lighter unless needed to fully cover your goals.', 'Sprint mode: full throttle Mon-Thu.', false, false, protocolConfig, 'weekday', replanFromDate));
    } else if (mode === 'recovery') {
        // RECOVERY MODE: Sustainable Pace
        tryPush(() => generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Spaced Mindfulness', '120-min gaps between sessions for mental reset and genuine recovery. Max 2 blocks/day.', 'Slow and steady wins.', false, false, protocolConfig, undefined, replanFromDate));
        if (allowWeekend) {
            tryPush(() => generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Weekend Shift', 'Concentrate goals Fri-Sun to protect weekday lightness. 60-min buffers for gentle spacing.', 'Protect your weekdays.', false, false, protocolConfig, 'weekend', replanFromDate));
        } else {
            // Weekends are off entirely, so a weekend-shift identity makes no
            // sense — fall back to an afternoon-leaning, ultra-spaced variant
            // that still gives a genuinely different second choice.
            tryPush(() => generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Gentle Afternoon', 'Ultra-light: 1-2 blocks/day max, afternoon preferred, generous spacing. Maximum whitespace.', 'Rest is productive.', true, false, protocolConfig, 'afternoon', replanFromDate));
        }
    }

    if (variants.length === 0 && rejected.length > 0) {
        throw new Error(
            `Every schedule option contained overlapping or malformed blocks and was rejected ` +
            `(${rejected.join(', ')}). See the [PlanWeek] INVALID BLOCK lines above for the cause.`
        );
    }

    return variants;
}

function generateVariant(
    ctx: CalendarContext,
    weekStart: string,
    allowWeekend: boolean,
    wakeMins: number,
    windDownMins: number,
    bioTemplates: any[],
    baseExclusions: Map<number, Array<{ start: number; end: number; title: string, type: string }>>,
    strategyId: string,
    label: string,
    description: string,
    philosophy: string,
    forceLightWeekend: boolean = false,
    forceBonusFill: boolean = false,
    protocolConfig?: ProtocolConfig,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday',
    replanFromDate?: string,
    energySyncPrimary: boolean = false
): WeekPlanVariant {
    const blocks: PlanBlock[] = [];
    const unscheduled_minutes: Record<string, number> = {};

    // Track workload per day to intelligently distribute goals
    const workloadPerDay = new Map<number, number>();
    for (let i = 1; i <= 7; i++) workloadPerDay.set(i, 0);
    // Global per-day goal-block count, shared across ALL goals and BOTH Pass 1
    // and the Cram Pass within this run — the mode's maxGoalBlocksPerDay cap
    // is a total-per-day ceiling, not per-goal or per-pillar.
    const goalBlockCountPerDay = new Map<number, number>();
    for (let i = 1; i <= 7; i++) goalBlockCountPerDay.set(i, 0);

    // 1. Materialize bio blocks per day (Tier 2), resolving each against that
    // day's Tier-1 anchors with the minimal-shift rule. Processed in
    // bioTemplates order, accumulating each RESOLVED position as a hard zone
    // for subsequent templates that day — this is why Sleep/Wind-Down/Morning
    // Routine are constructed before the meals in generateWeekPlan(): Breakfast
    // naturally lands after wherever Morning Routine's real (possibly
    // anchor-shifted) position ends up, instead of a hardcoded fallback.
    const resolvedBioByDay = new Map<number, Array<{ tmpl: any; start: number; end: number }>>();

    // §1: the user's configured buffer, required clear on both sides of every
    // meal so one can never sit flush against the anchor that displaced it.
    const bioBufferMins = (ctx.user as any).default_buffer_duration || 10;

    for (let day = 0; day < 7; day++) {
        const date = format(addDays(parseISO(weekStart), day), 'yyyy-MM-dd');
        const jsDay = parseISO(date).getDay();
        const dayNum = jsDay === 0 ? 7 : jsDay;
        const hardZoneSeed: HardZone[] = (baseExclusions.get(dayNum) || [])
            .filter(x => x.type === 'anchor' || x.type === 'existing_block')
            // Anchor zones already carry ±15min of their own separation (see
            // commitmentsByDay). Existing blocks do not.
            .map(x => ({ start: x.start, end: x.end, prePadded: x.type === 'anchor' }));

        const dayHardZones: HardZone[] = [...hardZoneSeed];
        const resolvedForDay: Array<{ tmpl: any; start: number; end: number }> = [];

        for (const tmpl of bioTemplates) {
            const tmplStart = timeToMinutes(tmpl.start);
            const tmplEnd = timeToMinutes(tmpl.end);
            // Sleep/Wind-Down midnight-wraparound pieces may touch 00:00/23:59;
            // daytime elements are bounded by the user's actual wake/wind-down.
            const isOvernightPiece = tmpl.block_type === 'sleep' || tmpl.block_type === 'wind_down';
            const minBound = isOvernightPiece ? 0 : wakeMins;
            const maxBound = isOvernightPiece ? 1439 : windDownMins;

            const resolved = resolveBioBlockOverlap(tmplStart, tmplEnd, dayHardZones, minBound, maxBound, {
                // Sleep and wind-down are structural and must stay put; meals
                // and the morning routine are what get crowded by anchors, and
                // they are what the buffer rule is for.
                bufferMins: isOvernightPiece ? 0 : bioBufferMins,
                label: tmpl.title,
                date,
            });
            if (!resolved) continue; // no room anywhere today — skip this element only

            resolvedForDay.push({ tmpl, start: resolved.start, end: resolved.end });
            const exclusionEnd = resolved.end + (tmpl.block_type === 'meal' ? 15 : 0);
            dayHardZones.push({ start: resolved.start, end: exclusionEnd });

            // Keep resolving/simulating bio blocks for every day of the week
            // (hard-zone tracking below depends on it) but only emit blocks
            // for days on/after replanFromDate — this is what lets an
            // initial onboarding generation start mid-week (e.g. Wed) and
            // stop at Sunday without also backfilling Sleep/meals/etc. onto
            // days that have already passed (Mon/Tue).
            if (!replanFromDate || date >= replanFromDate) {
                blocks.push({
                    date,
                    start_time: minutesToTime(resolved.start),
                    end_time: minutesToTime(resolved.end),
                    title: tmpl.title,
                    block_type: tmpl.block_type
                });
            }
        }
        resolvedBioByDay.set(dayNum, resolvedForDay);
    }

    // Deep copy exclusions so we can modify them per variant — Tier 1 only
    // (anchors + existing/fixed blocks) at this point.
    const exclusions = new Map<number, Array<{ start: number; end: number; title: string, type: string }>>();
    const weekendIntensity = forceLightWeekend ? 'light' : (ctx.user.weekend_intensity || 'normal');
    // Light weekend = hard 4PM (960 mins) cutoff on Sat/Sun
    const LIGHT_WEEKEND_CUTOFF = 960; // 16:00

    for (const [d, ex] of baseExclusions.entries()) {
        exclusions.set(d, ex.map(e => ({ ...e })));
    }
    // Add Tier-2 bio blocks from their REAL resolved positions (not stale
    // template positions) so goal placement sees exactly what's on the
    // rendered calendar.
    for (const [d, resolvedList] of resolvedBioByDay.entries()) {
        for (const { tmpl, start, end } of resolvedList) {
            exclusions.get(d)?.push({
                start,
                end: end + (tmpl.block_type === 'meal' ? 15 : 0),
                title: tmpl.title,
                type: tmpl.block_type
            });
        }
    }

    // ── §2b: the per-day shortening gate ─────────────────────────────
    //
    // "If a day's free minutes are at least the minutes to be planned that day,
    // nothing on that day may be shortened or split. Full stop."
    //
    // Free minutes come from the SAME exclusion set placement uses — anchors,
    // bio blocks and whatever has already been placed — so the gate can never
    // disagree with what the placer sees. `dayFreeBaseline` is the day's total
    // schedulable time before any goal blocks land; subtracting the goal
    // minutes already placed gives what is genuinely left at any moment.
    const dayWindDownFor = (isoDay: number) => {
        const isWeekendDay = isoDay >= 6;
        return (isWeekendDay && weekendIntensity === 'light')
            ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
            : windDownMins;
    };

    const dayFreeBaseline = new Map<number, number>();
    for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
        const upper = dayWindDownFor(isoDay);
        const occupied = mergeIntervals(
            (exclusions.get(isoDay) || [])
                .map(e => ({ start: Math.max(e.start, wakeMins), end: Math.min(e.end, upper) }))
                .filter(e => e.end > e.start)
                .sort((a, b) => a.start - b.start)
        ).reduce((s, e) => s + (e.end - e.start), 0);
        dayFreeBaseline.set(isoDay, Math.max(0, (upper - wakeMins) - occupied));
    }

    /**
     * May a block be trimmed on this day?
     *
     * Closed (false) whenever the day still has room for the whole thing —
     * failing to use that room is a placement problem to be solved by trying
     * another window, another day, or the swap pass, never by trimming.
     */
    const gateAllowsShortening = (isoDay: number, neededMins: number): boolean => {
        const placed = workloadPerDay.get(isoDay) || 0;
        const freeLeft = (dayFreeBaseline.get(isoDay) || 0) - placed;
        return freeLeft < neededMins;
    };

    /**
     * The ladder ran out with the gate still closed. Distinguish the two very
     * different causes rather than calling both a "search failure":
     *
     *  - A window big enough exists somewhere → the search genuinely failed,
     *    and that is a bug worth shouting about.
     *  - No window anywhere is big enough → the day has the MINUTES but not a
     *    contiguous run of them, which is the honest caveat from Prompt 48 §2b
     *    and not a bug at all.
     */
    const reportLadderExhausted = (
        goalTitle: string, dateStr: string, isoDay: number, needMins: number, action: string
    ): void => {
        const elsewhere = windowsAcrossWeekFor(needMins);
        const freeLeft = (dayFreeBaseline.get(isoDay) || 0) - (workloadPerDay.get(isoDay) || 0);
        if (elsewhere.length > 0) {
            console.error(
                `[PlanWeek] SEARCH FAILURE: "${goalTitle}" (${needMins}min) on ${dateStr} — ` +
                `${freeLeft}min free here and these windows WOULD have held it: ` +
                `${elsewhere.map(w => `day${w.isoDay} ${minutesToTime(w.start)}–${minutesToTime(w.end)}`).join(', ')}. ` +
                `${action} rather than dropping the block, but the search should have found one of those.`
            );
        } else {
            console.log(
                `[PlanWeek] FRAGMENTED: "${goalTitle}" (${needMins}min) on ${dateStr} — ` +
                `${freeLeft}min free here, but no contiguous run that long exists anywhere this week. ` +
                `${action} rather than dropping the block. This is capacity shape, not a search bug.`
            );
        }
    };

    /** Every window across the WEEK that could hold `mins` in full, for §2a's report. */
    const windowsAcrossWeekFor = (mins: number): Array<{ isoDay: number; start: number; end: number }> => {
        const out: Array<{ isoDay: number; start: number; end: number }> = [];
        for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
            if (!allowWeekend && isoDay >= 6) continue;
            const upper = dayWindDownFor(isoDay);
            const merged = mergeIntervals(
                (exclusions.get(isoDay) || [])
                    .map(e => ({ start: e.start, end: e.end }))
                    .sort((a, b) => a.start - b.start)
            );
            let cursor = wakeMins;
            for (const e of merged) {
                if (e.start > cursor) {
                    const end = Math.min(e.start, upper);
                    if (end - cursor >= mins) out.push({ isoDay, start: cursor, end });
                }
                cursor = Math.max(cursor, e.end);
                if (cursor >= upper) break;
            }
            if (upper - cursor >= mins) out.push({ isoDay, start: cursor, end: upper });
        }
        return out;
    };

    // Sort goals: Importance -> Placement Difficulty -> Weekly Progress -> Energy Demand -> Total Minutes
    //
    // Importance leads. This scheduler is sequential and greedy: a goal placed
    // earlier picks from a full set of windows and gets its whole session,
    // while whatever comes later meets the leftovers and is the thing that
    // gets shortened. So sort order IS the answer to "who absorbs the
    // shortfall when the week is full", and it must be importance.
    //
    // Weekly progress used to lead, which meant a medium-importance goal that
    // was behind could push a high-importance one back into the scraps. It is
    // still a real signal, so it now breaks ties within an importance band
    // rather than overriding the band.
    // ── §1/§2: recovery triage, applied ONCE ─────────────────────────
    //
    // `minutes_per_day` and `days_per_week` are read in a dozen places below.
    // Patching each one would produce a half-implemented feature that looks
    // right in the log and wrong on the calendar, so the adjustment happens
    // here and everything downstream simply reads the triaged list — as far as
    // the placement engine is concerned, these ARE the week's goals.
    //
    // Gated on recovery: balanced and momentum see ctx.goals untouched.
    const isRecoveryMode = strategyId === 'recovery';
    const recoveryTriage = isRecoveryMode ? applyRecoveryTriage(ctx.goals) : null;
    const planningGoals: any[] = recoveryTriage ? recoveryTriage.goals : ctx.goals;
    const deferredIds = new Set((recoveryTriage?.deferred || []).map(d => d.id));

    if (recoveryTriage) {
        console.log(`[PlanWeek] recovery triage: ${describeRecoveryTriage(recoveryTriage)}`);
    }

    let sortedGoals = [...planningGoals].sort((a, b) => {
        // Priority 1: Placement difficulty (rigidity). Body goals carry one
        // contiguous block, one body block per day across ALL goals, their own
        // days_per_week cadence, and now a 60-minute evening exclusion. Their
        // set of viable windows is dramatically narrower than a mind/craft
        // goal's, so a rigid goal must pick before a flexible one or it finds
        // nothing left that satisfies every rule at once.
        //
        // Rigidity outranks importance deliberately: importance decides who
        // wins a contested window, but a flexible goal that picks first can
        // take the ONLY window a rigid goal could ever have used, and then
        // place itself somewhere else just as happily. Ordering by importance
        // first put Sports at zero for exactly that reason.
        const aBody = a.pillar === 'body' ? 0 : 1;
        const bBody = b.pillar === 'body' ? 0 : 1;
        if (aBody !== bBody) return aBody - bBody;

        // Priority 2: Importance, within a rigidity class (already normalized
        // to a number at the CalendarContext boundary — see normalizeImportance
        // in context-builder). This is what decides who absorbs a shortfall:
        // the scheduler is sequential and greedy, so whatever is placed later
        // meets the leftovers and is the thing that gets shortened.
        const aImportance = a.importance || 5;
        const bImportance = b.importance || 5;
        if (bImportance !== aImportance) return bImportance - aImportance;

        // Priority 3: Weekly Progress (Behind schedule comes first)
        const aProgress = ctx.goalProgress?.find(p => p.goal_id === a.id);
        const bProgress = ctx.goalProgress?.find(p => p.goal_id === b.id);
        const aBehind = aProgress && aProgress.weekly_target_minutes > 0
            ? aProgress.completed_minutes_target_week / aProgress.weekly_target_minutes : 0;
        const bBehind = bProgress && bProgress.weekly_target_minutes > 0
            ? bProgress.completed_minutes_target_week / bProgress.weekly_target_minutes : 0;

        if (aBehind < 0.5 && bBehind >= 0.5) return -1;
        if (bBehind < 0.5 && aBehind >= 0.5) return 1;

        // Priority 4: Energy Demand (High energy first)
        const energyOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const aEnergy = energyOrder[(a.energy_demand || 'medium').toLowerCase()] || 2;
        const bEnergy = energyOrder[(b.energy_demand || 'medium').toLowerCase()] || 2;
        if (bEnergy !== aEnergy) return bEnergy - aEnergy;

        // Priority 5: Total Minutes
        const aTotal = (a.days_per_week || 5) * (a.minutes_per_day || 60);
        const bTotal = (b.days_per_week || 5) * (b.minutes_per_day || 60);
        return bTotal - aTotal;
    });

    // ENERGY-AWARE FILTERING: Adjust sorting based on user's current energy level.
    // If the user has low energy, deprioritize high-energy goals — but only
    // WITHIN an importance band.
    //
    // This used to re-partition the whole list, which silently threw away the
    // importance ordering above: a high-energy, high-importance goal (Gym, 9)
    // landed behind every medium-energy goal including medium-importance ones
    // (Assignments, 5). Combined with the body wind-down exclusion that leaves
    // body goals nothing but scraps. Low energy is a reason to prefer the
    // gentler of two equally important goals, not a reason to demote an
    // important one below a less important one.
    const userEnergy = ctx.dailyEnergyState?.energy_level || 3;
    if (userEnergy < 3) {
        const energyRank = (g: typeof sortedGoals[number]) => {
            const e = (g.energy_demand || 'medium').toLowerCase();
            return e === 'low' ? 0 : e === 'medium' ? 1 : 2;
        };
        // Band on (rigidity, importance) — the same two keys the main sort
        // leads with — so reordering for energy can never move a body goal
        // behind a flexible one, or a high-importance goal behind a lower one.
        const bandKey = (g: typeof sortedGoals[number]) =>
            `${g.pillar === 'body' ? 0 : 1}:${String(1000 - (g.importance || 5)).padStart(4, '0')}`;
        const bands = new Map<string, typeof sortedGoals>();
        for (const g of sortedGoals) {
            const band = bandKey(g);
            if (!bands.has(band)) bands.set(band, []);
            bands.get(band)!.push(g);
        }
        sortedGoals = [...bands.keys()]
            .sort()
            .flatMap(band => {
                const inBand = bands.get(band)!;
                // Stable within equal energy: keeps the body-first tiebreak
                // and everything below it from the main sort.
                return inBand
                    .map((g, i) => ({ g, i }))
                    .sort((x, y) => (energyRank(x.g) - energyRank(y.g)) || (x.i - y.i))
                    .map(({ g }) => g);
            });
    } else if (userEnergy >= 4) {
        // High energy: high-energy goals stay prioritized (no reordering needed)
    }
    // else moderate energy (3): use default sort as-is

    // Light-load cap relaxation (#2/#3): sum each goal's remaining weekly
    // minutes using the SAME formula the main loop below uses per-goal, so
    // the light-load check reflects exactly what's about to be scheduled.
    let totalWeeklyMinsNeeded = 0;
    for (const g of sortedGoals) {
        const gProgress = ctx.goalProgress?.find(p => p.goal_id === g.id);
        let gRemaining = gProgress ? gProgress.remaining_minutes : (g.days_per_week || 5) * (g.minutes_per_day || 60);
        if (replanFromDate) {
            const gTargetMins = (g.days_per_week || 5) * (g.minutes_per_day || 60);
            const gMinsBeforeReplan = ctx.schedule.target_week
                .filter(b => b.goal_id === g.id && b.date < replanFromDate && b.status !== 'cancelled' && b.status !== 'missed')
                .reduce((sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
            gRemaining = Math.max(0, gTargetMins - gMinsBeforeReplan);
        }
        totalWeeklyMinsNeeded += Math.max(0, gRemaining);
    }
    const eligibleDayCount = allowWeekend ? 7 : 5;
    const effectiveCaps = computeEffectiveDailyCaps(
        totalWeeklyMinsNeeded, protocolConfig, eligibleDayCount,
        recoveryTriage ? recoveryTriage.goals : undefined
    );

    // Failure-mode-driven protective adjustments (applied as a floor in every
    // mode, tempered lighter for Momentum) — only meaningful when the daily
    // caps are actually active (light-load relaxation above already handles
    // "don't over-constrain a week with little to schedule").
    const failureAdjustments = getFailureModeAdjustments((ctx.user as any).failure_modes, strategyId);
    if (effectiveCaps.maxGoalBlocksPerDay !== undefined && failureAdjustments.blockCountDelta !== 0) {
        effectiveCaps.maxGoalBlocksPerDay = Math.max(1, effectiveCaps.maxGoalBlocksPerDay + failureAdjustments.blockCountDelta);
    }
    if (effectiveCaps.maxDeepWorkMins !== undefined && failureAdjustments.minsMultiplier !== 1) {
        effectiveCaps.maxDeepWorkMins = Math.max(30, Math.round(effectiveCaps.maxDeepWorkMins * failureAdjustments.minsMultiplier));
    }

    // Energy-phase model for this variant (ramp_up/peak/trough/rebound/wind_down)
    // — chronotype now flows from onboarding/Settings; defaults to 'bear' for
    // users who haven't set one, preserving today's behavior for them.
    const chronotype = (ctx.user as any).chronotype || 'bear';
    const phases: DayPhase[] = computeDayPhases(wakeMins, timeToMinutes(ctx.user.sleep_start || '23:00'), chronotype);
    // low_afternoon_energy fully protects the trough phase regardless of the
    // failure-mode temper factor (see practical-constraints.ts) — it's a
    // factual self-report about this specific user, not a generic caution.
    const effectivePhases: DayPhase[] = failureAdjustments.troughFullyProtected
        ? phases.map(p => p.name === 'trough' ? { ...p, allowed_energy: ['low'] as Array<'high' | 'medium' | 'low'> } : p)
        : phases;

    // Body-pillar goals share a single "1 body block per day" slot (avoids
    // stacking two tough physical sessions on the same day). With only one
    // body goal that's a non-issue, but with 2+, the week's eligible days
    // must be apportioned between them based on how much each ACTUALLY still
    // needs — not by goal identity/sort order, which used to let whichever
    // goal sorted first permanently lock a fixed day-lane regardless of
    // whether it still needed all of it, starving a hungrier goal even after
    // a mid-week replan shrank the first goal's remaining work.
    const bodyGoalDayQuota = new Map<string, Set<number>>();
    {
        const eligibleDays = allowWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
        const bodyGoals = sortedGoals
            .filter(g => g.pillar === 'body')
            .map(g => ({
                id: g.id,
                targetPerDay: Math.max(1, g.minutes_per_day || 60),
                remaining: computeRemainingWeeklyMins(g, ctx, replanFromDate),
            }));

        if (bodyGoals.length > 1) {
            const needs = bodyGoals.map(g => ({
                id: g.id,
                need: Math.min(eligibleDays.length, Math.ceil(g.remaining / g.targetPerDay)),
            }));
            const totalNeed = needs.reduce((s, n) => s + n.need, 0);

            if (totalNeed > eligibleDays.length) {
                // Genuine contention: no day-splitting scheme can give every
                // goal every day it wants, so apportion the week's slots
                // proportionally to need (capped per-goal at its own need),
                // then hand out days via greedy fair-queueing — repeatedly
                // give the next day to whichever under-quota goal has used
                // the smallest fraction of its quota so far. This spreads
                // each goal's days evenly through the week instead of
                // clumping them at the start or end.
                const quotas = largestRemainderApportion(needs, eligibleDays.length);
                const assigned = new Map<string, number>();
                for (const n of needs) { assigned.set(n.id, 0); bodyGoalDayQuota.set(n.id, new Set()); }
                for (const day of eligibleDays) {
                    let bestId: string | null = null;
                    let bestRatio = Infinity;
                    let bestAdjacent = true;
                    for (const n of needs) {
                        const quota = quotas.get(n.id) || 0;
                        const used = assigned.get(n.id)!;
                        if (used >= quota) continue;
                        const ratio = quota > 0 ? used / quota : Infinity;

                        // §2c: on recovery, prefer a goal whose lane does NOT
                        // already touch the day before or after. Body goals are
                        // where back-to-back sessions matter most physically —
                        // two Gym sessions belong Tue/Fri, not Mon/Tue — so if
                        // only one thing gets the spacing treatment it is these.
                        const lane = bodyGoalDayQuota.get(n.id)!;
                        const adjacent = isRecoveryMode && (lane.has(day - 1) || lane.has(day + 1));

                        const better = isRecoveryMode
                            ? (adjacent !== bestAdjacent ? !adjacent : ratio < bestRatio)
                            : ratio < bestRatio;
                        if (better) { bestRatio = ratio; bestId = n.id; bestAdjacent = adjacent; }
                    }
                    if (!bestId) continue; // every goal already at its quota
                    bodyGoalDayQuota.get(bestId)!.add(day);
                    assigned.set(bestId, assigned.get(bestId)! + 1);
                }
            }
            // else: totalNeed <= eligibleDays.length — no contention this
            // week, leave the map empty for these goals (unrestricted); each
            // goal's own remainingWeeklyMins stopping condition already caps
            // it at exactly what it needs, so no lane is required.
        }
    }

    // The order goals are placed in IS the answer to who absorbs a shortfall,
    // so it has to be visible when a plan comes out wrong.
    console.log(
        `[PlanWeek] "${label}" goal order: ` +
        sortedGoals.map(g => `${g.title.trim()}(imp${g.importance || 5}${g.pillar === 'body' ? ',body' : ''})`).join(' → ')
    );

    // §1a: importance-weighted weekly allocation. On a week with headroom every
    // goal is allocated its full need and this changes nothing; on an
    // over-subscribed week it decides who absorbs the shortfall, with a
    // MIN_BLOCK_MINS floor per goal so none is starved to zero.
    const weeklyCapacityMins = Math.round((ctx.capacity?.weekly_available_hours || 0) * 60);
    const importanceAllocation = allocateDayShares(
        sortedGoals.map(g => ({
            id: g.id,
            importance: g.importance || 5,
            needMins: computeRemainingWeeklyMins(g, ctx, replanFromDate),
        })),
        weeklyCapacityMins
    );

    // §1: why a goal did not get a block on a given day.
    //
    // The placement log used to print a hardcoded "SHORT — unknown" for every
    // shortfall, because nothing ever recorded a reason. Every `continue` in
    // the day loop below now names the rule that fired, so a short goal always
    // says which constraint stopped it. A rejection with no reason is itself a
    // bug — `reject()` is the only way out of the loop.
    const rejections = new Map<string, Map<string, number>>();
    const rejectionDays = new Map<string, Set<string>>();
    const reject = (goalId: string, dateStr: string, reason: string): void => {
        if (!rejections.has(goalId)) rejections.set(goalId, new Map());
        const counts = rejections.get(goalId)!;
        counts.set(reason, (counts.get(reason) || 0) + 1);
        if (!rejectionDays.has(goalId)) rejectionDays.set(goalId, new Set());
        rejectionDays.get(goalId)!.add(dateStr);
    };
    /** The dominant reason a goal fell short, for the placement log. */
    const topReason = (goalId: string): string => {
        const counts = rejections.get(goalId);
        if (!counts || counts.size === 0) return 'no window was ever tried (check days_per_week and the day loop)';
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const total = sorted.reduce((s, [, n]) => s + n, 0);
        const head = sorted.slice(0, 3).map(([r, n]) => `${r} ×${n}`).join('; ');
        return `${head}${sorted.length > 3 ? ` (+${total - sorted.slice(0, 3).reduce((s, [, n]) => s + n, 0)} more)` : ''}`;
    };

    // §1b: every shortened block, with the importance that allowed it, so the
    // ordering invariant can be audited rather than assumed.
    const shortenedLog: Array<{
        goal: string; importance: number; date: string; wanted: number; got: number;
    }> = [];
    // §2: every time a body block had to be placed closer to wind-down than the
    // rule allows. A block against wind-down is a recorded exception.
    const bodyGapRelaxations: Array<{
        goal: string; date: string; achievedGapMins: number;
    }> = [];

    for (const goal of sortedGoals) {
        // Progress-aware scheduling: how much is ACTUALLY left to do this
        // week, shared with the body-lane computation above so they can't
        // drift out of sync with each other.
        let remainingWeeklyMins = computeRemainingWeeklyMins(goal, ctx, replanFromDate);

        // §1a: on an over-subscribed week, cap this goal at its importance-weighted
        // share. No-op when the week has headroom.
        const allocatedMins = importanceAllocation.get(goal.id);
        if (allocatedMins !== undefined && allocatedMins < remainingWeeklyMins) {
            console.log(
                `[PlanWeek] allocation: "${goal.title}" (importance ${goal.importance || 5}) ` +
                `capped ${remainingWeeklyMins}min → ${allocatedMins}min (week is over-subscribed)`
            );
            remainingWeeklyMins = allocatedMins;
        }

        if (remainingWeeklyMins <= 0) continue; // Goal already reached for the week!

        const targetMinsPerDay = goal.minutes_per_day || 60;

        // Goal energy is already normalized to 'low'|'medium'|'high' at the
        // CalendarContext ingestion boundary (context-builder.ts).
        const goalEnergy = ((goal.energy_demand || 'medium').toLowerCase()) as 'low' | 'medium' | 'high';
        // A goal's own stated preferred time of day (from onboarding) is a
        // more specific, reliable signal than the variant's generic
        // mode-level timeFocus — it wins for time-of-day-WITHIN-day window
        // selection. The mode-level timeFocus still governs DAY selection
        // (preferredDays sort below is untouched).
        const goalTimeFocus = (goal.preferred_time_of_day && goal.preferred_time_of_day !== ('flexible' as any))
            ? goal.preferred_time_of_day
            : timeFocus;

        // Determine preferred days based on strategy
        let preferredDays = [1, 2, 3, 4, 5, 6, 7];
        if (!allowWeekend) preferredDays = [1, 2, 3, 4, 5];

        if (timeFocus === 'weekend') {
            preferredDays.sort((a, b) => {
                const aIsWeekend = a >= 6 ? 1 : 0;
                const bIsWeekend = b >= 6 ? 1 : 0;
                if (aIsWeekend !== bIsWeekend) return bIsWeekend - aIsWeekend; // Weekend first
                return (workloadPerDay.get(a) || 0) - (workloadPerDay.get(b) || 0);
            });
        } else if (timeFocus === 'weekday') {
            // Shared by Momentum's "Weekday Sprint" and Balanced's "Workday Focus":
            // both want a genuine Mon-Thu-heavy concentration, not just "not
            // weekend" — bucket Mon-Thu before Fri-Sun explicitly (mirroring
            // the 'weekend' branch above), THEN load-balance within each
            // bucket. A pure `day*1000 + load` weight (the old formula) lets
            // day-number dominate so completely that it converges on the
            // same order as a plain least-loaded-day sort once every day
            // ends up with blocks — collapsing this variant's identity into
            // Peak Hour Blitz's whenever the week fills up. The explicit
            // bucket keeps Mon-Thu genuinely preferred while still allowing
            // Fri-Sun as real overflow capacity once Mon-Thu is exhausted.
            preferredDays.sort((a, b) => {
                const aIsCore = a <= 4 ? 0 : 1;
                const bIsCore = b <= 4 ? 0 : 1;
                if (aIsCore !== bIsCore) return aIsCore - bIsCore;
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return a - b;
            });
        } else if (strategyId === 'momentum') {
            // Peak Hour Blitz (timeFocus='morning'): no day-of-week concentration
            // intent of its own — just fill the lightest day first. Its actual
            // differentiation is window-level (morning-anchored placement).
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return a - b;
            });
        } else if (strategyId === 'recovery') {
            // §2a/§2d: this initial order barely matters now — the day loop
            // re-ranks live before every block via pickRecoveryDayIndex, which
            // is what actually stops the clumping. The `forceLightWeekend`
            // reversal is gone: it swept the week Sun→Mon, which is not what
            // "light weekend" means and would actively fight the weekend
            // weighting. That flag is now a stronger weekend penalty instead.
            preferredDays.sort((a, b) => {
                const blocksA = goalBlockCountPerDay.get(a) || 0;
                const blocksB = goalBlockCountPerDay.get(b) || 0;
                if (blocksA !== blocksB) return blocksA - blocksB;
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return a - b;
            });
        } else if (strategyId === 'balanced') {
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                // Reverse the tie-breaker for the secondary "afternoon" option to guarantee a different plan
                return timeFocus === 'afternoon' ? b - a : a - b;
            });
        }

        const allDays = [1, 2, 3, 4, 5, 6, 7];
        const MAX_PASS = 5;

        for (let pass = 0; pass <= MAX_PASS; pass++) {
            if (remainingWeeklyMins <= 0) break;

            const isRelaxedEnergy = pass >= 2;
            const isRelaxedSession = pass >= 3;
            const isRelaxedBuffer = pass >= 4;
            const isRelaxedDayCaps = pass >= 5;

            // §2b: relaxation passes used raw `allDays` = [1..7], so every
            // pass restarted at Monday — re-introducing front-loading exactly
            // when the planner was trying hardest to place things. On recovery
            // the queue is re-ranked live instead (below); other modes keep
            // their existing order untouched.
            const daysToTry = pass === 0 ? preferredDays : allDays;

            // §2a: pick the next day from the UPDATED counters each time.
            // A `for…of` over a precomputed array meant a goal's own
            // placements never affected where its next block went. For
            // non-recovery modes `idx` is always 0, so the iteration order is
            // byte-for-byte what it was.
            const dayQueue = [...daysToTry];
            while (dayQueue.length > 0) {
                if (remainingWeeklyMins <= 0) break;

                const isoDay = isRecoveryMode
                    ? dayQueue.splice(pickRecoveryDayIndex(dayQueue, {
                        goalBlockCountPerDay,
                        workloadPerDay,
                        daysUsedByThisGoal: new Set(
                            blocks.filter(b => b.goal_id === goal.id)
                                .map(b => ((parseISO(b.date).getDay() + 6) % 7) + 1)
                        ),
                        forceLightWeekend,
                    }), 1)[0]
                    : dayQueue.shift()!;

                const isWeekend = isoDay >= 6;
                // Always respect allowWeekend! (Even in allDays passes)
                if (!allowWeekend && isWeekend) continue;

                const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
                if (replanFromDate && dateStr < replanFromDate) continue;

                const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
                const scheduledToday = blocksThisDayForGoal.reduce((sum, b) => sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);

                // Body goals: no more than 1 block per day for this goal, AND max 1 body block globally across all goals
                if (goal.pillar === 'body') {
                    if (blocksThisDayForGoal.length > 0) { reject(goal.id, dateStr, 'body: already has its one block today'); continue; }
                    const otherBodyBlocks = blocks.filter(b => b.date === dateStr && b.pillar === 'body' && b.goal_id !== goal.id);
                    if (otherBodyBlocks.length > 0) { reject(goal.id, dateStr, `body: another body block already holds today ("${otherBodyBlocks[0].title}")`); continue; }
                    // A body goal may not spread beyond its own stated cadence.
                    // "One body block per day globally" means every extra day a
                    // body goal takes is a day permanently denied to every other
                    // body goal. Gym (3 days/week) was running onto a 4th day to
                    // make up minutes it had lost to shortening, which left
                    // Sports with no eligible day at all and placed it at zero.
                    const daysUsedByGoal = new Set(
                        blocks.filter(b => b.goal_id === goal.id).map(b => b.date)
                    ).size;
                    if (daysUsedByGoal >= Math.max(1, goal.days_per_week || 5)) { reject(goal.id, dateStr, `days_per_week cap reached (${daysUsedByGoal}/${goal.days_per_week})`); continue; }
                    // With 2+ competing body goals, "1 body block per day globally"
                    // means whichever goal sorts first can claim every day of the
                    // week before a second body goal ever gets a turn — total,
                    // permanent starvation, not just same-day avoidance. Give each
                    // body goal its own round-robin lane of days in the early
                    // (strict) passes; later passes fall back to whatever's left.
                    const bodyLane = bodyGoalDayQuota.get(goal.id);
                    if (bodyLane && !bodyLane.has(isoDay)) { reject(goal.id, dateStr, 'body day-lane: this day belongs to another body goal'); continue; }
                } else {
                    // Mind/craft goals:
                    // Only restrict max 2 blocks per day in Pass 0 (Strict) to preserve strategy
                    if (pass === 0 && blocksThisDayForGoal.length >= 2) { reject(goal.id, dateStr, 'pass 0: already 2 blocks for this goal today'); continue; }
                }

                const remainingMinsForDayCap = Math.max(0, targetMinsPerDay - scheduledToday);
                if (remainingMinsForDayCap <= 0) { reject(goal.id, dateStr, `minutes_per_day already met today (${scheduledToday}/${targetMinsPerDay}m)`); continue; }

                let remainingToPlace = Math.min(remainingMinsForDayCap, remainingWeeklyMins);
                // Splinter prevention...
                if (remainingWeeklyMins - remainingToPlace > 0 && remainingWeeklyMins - remainingToPlace < 30) {
                    remainingToPlace = Math.ceil((remainingWeeklyMins / 2) / 15) * 15;
                }

                // Apply day caps UNLESS relaxed
                const dayCap = getDayCapacity(isoDay, goalBlockCountPerDay, workloadPerDay, effectiveCaps);
                if (!isRelaxedDayCaps) {
                    if (!dayCap.hasBlockRoom || dayCap.minutesHeadroom <= 0) { reject(goal.id, dateStr, !dayCap.hasBlockRoom ? 'mode block cap: no block slots left today' : 'mode day cap: no deep-work minutes left today'); continue; }
                    remainingToPlace = Math.min(remainingToPlace, dayCap.minutesHeadroom);
                }

                // The 30-min anti-fragmentation floor must not exceed the goal's
                // OWN daily target — a 15min/day meditation goal is never going
                // to clear a hardcoded 30min bar and would be permanently
                // unplaceable otherwise.
                const minBlockFloor = Math.min(30, targetMinsPerDay);
                if (remainingToPlace < minBlockFloor && goal.pillar !== 'body') { reject(goal.id, dateStr, `remaining ${remainingToPlace}m is below the ${minBlockFloor}m anti-fragmentation floor`); continue; }
                if (goal.pillar === 'body' && !isRelaxedDayCaps && dayCap.minutesHeadroom < remainingToPlace) { reject(goal.id, dateStr, `body needs ${remainingToPlace}m contiguous but only ${dayCap.minutesHeadroom}m of day-cap headroom remains`); continue; }

                // Build exclusions and wind down...
                const dayWindDown = (isWeekend && weekendIntensity === 'light')
                    ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
                    : windDownMins;

                // The body gap gives way only when the goal would otherwise go
                // unplaced ENTIRELY — not merely to top up a goal that already
                // has blocks elsewhere in the week. Without this the final pass
                // relaxed it every time, which turned a documented exception
                // back into the routine outcome it was meant to replace.
                const goalHasNothingYet = !blocks.some(b => b.goal_id === goal.id);
                const { gapMins: preWindDownGapMins, bodyGapRelaxed } = resolvePreWindDownGapMins({
                    pillar: goal.pillar,
                    goalEnergy,
                    strategyId,
                    isRelaxedBuffer,
                    isFinalPass: pass === MAX_PASS && goalHasNothingYet,
                    preWindDownGapBonus: failureAdjustments.preWindDownGapBonus,
                });

                const effectiveDayWindDown = Math.max(wakeMins, dayWindDown - preWindDownGapMins);
                const dayExclusions = exclusions.get(isoDay)!;
                dayExclusions.sort((a, b) => a.start - b.start);

                let windows: Array<{ start: number; end: number }> = [];
                let cursor = wakeMins;

                for (const ex of dayExclusions) {
                    let exEnd = ex.end;
                    if (ex.type === 'meal' && (goal.pillar === 'body' || goalEnergy === 'high')) {
                        exEnd += 45;
                    }
                    if (cursor < ex.start) {
                        // Clamp to the wind-down bound. Only the TRAILING window
                        // used to be clamped, so any gap that happened to sit
                        // before another exclusion (the Wind Down block itself,
                        // a late commitment) silently ignored the pre-wind-down
                        // gap entirely — which is how a Gym block came to end at
                        // 23:15 with wind-down starting at 23:15 despite a
                        // non-zero gap being computed for it.
                        windows.push({ start: cursor, end: Math.min(ex.start, effectiveDayWindDown) });
                    }
                    cursor = Math.max(cursor, exEnd);
                }
                if (cursor < effectiveDayWindDown) {
                    windows.push({ start: cursor, end: effectiveDayWindDown });
                }

                // Body spacing (afternoon for recovery) - ONLY in PASS 0!
                if (goal.pillar === 'body' && pass === 0) {
                    if (strategyId === 'recovery') {
                        windows = windows.filter(w => w.start >= 720 && w.end > 720); // Afternoon only
                    }
                }

                windows = windows.filter(w => w.end > w.start);
                
                // Energy filtering
                if (!isRelaxedEnergy) {
                    windows = filterWindowsByEnergyCompat(windows, effectivePhases, goalEnergy);
                }
                
                windows = sortWindowsByPreference(windows, { timeFocus: goalTimeFocus, pillar: goal.pillar, strategyId, goalImportance: goal.importance, energyPrimary: energySyncPrimary ? { goalEnergy: goalEnergy, phases: effectivePhases } : undefined });

                // Placement loop (body vs mind/craft)
                if (goal.pillar === 'body') {
                    let fitWindows = windows.filter(w => (w.end - w.start) >= remainingToPlace);
                    let sessionMins = remainingToPlace;
                    if (fitWindows.length === 0) {
                        // §2a: no window here holds the FULL session. The old
                        // behaviour was to grab the largest window today and
                        // shrink to fit — committing to a window before ever
                        // asking whether a big enough one existed on another
                        // day. That is the root cause of the trimming, and it
                        // is fixed by refusing to negotiate the length until
                        // every day has been tried.
                        //
                        // Trimming is now reachable only on the final pass (by
                        // which point every day has been tried at full length)
                        // AND only when §2b's gate says the day genuinely
                        // cannot hold the work.
                        const isLastChance = pass === MAX_PASS;
                        if (!isLastChance) { reject(goal.id, dateStr, `no window holds the full ${remainingToPlace}m (pass ${pass}; deferring to another day)`); continue; }

                        // §2 rung 4 — MANDATORY. We are at the end of the
                        // ladder: every window today and on every other
                        // permitted day has been tried at full length across
                        // every pass. Shortening now beats dropping, always.
                        //
                        // Prompt 48 made this `continue` when the gate was
                        // closed, which converted a shortened block into a
                        // MISSING one — Gym went from 8 shortened hours to 3
                        // hours across two days. The gate decides whether a
                        // trim is acceptable (and a closed gate means the
                        // search failed and is worth shouting about), never
                        // whether the block gets placed at all.
                        if (!gateAllowsShortening(isoDay, remainingToPlace)) {
                            reportLadderExhausted(goal.title, dateStr, isoDay, remainingToPlace, 'Shortening');
                        }

                        const candidates = windows.filter(w => (w.end - w.start) >= minBlockFloor);
                        if (candidates.length > 0) {
                            const largest = candidates.reduce((a, b) => (b.end - b.start) > (a.end - a.start) ? b : a);
                            fitWindows = [largest];
                            // Reduce by the smallest amount that fits.
                            sessionMins = Math.min(remainingToPlace, largest.end - largest.start);
                        }
                    }
                    if (fitWindows.length > 0) {
                        const win = fitWindows[0];
                        let buffer = protocolConfig?.bufferMinutes ?? getBufferMinutes(strategyId, goalTimeFocus, (ctx.user as any).default_buffer_duration);
                        if (isRelaxedBuffer) {
                            buffer = Math.min(buffer, (ctx.user as any).default_buffer_duration || 15);
                            // skip failure mode bonus
                        } else {
                            buffer = resolveAdjacencyBuffer(
                                strategyId, buffer,
                                findPrevAdjacentBlock(dateStr, win.start, blocks, dayExclusions),
                                goalEnergy, goal.pillar
                            ) + failureAdjustments.bufferFloorBonus;
                        }

                        let start = computeWindowAnchorStart(win.start, win.end, sessionMins, buffer, strategyId, goalTimeFocus);
                        // Small inset if the window is significantly larger than the block and we're packed at the edge
                        if (start === win.start && (win.end - win.start) > sessionMins + 30) {
                            start += 15;
                        }
                        start = snapStartToGrid(start, win.start, win.end, sessionMins);

                        if ((win.end - start) < sessionMins + buffer) {
                            buffer = Math.max(0, (win.end - start) - sessionMins);
                        }

                        if (sessionMins < remainingToPlace) {
                            shortenedLog.push({
                                goal: goal.title,
                                importance: goal.importance || 5,
                                date: dateStr,
                                wanted: remainingToPlace,
                                got: sessionMins,
                            });
                        }
                        if (bodyGapRelaxed) {
                            bodyGapRelaxations.push({
                                goal: goal.title,
                                date: dateStr,
                                achievedGapMins: dayWindDown - (start + sessionMins),
                            });
                        } else if (goal.pillar === 'body' && (dayWindDown - (start + sessionMins)) < BODY_WIND_DOWN_GAP_MINS) {
                            console.error(
                                `[PlanWeek] BUG: body block "${goal.title}" on ${dateStr} ends ` +
                                `${dayWindDown - (start + sessionMins)}min before wind-down without the relaxation flag ` +
                                `(pass=${pass}, gapUsed=${preWindDownGapMins}, effectiveWindDown=${effectiveDayWindDown}, dayWindDown=${dayWindDown})`
                            );
                        }

                        blocks.push({
                            date: dateStr,
                            start_time: minutesToTime(start),
                            end_time: minutesToTime(start + sessionMins),
                            title: sessionMins < remainingToPlace ? `${goal.title} (Shortened)` : goal.title,
                            block_type: 'goal',
                            goal_id: goal.id,
                            pillar: goal.pillar,
                            energy_demand: goalEnergy,
                            checklist: goal.ai_strategy?.checklist || [{ text: 'Warm up' }, { text: 'Main session' }, { text: 'Cool down' }]
                        });
                        dayExclusions.push({
                            start,
                            end: start + sessionMins + buffer,
                            title: goal.title,
                            type: 'goal'
                        });
                        recordGoalBlockPlacement(isoDay, sessionMins, goalBlockCountPerDay, workloadPerDay);
                        remainingWeeklyMins -= sessionMins;
                    }
                    continue; // Skip the rest of the window loop for body
                }

                // §1: minutes_per_day IS the session. Prefer a single window
                // that holds the whole of today's remaining amount over
                // scattering it across several — splitting is a fallback, not
                // the plan.
                //
                // The loop below is greedy per-window: it used to take the
                // best-ranked window and place whatever happened to fit, so a
                // 120min goal facing a 40min window followed by a 245min one
                // produced 40 + 30 + 50 rather than a single 120. Sorting
                // whole-session windows to the front (preserving preference
                // order within each group) makes one block the default.
                const wholeSessionWindows = windows.filter(w => (w.end - w.start) >= remainingToPlace);
                if (wholeSessionWindows.length > 0) {
                    windows = [
                        ...wholeSessionWindows,
                        ...windows.filter(w => (w.end - w.start) < remainingToPlace),
                    ];
                } else if (remainingToPlace > minBlockFloor) {
                    // §2a/§2b: no window today holds the session whole.
                    //
                    // Splitting used to become legal from pass 2 onward, which
                    // meant a goal was fragmented as soon as two passes had
                    // gone by — long before every day had been tried at full
                    // length. Now the day is declined outright until the final
                    // pass, and even then only if the gate is open.
                    if (pass < MAX_PASS) {
                        reject(goal.id, dateStr, `no window holds the full ${remainingToPlace}m (pass ${pass}; deferring to another day)`);
                        continue;
                    }

                    // §2 rung 4 — MANDATORY, as in the body path above. A
                    // closed gate here means the search failed while the time
                    // existed; that is worth an error, but never worth
                    // dropping the block.
                    if (!gateAllowsShortening(isoDay, remainingToPlace)) {
                        reportLadderExhausted(goal.title, dateStr, isoDay, remainingToPlace, 'Splitting');
                    }
                }

                // Non-body goals
                for (const win of windows) {
                    if (remainingToPlace <= 0) break;
                    let winStart = win.start;
                    let winEnd = win.end;
                    let availableInWin = winEnd - winStart;

                    while (remainingToPlace > 0 && availableInWin >= minBlockFloor) {
                        const dayCapNow = getDayCapacity(isoDay, goalBlockCountPerDay, workloadPerDay, effectiveCaps);
                        if (!isRelaxedDayCaps) {
                            if (!dayCapNow.hasBlockRoom || dayCapNow.minutesHeadroom <= 0) break;
                        }

                        const sessionState = getDaySessionState(dateStr, blocks, winStart);

                        // §1: the goal's own minutes_per_day IS the session length.
                        //
                        // This used to be `Math.min(90, ...)`. The 90 is the
                        // library default in practical-constraints, not anything
                        // the user asked for, and taking the min of it silently
                        // capped every goal: a 105min/day goal became 60+45 and a
                        // 120min/day goal became 60+60, for no reason the user
                        // expressed. The ultradian cap stays available, but only
                        // when a declared failure mode has actually lowered it —
                        // an opt-in, never a default that overrides an explicit
                        // minutes_per_day.
                        const ultradianCapOptedIn =
                            failureAdjustments.maxSessionBlockMins < DEFAULT_SESSION_CAP_MINS;
                        let sessionMaxBlockMins = ultradianCapOptedIn
                            ? Math.max(minBlockFloor, failureAdjustments.maxSessionBlockMins)
                            : targetMinsPerDay;
                        let sessionRoomLeft = computeSessionRoomLeft(sessionState, sessionMaxBlockMins);
                        let breakShortfall = requiresSessionBreakGap(sessionState, winStart, failureAdjustments.sessionBreakAfterCount);

                        if (isRelaxedSession) {
                            sessionMaxBlockMins = Math.max(120, targetMinsPerDay);
                            sessionRoomLeft = sessionMaxBlockMins; // Ignore room left limitation
                            breakShortfall = 0; // Waive required break gaps
                        }

                        if (breakShortfall > 0) break;
                        if (!isRelaxedSession && sessionRoomLeft <= 0) break;

                        const MAX_BLOCK = isRelaxedSession
                            ? Math.max(120, targetMinsPerDay)
                            : Math.max(minBlockFloor, sessionMaxBlockMins);
                        const MIN_BLOCK = 30;
                        let minsToPlace = remainingToPlace;
                        
                        if (!isRelaxedDayCaps) {
                            minsToPlace = Math.min(minsToPlace, dayCapNow.minutesHeadroom);
                        }
                        minsToPlace = Math.min(minsToPlace, availableInWin);
                        if (!isRelaxedSession) {
                            minsToPlace = Math.min(minsToPlace, sessionRoomLeft);
                        }

                        if (remainingToPlace > Math.min(availableInWin, MAX_BLOCK)) {
                            let maxAllowedChunk = Math.min(availableInWin, MAX_BLOCK);
                            if (!isRelaxedSession) {
                                maxAllowedChunk = Math.min(maxAllowedChunk, sessionRoomLeft);
                            }
                            if (maxAllowedChunk < MIN_BLOCK) break;

                            let numSplits = Math.ceil(remainingToPlace / maxAllowedChunk);
                            let bestSplitSize = Math.floor(remainingToPlace / numSplits);

                            while (numSplits > 1 && bestSplitSize < MIN_BLOCK) {
                                numSplits--;
                                bestSplitSize = Math.floor(remainingToPlace / numSplits);
                            }

                            if (bestSplitSize <= availableInWin && bestSplitSize <= MAX_BLOCK) {
                                minsToPlace = bestSplitSize;
                                if (!isRelaxedDayCaps) minsToPlace = Math.min(minsToPlace, dayCapNow.minutesHeadroom);
                                if (!isRelaxedSession) minsToPlace = Math.min(minsToPlace, sessionRoomLeft);
                            } else {
                                minsToPlace = Math.min(MAX_BLOCK, availableInWin);
                                if (!isRelaxedDayCaps) minsToPlace = Math.min(minsToPlace, dayCapNow.minutesHeadroom);
                                if (!isRelaxedSession) minsToPlace = Math.min(minsToPlace, sessionRoomLeft);
                                
                                if (remainingToPlace - minsToPlace > 0 && remainingToPlace - minsToPlace < MIN_BLOCK) {
                                    minsToPlace = remainingToPlace - MIN_BLOCK;
                                    if (minsToPlace < MIN_BLOCK) break;
                                }
                            }
                        }

                        if (minsToPlace < minBlockFloor) break;

                        let buffer = protocolConfig?.bufferMinutes ?? getBufferMinutes(strategyId, goalTimeFocus, (ctx.user as any).default_buffer_duration);
                        if (isRelaxedBuffer) {
                            buffer = Math.min(buffer, (ctx.user as any).default_buffer_duration || 15);
                            // in relaxation, just keep the minimum buffer, e.g. user default or 15, ignoring adjacency floor
                        } else {
                            buffer = resolveAdjacencyBuffer(
                                strategyId, buffer,
                                findPrevAdjacentBlock(dateStr, winStart, blocks, dayExclusions),
                                goalEnergy, goal.pillar
                            ) + failureAdjustments.bufferFloorBonus;
                        }
                        
                        if (isRelaxedSession) {
                            // "keep a 5-15 min micro-gap between consecutive chunks" - let's ensure buffer is at least 5
                            buffer = Math.max(5, buffer);
                        }

                        let start = computeWindowAnchorStart(winStart, win.end, minsToPlace, buffer, strategyId, goalTimeFocus);
                        start = snapStartToGrid(start, winStart, win.end, minsToPlace);

                        if ((win.end - start) < minsToPlace + buffer) {
                            buffer = Math.max(0, (win.end - start) - minsToPlace);
                        }

                        blocks.push({
                            date: dateStr,
                            start_time: minutesToTime(start),
                            end_time: minutesToTime(start + minsToPlace),
                            title: minsToPlace < targetMinsPerDay ? `${goal.title} (Part)` : goal.title,
                            block_type: 'goal',
                            goal_id: goal.id,
                            pillar: goal.pillar,
                            energy_demand: goalEnergy,
                            checklist: goal.ai_strategy?.checklist || [{text: "Focus session"}, {text: "Review progress"}]
                        });

                        dayExclusions.push({
                            start: start,
                            end: start + minsToPlace + buffer,
                            title: goal.title,
                            type: 'goal'
                        });

                        recordGoalBlockPlacement(isoDay, minsToPlace, goalBlockCountPerDay, workloadPerDay);

                        remainingToPlace -= minsToPlace;
                        remainingWeeklyMins -= minsToPlace;

                        // Advance the cursor from the block's ACTUAL placed
                        // position, not the pre-centering winStart. Centering
                        // (computeWindowAnchorStart's default branch) can
                        // return a start well past winStart — advancing from
                        // winStart instead of start left this loop's
                        // "free space begins here" bookkeeping desynced from
                        // the dayExclusions entry just pushed above, so the
                        // NEXT same-goal same-day session's search could
                        // start before this one's real end, landing inside
                        // its own already-recorded exclusion (the same-day
                        // "(Part)" overlap).
                        const consumed = (start - winStart) + minsToPlace + buffer;
                        winStart += consumed;
                        availableInWin -= consumed;
                    }
                }
            }
        }

        if (remainingWeeklyMins > 0) {
            unscheduled_minutes[goal.title] = remainingWeeklyMins;
        }
    }

    // ── §2b: directed swap pass ──────────────────────────────────────
    //
    // Only goals still short after the greedy passes, most-constrained first,
    // so the block that can sit almost nowhere gets the chance to displace the
    // block that can sit anywhere.
    const swapDayBounds = new Map<string, { lower: number; upper: number }>();
    const swapBodyUpper = new Map<string, number>();
    for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
        if (!allowWeekend && isoDay >= 6) continue;
        const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
        const isWeekendDay = isoDay >= 6;
        const dayWindDown = (isWeekendDay && weekendIntensity === 'light')
            ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
            : windDownMins;
        swapDayBounds.set(dateStr, { lower: wakeMins, upper: Math.max(wakeMins, dayWindDown - 20) });
        // Body keeps its full wind-down exclusion during a swap — the swap pass
        // must never be a back door around Prompt 45 §2.
        swapBodyUpper.set(dateStr, Math.max(wakeMins, dayWindDown - BODY_WIND_DOWN_GAP_MINS));
    }

    const swapNeeds = sortedGoals
        .filter(g => (unscheduled_minutes[g.title] || 0) > 0)
        .map(g => ({
            goalId: g.id,
            title: g.title,
            pillar: g.pillar,
            sessionMins: Math.min(g.minutes_per_day || 60, unscheduled_minutes[g.title]),
            dates: [...swapDayBounds.keys()].filter(d =>
                // one body block per day, and never a second block for the same
                // goal on a day it already occupies
                !blocks.some(b =>
                    b.date === d && b.block_type === 'goal' &&
                    (b.goal_id === g.id || (g.pillar === 'body' && b.pillar === 'body'))
                )
            ),
        }))
        .filter(n => n.sessionMins >= MIN_BLOCK_MINS && n.dates.length > 0);

    if (swapNeeds.length > 0) {
        const swapBuffer = protocolConfig?.bufferMinutes
            ?? getBufferMinutes(strategyId, timeFocus, (ctx.user as any).default_buffer_duration);
        const { relocations, placed } = runSwapPass({
            blocks, label, needs: swapNeeds,
            dayBounds: swapDayBounds, bodyUpperBound: swapBodyUpper, bufferMins: swapBuffer,
        });
        if (relocations > 0) {
            console.log(`[PlanWeek] "${label}" swap pass: ${relocations} relocation(s), ${placed}min placed.`);

            // Resync exclusions from the blocks themselves.
            //
            // The swap pass mutates `blocks` directly — it moves occupants and
            // pushes the newly placed goal — but never touched `exclusions`.
            // Everything downstream (the Phase 2 top-up sweep especially)
            // computes its windows from `exclusions`, so every swapped block
            // was invisible to it and it happily placed straight on top. That
            // is the `PlannrAI 10:45–12:45` / `Studying 10:45–11:30` overlap
            // that took the Gentle Afternoon variant down.
            for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
                const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
                const ex = exclusions.get(isoDay);
                if (!ex) continue;
                // Drop the stale goal entries, keep anchors and bio blocks.
                const kept = ex.filter(e => e.type !== 'goal');
                for (const b of blocks.filter(b => b.date === dateStr && b.block_type === 'goal')) {
                    kept.push({
                        start: timeToMinutes(b.start_time),
                        end: timeToMinutes(b.end_time) + swapBuffer,
                        title: b.title,
                        type: 'goal',
                    });
                }
                exclusions.set(isoDay, kept);
            }
            // Recompute shortfalls from the blocks themselves — the swap moved
            // and added blocks, so the running counters are stale.
            for (const g of sortedGoals) {
                const target = Math.max(0, computeRemainingWeeklyMins(g, ctx, replanFromDate));
                const nowPlaced = blocks
                    .filter(b => b.goal_id === g.id)
                    .reduce((s, b) => s + blockMins(b as TimedBlock), 0);
                const short = Math.max(0, target - nowPlaced);
                if (short > 0) unscheduled_minutes[g.title] = short;
                else delete unscheduled_minutes[g.title];
            }
        } else {
            console.log(
                `[PlanWeek] "${label}" swap pass: no relocation found for ` +
                `${swapNeeds.map(n => n.title.trim()).join(', ')} ` +
                `(no window would hold them even with flexible work moved out).`
            );
        }
    }

    // Phase 2: Bounded, capacity-aware top-up pass.
    //
    // A prior "Bonus Fill" pass here was removed for repeatedly over-cramming
    // already-satisfied goals (5-6 blocks/day for a goal that wanted 1). This
    // replacement is deliberately narrow, with each guard answering directly
    // why that one was reverted:
    //  - only iterates goals still present in `unscheduled_minutes` with a
    //    real shortfall — a goal the main loop fully placed is never touched;
    //  - capped at exactly that goal's own remaining shortfall, never a
    //    separate bonus budget;
    //  - only runs when the week is confirmed NOT overcommitted
    //    (`ctx.capacity.is_overcommitted === false`) and the total shortfall
    //    clears a minimum threshold — skipped entirely for rounding noise or
    //    a genuinely tight week;
    //  - single goal-minor sweep (day-outer, under-filled-goal-inner) rather
    //    than the main loop's goal-major structure, so one goal can't
    //    monopolize the sweep before others get a turn — and single-chunk
    //    placement only (no splinter/session-pacing logic), since this is a
    //    small residual mop-up, not a second full placement engine.
    // Body-pillar goals still respect the "1 block/day globally" fatigue
    // rule and their day-lane from the apportionment above — this pass finds
    // genuinely idle capacity elsewhere in the week, it does not relax
    // practical constraints to manufacture room that isn't really there.
    if (ctx.capacity.is_overcommitted === false) {
        const shortfallGoals = sortedGoals.filter(g => (unscheduled_minutes[g.title] || 0) > 0);
        const totalShortfall = shortfallGoals.reduce((s, g) => s + (unscheduled_minutes[g.title] || 0), 0);
        const topUpThreshold = Math.max(15, totalWeeklyMinsNeeded * 0.02);

        if (totalShortfall >= topUpThreshold) {
            // §2b: a top-up pass exists to find room, not to refill Monday.
            // On recovery the days are visited least-loaded-first (block count,
            // then minutes) instead of raw calendar order.
            const topUpDays = [1, 2, 3, 4, 5, 6, 7];
            if (isRecoveryMode) {
                topUpDays.sort((a, b) => {
                    const ba = goalBlockCountPerDay.get(a) || 0;
                    const bb = goalBlockCountPerDay.get(b) || 0;
                    if (ba !== bb) return ba - bb;
                    const ma = workloadPerDay.get(a) || 0;
                    const mb = workloadPerDay.get(b) || 0;
                    if (ma !== mb) return ma - mb;
                    return a - b;
                });
            }
            for (const isoDay of topUpDays) {
                const isWeekend = isoDay >= 6;
                if (!allowWeekend && isWeekend) continue;
                const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
                if (replanFromDate && dateStr < replanFromDate) continue;

                for (const goal of shortfallGoals) {
                    const remaining = unscheduled_minutes[goal.title] || 0;
                    if (remaining <= 0) continue;

                    const goalEnergy = ((goal.energy_demand || 'medium').toLowerCase()) as 'low' | 'medium' | 'high';
                    const targetMinsPerDay = goal.minutes_per_day || 60;
                    const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);

                    if (goal.pillar === 'body') {
                        if (blocksThisDayForGoal.length > 0) continue;
                        const otherBodyBlocks = blocks.filter(b => b.date === dateStr && b.pillar === 'body' && b.goal_id !== goal.id);
                        if (otherBodyBlocks.length > 0) continue;
                        const bodyLane = bodyGoalDayQuota.get(goal.id);
                        if (bodyLane && !bodyLane.has(isoDay)) continue;
                    } else if (blocksThisDayForGoal.length >= 2) {
                        continue; // don't cram a 3rd+ block for the same goal on the same day even in top-up
                    }

                    const scheduledToday = blocksThisDayForGoal.reduce((s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
                    const remainingMinsForDayCap = Math.max(0, targetMinsPerDay - scheduledToday);
                    if (remainingMinsForDayCap <= 0) continue;
                    const toPlace = Math.min(remaining, remainingMinsForDayCap);
                    const minBlockFloor = Math.min(30, targetMinsPerDay);
                    // Below the anti-fragmentation floor: a handful of scattered
                    // <30min slivers across the week isn't worth creating even
                    // as a last-resort top-up — same floor concept as the main
                    // loop's, deliberately NOT relaxed here.
                    if (toPlace < minBlockFloor && goal.pillar !== 'body') continue;

                    const dayWindDown = (isWeekend && weekendIntensity === 'light')
                        ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
                        : windDownMins;
                    // This top-up sweep runs after every pass, so it counts as
                    // final — but, as in the main loop, only for a body goal
                    // that still has nothing at all. Topping up a goal that
                    // already placed elsewhere is never worth a block against
                    // wind-down.
                    const topUpHasNothingYet = !blocks.some(b => b.goal_id === goal.id);
                    const { gapMins: topUpGapMins, bodyGapRelaxed: topUpBodyRelaxed } = resolvePreWindDownGapMins({
                        pillar: goal.pillar,
                        goalEnergy,
                        strategyId,
                        isRelaxedBuffer: true,
                        isFinalPass: topUpHasNothingYet,
                    });
                    const effectiveDayWindDown = Math.max(
                        wakeMins,
                        dayWindDown - Math.max(topUpGapMins, goalEnergy === 'low' ? 0 : 15)
                    );
                    const dayExclusions = exclusions.get(isoDay)!;
                    dayExclusions.sort((a, b) => a.start - b.start);

                    let windows: Array<{ start: number; end: number }> = [];
                    let cursor = wakeMins;
                    for (const ex of dayExclusions) {
                        let exEnd = ex.end;
                        if (ex.type === 'meal' && (goal.pillar === 'body' || goalEnergy === 'high')) exEnd += 45;
                        // Same wind-down clamp as the main loop.
                        if (cursor < ex.start) windows.push({ start: cursor, end: Math.min(ex.start, effectiveDayWindDown) });
                        cursor = Math.max(cursor, exEnd);
                    }
                    if (cursor < effectiveDayWindDown) windows.push({ start: cursor, end: effectiveDayWindDown });
                    windows = windows.filter(w => w.end > w.start);

                    // Single-chunk only: place as much of `toPlace` as fits in the
                    // single largest window — never split across multiple windows
                    // in the same day, that's the main loop's job, not this pass's.
                    const goalTimeFocus = (goal.preferred_time_of_day && goal.preferred_time_of_day !== ('flexible' as any))
                        ? goal.preferred_time_of_day
                        : timeFocus;
                    const buffer = getBufferMinutes(strategyId, goalTimeFocus, (ctx.user as any).default_buffer_duration);
                    let bestWindow: { start: number; end: number } | null = null;
                    for (const w of windows) {
                        const avail = w.end - w.start;
                        if (avail < minBlockFloor + buffer) continue;
                        if (!bestWindow || avail > (bestWindow.end - bestWindow.start)) bestWindow = w;
                    }
                    if (!bestWindow) continue;

                    const placedMins = Math.min(toPlace, (bestWindow.end - bestWindow.start) - buffer);
                    if (placedMins <= 0 || (placedMins < minBlockFloor && goal.pillar !== 'body')) continue;

                    const start = snapStartToGrid(bestWindow.start, bestWindow.start, bestWindow.end, placedMins);
                    if (topUpBodyRelaxed) {
                        bodyGapRelaxations.push({
                            goal: goal.title,
                            date: dateStr,
                            achievedGapMins: dayWindDown - (start + placedMins),
                        });
                    }
                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + placedMins),
                        title: goal.title,
                        block_type: 'goal',
                        goal_id: goal.id,
                        pillar: goal.pillar,
                        energy_demand: goalEnergy,
                        checklist: goal.ai_strategy?.checklist || [{ text: 'Focus session' }, { text: 'Review progress' }],
                    });
                    dayExclusions.push({ start, end: start + placedMins + buffer, title: goal.title, type: 'goal' });
                    recordGoalBlockPlacement(isoDay, placedMins, goalBlockCountPerDay, workloadPerDay);

                    const newRemaining = Math.max(0, remaining - placedMins);
                    if (newRemaining <= 0) delete unscheduled_minutes[goal.title];
                    else unscheduled_minutes[goal.title] = newRemaining;
                }
            }
        }
    }

    // ── §2a: concentrate any over-full day onto as few blocks as possible ──
    //
    // Runs after every rung of the ladder. If a day still carries more goal
    // minutes than it has room for, the excess is taken out of the LOWEST
    // importance block with the most slack, exhausting it before moving on —
    // one clear casualty rather than four blocks each mysteriously short.
    for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
        const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
        const free = dayFreeBaseline.get(isoDay) || 0;
        const dayGoalBlocks = blocks.filter(b => b.date === dateStr && b.block_type === 'goal');
        const planned = dayGoalBlocks.reduce(
            (s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0
        );
        const overBy = planned - free;
        if (overBy <= 0) continue;

        const importanceOf = new Map(planningGoals.map(g => [g.id, g.importance || 5]));
        const cuts = concentrateShortfall(
            dayGoalBlocks.map((b, i) => ({
                id: String(i),
                goalId: b.goal_id || '',
                title: b.title,
                mins: timeToMinutes(b.end_time) - timeToMinutes(b.start_time),
                importance: importanceOf.get(b.goal_id || '') ?? 5,
            })),
            overBy
        );

        console.warn(
            `[PlanWeek] "${label}" OVER-FULL DAY ${dateStr}: planned=${planned}m free=${free}m over=${overBy}m ` +
            `→ shortening ${cuts.length} block(s) (minimum needed to fit).`
        );
        for (const c of cuts) {
            const b = dayGoalBlocks[Number(c.id)];
            const start = timeToMinutes(b.start_time);
            b.end_time = minutesToTime(start + c.to);
            shortenedLog.push({
                goal: c.title, importance: c.importance, date: dateStr,
                wanted: c.from, got: c.to,
            });
            console.warn(
                `   ${c.title.padEnd(22)} imp=${c.importance} ${dateStr} ${c.from}m → ${c.to}m ` +
                `(day was ${overBy}m over; ${cuts.length} block(s) shortened today)`
            );
        }
    }

    // ── Post-placement: merge, retitle, validate ─────────────────────
    //
    // §1: a goal split across two blocks that sit closer together than the
    // buffer was never two sessions — stitch it back into one. Then re-derive
    // the (Part)/(Shortened) suffixes from the FINAL layout, since neither can
    // be known while blocks are still being placed one at a time.
    const mergeBuffer = protocolConfig?.bufferMinutes
        ?? getBufferMinutes(strategyId, timeFocus, (ctx.user as any).default_buffer_duration);
    const { blocks: mergedBlocks, merges } = mergeAdjacentGoalBlocks(blocks, mergeBuffer, label);
    if (merges > 0) {
        console.warn(`[PlanWeek] "${label}" merge pass joined ${merges} same-goal block pair(s).`);
    }

    const targetByGoal = new Map<string, number>(
        planningGoals.map(g => [g.id, g.minutes_per_day || 60])
    );
    const goalsShortForWeek = new Set<string>(
        planningGoals
            .filter(g => {
                const weeklyTarget = Math.max(0, computeRemainingWeeklyMins(g, ctx, replanFromDate));
                const weeklyPlaced = mergedBlocks
                    .filter(b => b.goal_id === g.id)
                    .reduce((s, b) => s + blockMins(b), 0);
                return weeklyPlaced < weeklyTarget;
            })
            .map(g => g.id)
    );
    const finalBlocks = retitleGoalBlocks(mergedBlocks, targetByGoal, goalsShortForWeek)
        .sort((a, b) =>
            a.date.localeCompare(b.date) || timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        ) as typeof blocks;

    // §3: an overlapping or malformed block is a BUG, not something to trim at
    // write time. Refuse to emit a variant that contains one.
    const defects = findBlockDefects(finalBlocks);
    if (defects.length > 0) {
        for (const d of defects) console.error(`[PlanWeek] "${label}" INVALID BLOCK: ${d}`);
        throw new VariantValidationError(label, defects);
    }

    const totalMins = finalBlocks.reduce((sum, b) => {
        if (b.block_type === 'sleep' || b.block_type === 'meal') return sum;
        return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0);

    const uniqueDays = new Set(finalBlocks.filter(b => b.block_type === 'goal').map(b => b.date));

    console.log(`[PlanWeek] "${label}" placement:`);
    for (const g of planningGoals) {
        const target = Math.max(0, computeRemainingWeeklyMins(g, ctx, replanFromDate));
        const placed = finalBlocks.filter(b => b.goal_id === g.id).reduce((s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
        const blockCount = finalBlocks.filter(b => b.goal_id === g.id).length;
        const daysCount = new Set(finalBlocks.filter(b => b.goal_id === g.id).map(b => b.date)).size;
        const daysAllowed = Math.min(7, Math.max(1, g.days_per_week || 5)); // eligibleDays is not in scope here
        const status = placed >= target ? 'MET' : `SHORT — ${topReason(g.id)}`;
        console.log(`   ${g.title.padEnd(22)} target=${String(target).padStart(4)}m placed=${String(placed).padStart(4)}m blocks=${String(blockCount).padStart(2)} days=${daysCount}/${daysAllowed}  ${status} imp=${g.importance || 5}`);

        // §2 hard invariant: a goal with work outstanding is never placed at
        // zero. That is a bug, not an outcome — the ladder's last rung is
        // supposed to make dropping impossible.
        if (target > 0 && placed === 0) {
            console.error(
                `[PlanWeek] INVARIANT VIOLATED: "${g.title}" has ${target}min outstanding but placed NOTHING. ` +
                `Days tried: ${[...(rejectionDays.get(g.id) || [])].join(', ') || 'none'}. ` +
                `Reasons: ${topReason(g.id)}.`
            );
        }
    }

    // §1b: who got trimmed, and with what importance. Ascending importance —
    // the least important cut should be at the top of this list, and a
    // high-importance goal appearing here while a lower one held full length
    // that same day is the invariant violation to look for.
    if (shortenedLog.length > 0) {
        console.log(`[PlanWeek] "${label}" shortened blocks (ascending importance):`);
        for (const s of [...shortenedLog].sort((a, b) => a.importance - b.importance)) {
            // §2b: the two numbers that justify the trim, printed beside it.
            const isoDay = ((parseISO(s.date).getDay() + 6) % 7) + 1;
            const free = dayFreeBaseline.get(isoDay) || 0;
            const planned = finalBlocks
                .filter(b => b.date === s.date && b.block_type === 'goal')
                .reduce((sum, b) => sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
            const verdict = free >= planned ? '  ⚠ GATE WAS CLOSED — this trim should not have happened' : '';
            console.log(
                `   ${s.goal.padEnd(22)} imp=${s.importance} ${s.date} wanted=${s.wanted}m got=${s.got}m ` +
                `(day free=${free}m planned=${planned}m)${verdict}`
            );
        }
    }

    // §2b: the gate table. Free minutes vs the minutes actually planned, per
    // day, with the verdict. A shortened block on a CLOSED day is a bug, and
    // this table is what makes that obvious on sight.
    // NEEDED, not planned. Reporting what actually landed made this
    // self-fulfilling: when blocks were dropped, `planned` shrank and every
    // day read CLOSED, hiding the very over-subscription the gate exists to
    // detect. `needed` is what the day was ASKED to hold — placed minutes plus
    // whatever that day's goals still owe.
    for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
        const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
        const free = dayFreeBaseline.get(isoDay) || 0;
        const placedHere = finalBlocks
            .filter(b => b.date === dateStr && b.block_type === 'goal')
            .reduce((s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
        // What this day still owes: for each goal with a block here, the gap
        // between the session it wanted and the one it got.
        const owedHere = planningGoals.reduce((sum, g) => {
            const here = finalBlocks.filter(b => b.date === dateStr && b.goal_id === g.id);
            if (here.length === 0) return sum;
            const got = here.reduce((s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
            return sum + Math.max(0, (g.minutes_per_day || 60) - got);
        }, 0);
        const needed = placedHere + owedHere;
        const open = free < needed;
        console.log(
            `[PlanWeek] gate ${dateStr}: free=${free} needed=${needed} → ${open ? 'OPEN' : 'CLOSED'}` +
            ` (placed=${placedHere}, still owed=${owedHere})`
        );
    }

    // §4: per-day free time, printed alongside the per-goal lines. If a goal
    // comes out SHORT or (Shortened) while hours sit free, that pairing makes
    // it obvious on sight instead of requiring a separate investigation.
    console.log(`[PlanWeek] "${label}" free time per day (after bio blocks, anchors and everything placed):`);
    let weekFreeMins = 0;
    for (const isoDay of [1, 2, 3, 4, 5, 6, 7]) {
        const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
        const bounds = swapDayBounds.get(dateStr);
        if (!bounds) { console.log(`   ${dateStr}  (not scheduled — weekends off)`); continue; }
        const gaps = freeIntervalsOn(finalBlocks as TimedBlock[], dateStr, bounds.lower, bounds.upper);
        const freeMins = gaps.reduce((s, g) => s + (g.end - g.start), 0);
        weekFreeMins += freeMins;
        const notable = gaps.filter(g => (g.end - g.start) >= 30)
            .map(g => `${minutesToTime(g.start)}–${minutesToTime(g.end)}(${g.end - g.start}m)`);
        console.log(`   ${dateStr}  ${String(freeMins).padStart(4)}min free   ${notable.join('  ')}`);
    }
    console.log(`   → ${Math.round(weekFreeMins / 60 * 10) / 10}h free across the week`);

    if (shortenedLog.length > 0 && weekFreeMins > 0) {
        console.warn(
            `[PlanWeek] "${label}" shortened ${shortenedLog.length} block(s) while ` +
            `${Math.round(weekFreeMins / 60 * 10) / 10}h remained free this week — ` +
            `if any of that free time is contiguous enough to hold the block whole, this is a placement bug.`
        );
    }

    // §2: a body block placed closer to wind-down than BODY_WIND_DOWN_GAP_MINS
    // is a recorded exception, never a silent outcome.
    for (const r of bodyGapRelaxations) {
        console.warn(
            `[PlanWeek] BODY WIND-DOWN GAP RELAXED: "${r.goal}" on ${r.date} — ` +
            `achieved ${r.achievedGapMins}min gap (rule is ${BODY_WIND_DOWN_GAP_MINS}min, ` +
            `floor is ${BODY_WIND_DOWN_GAP_RELAXED_MINS}min). Placed on the final pass to avoid going unplaced.`
        );
    }

    // §4: recovery is a decision about what matters this week, so the plan
    // should say so before the user applies it rather than quietly returning a
    // thinner calendar.
    const recoveryNote = recoveryTriage
        ? (() => {
            const full = recoveryTriage.goals.filter(g => g.band === 'high').map(g => g.title.trim());
            const half = recoveryTriage.goals.filter(g => g.band === 'medium').map(g => g.title.trim());
            const def = recoveryTriage.deferred.map(g => g.title.trim());
            return [
                full.length ? `Full: ${full.join(', ')}.` : '',
                half.length ? `Half: ${half.join(', ')}.` : '',
                def.length ? `Deferred: ${def.join(', ')}.` : '',
            ].filter(Boolean).join(' ');
        })()
        : '';

    return {
        id: `${strategyId}-${slugify(label)}`,
        label,
        description: recoveryNote ? `${description} ${recoveryNote}` : description,
        philosophy,
        blocks: finalBlocks,
        stats: {
            total_blocks: finalBlocks.length,
            total_hours: Math.round(totalMins / 60 * 10) / 10,
            days_with_work: uniqueDays.size,
            unscheduled_minutes,
            // §4: populated from the TRIAGED goal list, so a medium goal placed
            // at its halved target reads as MET rather than SHORT. This was
            // declared but never filled in, which is why goal_shortfalls has
            // always come back empty.
            goal_placements: planningGoals.map(g => {
                const target = Math.max(0, computeRemainingWeeklyMins(g, ctx, replanFromDate));
                const mine = finalBlocks.filter(b => b.goal_id === g.id);
                const placed = mine.reduce(
                    (s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0
                );
                return {
                    goal_id: g.id,
                    title: g.title,
                    target_mins: target,
                    placed_mins: placed,
                    blocks: mine.length,
                    days_used: new Set(mine.map(b => b.date)).size,
                    days_allowed: Math.min(7, Math.max(1, g.days_per_week || 5)),
                    already_met: target <= 0,
                    skipped_reason: placed >= target ? undefined : topReason(g.id),
                };
            }),
            deferred_goals: (recoveryTriage?.deferred || []).map(d => ({
                goal_id: d.id,
                title: d.title,
                reason: 'low importance — deferred for recovery week',
            })),
        }
    };
}
