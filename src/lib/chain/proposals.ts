/**
 * Deterministic goal recalibration.
 *
 * No AI is involved here, and none may be.
 *
 * The governing principle, and the one thing to keep intact if this file is
 * ever rewritten again: **the hours the user chose are the commitment; the
 * schedule is the variable.** Weekly Review's job is to find a shape that fits
 * the hours, not to shrink the hours to fit the shape.
 *
 * Every lever here used to reduce the target — days were cut to match
 * attendance, minutes were cut to match session length — so a user who wanted
 * twenty hours and managed eighteen was told to want less. That ratchets
 * downward permanently: each shortfall lowers the target, which makes the next
 * shortfall easier to hit, which lowers it again.
 *
 * So the default is now `redistribute`: same weekly total, different shape.
 * `reduce` survives, but only behind hard evidence that the week genuinely
 * cannot hold the hours — see `planReductions` below.
 */

import type { WeekCapacity } from '@/lib/scheduling/capacity';

/**
 * There is exactly one thing a proposal can be: the same hours, arranged
 * differently.
 *
 * `reduce`, `increase` and an applied `pause` are gone. A goal's weekly hours
 * are non-negotiable — the review changes WHEN and HOW they are scheduled and
 * nothing else. A conditional reduction is a rule someone has to keep getting
 * right, and it went wrong three times in different ways; the last time it
 * offered to cut Sports by 92% and PlannrAI by 62% in a week that had 21.5
 * spare hours, because it read a packing failure as a capacity verdict.
 */
export type ChangeType = 'reshape';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * Why this goal, and not another. Every proposal carries it, and a proposal
 * that cannot produce it is not emitted.
 *
 * The review once offered "Stocks 30m/day → 35m/day" in a week whose own
 * summary reported hours skipped. Offering to raise a target in a week the user
 * fell short of is incoherent, and it is what "some random change" means.
 */
export interface ChangeEvidence {
    /** Shortfall against this goal's own weekly target. */
    missed_minutes: number;
    /** The specific dates this goal had a block it did not finish. */
    missed_dates: string[];
    completed_minutes: number;
    target_minutes: number;
}

export interface ProposedChange {
    goal_id: string;
    title: string;
    change_type: ChangeType;
    old_value: string;
    new_value: string;
    /** Short label carrying the principle. Rendered verbatim by the UI. */
    headline: string;
    new_minutes_per_day?: number;
    new_days_per_week?: number;
    /** Per-day minutes; sums to `new_weekly_minutes` exactly. */
    new_day_minutes?: number[];
    new_time_of_day?: TimeOfDay;
    /** Weekly minutes before and after. Identical for everything but reduce. */
    old_weekly_minutes?: number;
    new_weekly_minutes?: number;
    rationale: string;
    evidence: ChangeEvidence;
}

export interface TimeOfDayBucket {
    total: number;
    complete: number;
}

export interface GoalUsage {
    title: string;
    /** minutes_per_day × days_per_week */
    weeklyTarget: number;
    /** completed minutes this week */
    completed: number;
    minutesPerDay: number;
    daysPerWeek: number;
    /** distinct dates with at least one completed block */
    activeDays: number;
    /** eligible blocks for this goal this week */
    eligibleBlocks: number;
    /** eligible blocks that were completed */
    completedBlocks: number;
    /** ISO date the goal was created */
    createdAt?: string | null;
    /** 'low' | 'medium' | 'high', or a raw number. Drives reduction order. */
    importance?: string | number | null;
    /** Dates this goal had a block it did not finish. Drives §4's evidence. */
    missedDates?: string[];
    /** Where the goal currently asks to be scheduled, if anywhere. */
    preferredTimeOfDay?: TimeOfDay | null;
    /** Completion split by when the block was scheduled. Drives Lever 3. */
    timeOfDay?: Record<TimeOfDay, TimeOfDayBucket>;
}

export interface BuildProposalsOptions {
    /**
     * §1: the dry run no longer AUTHORISES anything — there is nothing left for
     * it to authorise. It survives only as reporting: what the scheduler could
     * not place becomes a notice (§4), never a proposal to cut.
     */
    dryRun?: { ok: boolean; unscheduledByGoal: Record<string, number> } | null;
    /** Read for the split lever only: do not add days to an overfull week. */
    capacity?: WeekCapacity | null;
    /**
     * Prompt 29 §3: minutes the user planned and did not do, across the whole
     * week. Above MISSED_FLOOR_MINS the review must offer something to act on
     * even when no single goal tripped a per-goal threshold.
     */
    totalMissedMins?: number;
}

/** More than an hour missing across the week is worth offering help for. */
export const MISSED_FLOOR_MINS = 60;
/** Beyond three the panel stops being readable. */
export const MAX_FORCED_PROPOSALS = 3;

/** A goal must have existed this long before we suggest pausing it. */
const PAUSE_AGE_DAYS = 14;

/**
 * A shortfall is worth surfacing at 5% relative OR 30 minutes absolute,
 * whichever fires first. Two hours short of twenty is worth showing; five
 * minutes short is not.
 */
const RELATIVE_TRIGGER = 0.95;
const ABSOLUTE_SHORTFALL_MINS = 30;


/**
 * Below 20 minutes the generator's own `minBlockFloor` (plan-week.ts:1075)
 * starts rejecting placements, so a split into 15-minute sessions would
 * schedule WORSE than the shape it replaced.
 */
export const MIN_SHAPE_MINUTES = 20;
/** Mirrors the execute route's clamp. A shape above it would be silently altered. */
export const MAX_SHAPE_MINUTES = 480;


/** Time-of-day evidence thresholds for Lever 3. */
const MIN_BUCKET_BLOCKS = 3;
const MIN_RATE_GAP_POINTS = 25;

const TIME_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
const WINDOW_LABEL: Record<TimeOfDay, string> = {
    morning: 'Mornings',
    afternoon: 'Afternoons',
    evening: 'Evenings',
};

/** "5h", "1h 30m", "45m" */
export function formatMinutes(mins: number): string {
    const m = Math.max(0, Math.round(mins));
    if (m === 0) return '0m';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem}m`;
    if (rem === 0) return `${h}h`;
    return `${h}h ${rem}m`;
}

const describe = (minsPerDay: number, days: number) =>
    `${Math.round(minsPerDay)}m/day × ${days} ${days === 1 ? 'day' : 'days'}`;


const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wed and Fri", "Mon, Wed and Fri". */
export function nameDays(dates: string[]): string {
    const names = dates.map((d) => WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The evidence behind a proposal. `missed_minutes` is the goal's own shortfall. */
export function evidenceFor(g: GoalUsage): ChangeEvidence {
    return {
        missed_minutes: Math.max(0, Math.round(g.weeklyTarget - g.completed)),
        missed_dates: g.missedDates || [],
        completed_minutes: Math.round(g.completed),
        target_minutes: Math.round(g.weeklyTarget),
    };
}

/** Whole days between two ISO dates. */
function daysBetween(fromIso: string, toIso: string): number {
    const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.floor((b - a) / 86400000);
}

export interface Shape {
    days: number;
    /** Minutes for each day. Sums to the weekly target EXACTLY. */
    minutes: number[];
}

/**
 * A weekly total expressed as `days` sessions — preserving the total exactly.
 *
 * §2: `newMinutesPerDay × newDays` must EQUAL `oldMinutesPerDay × oldDays`. Not
 * approximately. Rounding every day down to the 5-minute grid is what turned
 * Gym's 480 minutes into 475 (`95m × 5`, where `96m × 5` was available), so the
 * remainder is distributed across days by largest remainder instead — the same
 * approach `planDayShape` uses. 250 minutes over 4 days is 65/65/60/60, never
 * 60 × 4.
 *
 * Returns null when no legal shape preserves the total; the caller then tries
 * the next shape rather than proposing something smaller.
 */
export function makeShape(weeklyTarget: number, days: number): Shape | null {
    const d = Math.round(days);
    if (!Number.isFinite(d) || d < 1 || d > 7) return null;
    if (!Number.isFinite(weeklyTarget) || weeklyTarget <= 0) return null;

    // An EVEN exact division wins outright — 480 over 5 days is 96 a day, and
    // forcing that onto the 5-minute grid would give 100/95/95/95/95, which is
    // exact but needlessly lopsided. Only when the division is not clean does
    // the grid come into play, and then the remainder is distributed by largest
    // remainder rather than rounded away: 250 over 4 days is 65/65/60/60.
    const even = weeklyTarget / d;
    const units = Number.isInteger(even) ? 1 : weeklyTarget % 5 === 0 ? 5 : 1;
    const totalUnits = weeklyTarget / units;
    if (totalUnits < d) return null; // cannot give every day a share

    const base = Math.floor(totalUnits / d);
    let extra = totalUnits - base * d;
    const minutes: number[] = [];
    for (let i = 0; i < d; i++) {
        minutes.push((base + (extra > 0 ? 1 : 0)) * units);
        if (extra > 0) extra--;
    }

    const total = minutes.reduce((a, b) => a + b, 0);
    if (total !== weeklyTarget) return null;                    // never approximate
    if (minutes.some((m) => m < MIN_SHAPE_MINUTES)) return null;
    if (minutes.some((m) => m > MAX_SHAPE_MINUTES)) return null;
    return { days: d, minutes };
}

/** How a shape reads on a card: "96m/day × 5 days", or "65–60m/day × 4 days". */
export function describeShape(shape: Shape): string {
    const lo = Math.min(...shape.minutes);
    const hi = Math.max(...shape.minutes);
    const size = lo === hi ? `${hi}m/day` : `${hi}–${lo}m/day`;
    return `${size} × ${shape.days} ${shape.days === 1 ? 'day' : 'days'}`;
}

/**
 * The one thing a proposal can be: the same weekly hours, arranged differently.
 *
 * Three ways to rearrange, in fall-through order — consolidate into fewer,
 * longer days; split into more, shorter ones; or move to a better time of day.
 * Every one preserves the weekly total EXACTLY, because `makeShape` returns null
 * rather than anything that does not.
 */
export function buildReshape(
    goalId: string,
    g: GoalUsage,
    capacity?: WeekCapacity | null
): ProposedChange | null {
    const targetLabel = formatMinutes(g.weeklyTarget);
    const actualLabel = formatMinutes(g.completed);
    const oldValue = describe(g.minutesPerDay, g.daysPerWeek);
    const evidence = evidenceFor(g);
    const missedDayNames = nameDays(evidence.missed_dates);
    const missedClause = missedDayNames ? ` You lost time on ${missedDayNames}.` : '';

    const asChange = (shape: Shape, rationale: string): ProposedChange => ({
        goal_id: goalId,
        title: g.title,
        change_type: 'reshape',
        old_value: oldValue,
        new_value: describeShape(shape),
        headline: `Same ${targetLabel}, better shape`,
        new_minutes_per_day: Math.max(...shape.minutes),
        new_days_per_week: shape.days,
        new_day_minutes: shape.minutes,
        old_weekly_minutes: g.weeklyTarget,
        new_weekly_minutes: shape.minutes.reduce((a, b) => a + b, 0),
        rationale,
        evidence,
    });

    // Consolidate: they missed whole days but finished what they started.
    const consolidate = (): ProposedChange | null => {
        if (g.activeDays < 1 || g.activeDays >= g.daysPerWeek) return null;
        for (let days = g.activeDays; days < g.daysPerWeek; days++) {
            const shape = makeShape(g.weeklyTarget, days);
            if (!shape) continue;
            return asChange(
                shape,
                `You hit ${g.activeDays} of ${plural(g.daysPerWeek, 'day')} and completed ${actualLabel}.${missedClause} ` +
                    `Keeping the full ${targetLabel}, spread over ${plural(shape.days, 'day')} instead — same hours, fewer and longer sessions.`
            );
        }
        return null;
    };

    // Split: they showed up every planned day but the sessions ran short.
    const split = (): ProposedChange | null => {
        if (g.activeDays < g.daysPerWeek) return null;
        if (capacity?.isOvercommitted) return null; // adding days to an overfull week is wrong
        const days = Math.min(7, g.daysPerWeek + 1);
        if (days === g.daysPerWeek) return null;
        const shape = makeShape(g.weeklyTarget, days);
        if (!shape) return null;
        const avgSession = g.activeDays > 0 ? Math.round(g.completed / g.activeDays) : 0;
        return asChange(
            shape,
            `You showed up all ${plural(g.daysPerWeek, 'day')} but averaged ${avgSession} of ${Math.round(g.minutesPerDay)} minutes a session.${missedClause} ` +
                `Keeping the full ${targetLabel} across ${plural(shape.days, 'day')} instead — shorter sessions you finish beat long ones you don't.`
        );
    };

    // Move: the shape is fine, the placement is wrong. Nothing about the hours
    // changes at all.
    const shiftWindow = (): ProposedChange | null => {
        const tod = g.timeOfDay;
        if (!tod) return null;
        const rated = TIME_OF_DAY.map((slot) => ({
            slot,
            total: tod[slot]?.total || 0,
            rate: tod[slot]?.total ? Math.round((tod[slot].complete / tod[slot].total) * 100) : 0,
        })).filter((r) => r.total >= MIN_BUCKET_BLOCKS);
        if (rated.length < 2) return null;
        const best = [...rated].sort((a, b) => b.rate - a.rate || b.total - a.total)[0];
        const worst = [...rated].sort((a, b) => a.rate - b.rate || b.total - a.total)[0];
        if (best.slot === worst.slot) return null;
        if (best.rate - worst.rate < MIN_RATE_GAP_POINTS) return null;
        if (g.preferredTimeOfDay === best.slot) return null;

        return {
            goal_id: goalId,
            title: g.title,
            change_type: 'reshape',
            old_value: g.preferredTimeOfDay
                ? WINDOW_LABEL[g.preferredTimeOfDay]
                : `${WINDOW_LABEL[worst.slot]} (${worst.rate}% done)`,
            new_value: `${WINDOW_LABEL[best.slot]} (${best.rate}% done)`,
            headline: `Same ${targetLabel}, better time of day`,
            new_time_of_day: best.slot,
            // Untouched, and stated explicitly so the §3 guard can see it.
            old_weekly_minutes: g.weeklyTarget,
            new_weekly_minutes: g.weeklyTarget,
            rationale:
                `You finish ${best.rate}% of these blocks in the ${best.slot} and ${worst.rate}% in the ${worst.slot}.${missedClause} ` +
                `Same ${targetLabel}, same ${plural(g.daysPerWeek, 'day')} — just moved to when you actually finish them.`,
            evidence,
        };
    };

    return consolidate() ?? split() ?? shiftWindow();
}

/**
 * One proposal per goal at most, first matching rule wins.
 * `delete` is never proposed — a weekly review must not be able to destroy a
 * goal the user never saw suggested.
 */
export function buildProposals(
    usage: Record<string, GoalUsage>,
    today: string,
    options: BuildProposalsOptions = {}
): ProposedChange[] {
    const { capacity = null, totalMissedMins = 0 } = options;
    const proposals: ProposedChange[] = [];

    for (const [goalId, g] of Object.entries(usage)) {
        // A goal with no target can't be measured against one.
        if (!g.weeklyTarget || g.weeklyTarget <= 0) continue;

        // §1: a goal untouched for two weeks is worth MENTIONING, never
        // pausing. Pausing is a 100% reduction, and the review does not reduce.
        // `untouchedGoals` carries it to the prose; nothing here acts on it.

        const ratio = g.completed / g.weeklyTarget;
        const shortfall = g.weeklyTarget - g.completed;
        const isShort = shortfall > 0 && (ratio < RELATIVE_TRIGGER || shortfall >= ABSOLUTE_SHORTFALL_MINS);
        if (!isShort) continue;

        const change = buildReshape(goalId, g, capacity);
        if (change) proposals.push(change);
    }

    // §3 of Prompt 29, narrowed by §4 of Prompt 32 and unchanged here: more
    // than an hour missing across the week forces us to LOOK for a proposal,
    // never to fabricate one.
    if (proposals.length === 0 && totalMissedMins > MISSED_FLOOR_MINS) {
        const byMissedDesc = Object.entries(usage)
            .filter(([, g]) => g.weeklyTarget > 0)
            .map(([goalId, g]) => ({ goalId, g, missed: Math.max(0, g.weeklyTarget - g.completed) }))
            .filter((x) => x.missed > 0)
            .sort((a, b) => b.missed - a.missed);

        for (const { goalId, g } of byMissedDesc) {
            if (proposals.length >= MAX_FORCED_PROPOSALS) break;
            const change = buildReshape(goalId, g, capacity);
            if (change) proposals.push(change);
        }
    }

    return vetProposals(proposals);
}

/**
 * §3: the hard invariant, at the boundary.
 *
 * Deliberately here — where proposals LEAVE the module — rather than inside any
 * individual rule, so no future proposal type can route around it. A proposal
 * that would reduce a goal's weekly minutes is a bug, not a suggestion: it is
 * dropped and logged at error level.
 *
 * This has been asked for three times and come back three times. It is now a
 * line of code rather than a rule someone has to remember.
 */
export function vetProposals(proposals: ProposedChange[]): ProposedChange[] {
    const kept: ProposedChange[] = [];
    for (const p of proposals) {
        const before = p.old_weekly_minutes;
        const after = p.new_weekly_minutes;

        if (typeof before !== 'number' || typeof after !== 'number') {
            console.error(
                `[Proposals] DROPPED "${p.title}" (${p.change_type}) — no weekly totals to check. ` +
                    `Every proposal must state what it does to the hours.`
            );
            continue;
        }
        if (after < before) {
            console.error(
                `[Proposals] INVARIANT VIOLATED — dropped "${p.title}" (${p.change_type}): ` +
                    `${before}m/week → ${after}m/week. The weekly review may never reduce a goal's hours.`
            );
            continue;
        }
        // A per-day breakdown must agree with the total it claims.
        if (p.new_day_minutes) {
            const sum = p.new_day_minutes.reduce((a, b) => a + b, 0);
            if (sum !== after) {
                console.error(
                    `[Proposals] DROPPED "${p.title}" — per-day minutes sum to ${sum}m but the ` +
                        `proposal claims ${after}m.`
                );
                continue;
            }
        }
        // §4: a reshape must point at a day the user actually missed.
        if (p.evidence.missed_minutes > 0 && p.evidence.missed_dates.length > 0) {
            kept.push(p);
            continue;
        }
        console.warn(
            `[Proposals] Dropping ${p.change_type} for "${p.title}" — ` +
                `${p.evidence.missed_minutes}m short but no day where a block went unfinished.`
        );
    }
    return kept;
}

/**
 * §1: goals worth MENTIONING in the prose, never acting on.
 *
 * "You haven't touched Sports in two weeks; you can pause it on the Goals page"
 * is useful. Pausing it for them is a 100% cut, which the review does not make.
 */
export function untouchedGoals(
    usage: Record<string, GoalUsage>,
    today: string
): Array<{ goal_id: string; title: string; weekly_minutes: number }> {
    const out: Array<{ goal_id: string; title: string; weekly_minutes: number }> = [];
    for (const [goalId, g] of Object.entries(usage)) {
        if (!g.weeklyTarget || g.completed > 0) continue;
        const oldEnough = g.createdAt ? daysBetween(g.createdAt, today) >= PAUSE_AGE_DAYS : false;
        if (oldEnough) out.push({ goal_id: goalId, title: g.title, weekly_minutes: g.weeklyTarget });
    }
    return out;
}
