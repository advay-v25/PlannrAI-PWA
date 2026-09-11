import type { SupabaseClient } from '@supabase/supabase-js';
import { startOfWeek, endOfWeek, format, subWeeks } from 'date-fns';
import {
    isEligible,
    isComplete,
    isCompleteDay,
    groupByDate,
    shiftDate,
    recomputeChain,
    PILLARS,
    type BlockLike,
    type Pillar,
} from './chain-service';
import { computeWindows, archetypeFor, pct, DAY_NAMES } from './productivity';
import { dayCompletion, isPending, scoredBlocks, type DayCompletion } from './completion';
import { buildProposals, untouchedGoals, type GoalUsage, type ProposedChange, type TimeOfDay } from './proposals';
import { dryRunWeek, nextMondayAfter, type DryRunResult } from '@/lib/scheduling/dry-run';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';

/**
 * Deterministic weekly-review statistics.
 *
 * Everything here is pure Postgres arithmetic. There is no AI call anywhere in
 * this module and there must never be one: a provider outage has to leave the
 * dashboard and the chain fully intact.
 */

const COMMITTED_TYPES = new Set(['anchor', 'meal', 'routine']);

export const timeToMinutes = (t?: string | null): number => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

export const durationMinutes = (b: BlockLike): number => {
    let d = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
    if (d < 0) d += 24 * 60; // block wraps midnight
    return Math.max(0, d);
};

/** Half-open minute interval within a single day. */
type Interval = { start: number; end: number };

/**
 * Merge overlapping/touching intervals. Without this, double-booked time is
 * subtracted twice and Recovery comes out too low.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: Interval[] = [{ ...sorted[0] }];
    for (const iv of sorted.slice(1)) {
        const last = merged[merged.length - 1];
        if (iv.start <= last.end) last.end = Math.max(last.end, iv.end);
        else merged.push({ ...iv });
    }
    return merged;
}

/**
 * The waking part(s) of a day, as minute intervals.
 *
 * Sleep frequently crosses midnight (e.g. sleep_start 00:30, sleep_end 09:00),
 * in which case the waking window is NOT a single range — it is 00:00..00:30
 * plus 09:00..24:00. Treating it as `bed - wake` yields a negative length and
 * silently zeroes Recovery.
 */
export function wakingIntervals(wakeMins: number, bedMins: number): Interval[] {
    if (bedMins > wakeMins) return [{ start: wakeMins, end: bedMins }];
    return [
        { start: 0, end: bedMins },
        { start: wakeMins, end: 24 * 60 },
    ].filter((iv) => iv.end > iv.start);
}

/**
 * Waking minutes on one day in which NO block of any kind exists.
 *
 * Recovery used to be "waking hours minus committed minus invested", which
 * silently counted meals, anchors, routine and wind-down as recovery. They are
 * scheduled time. Recovery is the empty calendar that is left over.
 */
export function recoveryMinutesForDay(
    blocks: BlockLike[],
    wakeMins: number,
    bedMins: number
): number {
    const waking = wakingIntervals(wakeMins, bedMins);
    const wakingLength = waking.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    if (wakingLength === 0) return 0;

    // Every block counts here, whatever its type — this is about whether the
    // calendar is empty, not about whether anything was completed.
    const busy: Interval[] = [];
    for (const b of blocks) {
        const start = timeToMinutes(b.start_time);
        let end = timeToMinutes(b.end_time);
        if (end <= start) end = 24 * 60; // wraps midnight: clip to end of day
        if (end > start) busy.push({ start, end });
    }
    const mergedBusy = mergeIntervals(busy);

    // Occupied time counted only where it actually overlaps a waking window.
    let occupied = 0;
    for (const w of waking) {
        for (const b of mergedBusy) {
            const lo = Math.max(w.start, b.start);
            const hi = Math.min(w.end, b.end);
            if (hi > lo) occupied += hi - lo;
        }
    }

    const recovery = wakingLength - occupied;
    if (recovery < 0) {
        // Only reachable if merging failed; clamp rather than report nonsense.
        console.warn(`[week-stats] Negative recovery (${recovery}m) — intervals were not merged correctly`);
        return 0;
    }
    return recovery;
}

/** The previous Mon–Sun — the week `generate-report` has always defaulted to. */
export function defaultWeek(): { weekStart: string; weekEnd: string } {
    const lastWeekStart = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
    return {
        weekStart: format(lastWeekStart, 'yyyy-MM-dd'),
        weekEnd: format(endOfWeek(lastWeekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
}

export { isPending } from './completion';

export interface WeekMetrics {
    plannedMinutes: number;
    completedMinutes: number;
    skippedMinutes: number;
    goalStats: Record<
        string,
        {
            title: string;
            planned: number;
            completed: number;
            skipped: number;
            importance: string;
            weeklyTarget: number;
            minutesPerDay: number;
            daysPerWeek: number;
            /** distinct dates with at least one completed block */
            activeDays: number;
            eligibleBlocks: number;
            completedBlocks: number;
            /** Dates where this goal had a block it did not finish. */
            missedDates: string[];
            createdAt?: string | null;
        }
    >;
}

/**
 * What the scheduler said when asked to place next week — the evidence behind
 * any `reduce` proposal, surfaced so the page and any diagnostic can see it
 * rather than having to infer it from the proposals themselves.
 */
export interface SchedulingEvidence {
    /** The Monday the dry run planned. */
    week_start: string;
    /** False means the dry run failed — no reduction may be proposed. */
    dry_run_ok: boolean;
    dry_run_ms: number;
    /** Minutes the generator could not place, after every relaxation pass. */
    unplaceable_minutes: number;
    available_hours: number | null;
    targeted_hours: number | null;
    headroom_hours: number | null;
    is_overcommitted: boolean;
}

export interface WeekStats {
    weekStart: string;
    weekEnd: string;
    metrics: WeekMetrics;
    profile: any;
    chain: any;
    /** Computed here, never by the AI — see src/lib/chain/proposals.ts */
    proposed_goal_changes: ProposedChange[];
    scheduling: SchedulingEvidence;
    /** Minutes planned and not done. Drives the §3 floor and the copy. */
    total_missed_minutes: number;
    /**
     * §4: hours the scheduler could not place. INFORMATION, not proposals —
     * they are not selectable and nothing applies them. The two remedies are
     * the user's: edit the goal on the Goals page, or free up time.
     */
    unplaceable_notices: Array<{ goal_id: string; title: string; minutes: number; of_minutes: number }>;
    /** §1: goals worth mentioning in the prose. The review never pauses them. */
    untouched_goals: Array<{ goal_id: string; title: string; weekly_minutes: number }>;
    /** Facts about the week. Rendered whether or not the AI responds. */
    wins: string[];
}

/** A well-formed, all-zero payload. Returned instead of ever throwing a 500. */
export function emptyWeekStats(weekStart: string, weekEnd: string): WeekStats {
    return {
        weekStart,
        weekEnd,
        metrics: { plannedMinutes: 0, completedMinutes: 0, skippedMinutes: 0, goalStats: {} },
        profile: {
            archetype: 'Still Learning',
            description: 'Not enough marked data yet to read your productivity profile.',
            peak_window: null,
            low_window: null,
            day_patterns: DAY_NAMES.map((day) => ({ day, rate: null, blocks: 0, is_future: false })),
            pillar_insights: PILLARS.map((pillar) => ({ pillar, completion_rate: null })),
            overall_completion_rate: 0,
            data_points: 0,
            week_start: weekStart,
            week_end: weekEnd,
        },
        chain: {
            days: Array.from({ length: 7 }, (_, i) => ({
                date: shiftDate(weekStart, i),
                completion: 0,
                total: 0,
                complete: 0,
                is_future: false,
            })),
            streak: 0,
            longest: 0,
            state: 'ENDED' as const,
            enters_left: false,
            exits_right: false,
            hours: { committed: 0, invested: 0, recovery: 0 },
            week_start: weekStart,
            week_end: weekEnd,
        },
        proposed_goal_changes: [],
        scheduling: {
            week_start: weekStart,
            dry_run_ok: false,
            dry_run_ms: 0,
            unplaceable_minutes: 0,
            available_hours: null,
            targeted_hours: null,
            headroom_hours: null,
            is_overcommitted: false,
        },
        total_missed_minutes: 0,
        unplaceable_notices: [],
        untouched_goals: [],
        wins: [],
    };
}

/**
 * Minute totals for the week — the numbers the AI narrative is written from.
 * Exported separately so `generate-report` can build its prompt without the
 * client having to send stats to it (which would chain the two requests).
 */
export function computeMetrics(blocks: BlockLike[], goals: any[], today: string): WeekMetrics {
    const goalStats: WeekMetrics['goalStats'] = {};
    const completedDates: Record<string, Set<string>> = {};
    // §4: a proposal has to point at time the user actually missed, and name
    // the days. Without this the review could offer to change a goal that lost
    // nothing all week.
    const missedDates: Record<string, Set<string>> = {};

    for (const g of goals) {
        goalStats[g.id] = {
            title: g.title,
            planned: 0,
            completed: 0,
            skipped: 0,
            importance: g.importance || 'medium',
            weeklyTarget: (g.minutes_per_day || 0) * (g.days_per_week || 7),
            minutesPerDay: g.minutes_per_day || 0,
            daysPerWeek: g.days_per_week || 7,
            activeDays: 0,
            eligibleBlocks: 0,
            completedBlocks: 0,
            missedDates: [],
            createdAt: g.created_at ?? null,
        };
        completedDates[g.id] = new Set();
        missedDates[g.id] = new Set();
    }

    let plannedMinutes = 0;
    let completedMinutes = 0;
    let skippedMinutes = 0;

    for (const b of blocks) {
        if (!isEligible(b)) continue;

        const duration = durationMinutes(b);
        plannedMinutes += duration;

        // Unmarked blocks on a past date read as missed; on today or later they
        // are simply pending and count towards neither total.
        const complete = isComplete(b);
        const missed = !complete && !isPending(b, today);

        if (complete) completedMinutes += duration;
        else if (missed) skippedMinutes += duration;

        const stats = b.goal_id ? goalStats[b.goal_id] : undefined;
        if (stats) {
            stats.planned += duration;
            stats.eligibleBlocks++;
            if (complete) {
                stats.completed += duration;
                stats.completedBlocks++;
                if (b.date) completedDates[b.goal_id!].add(b.date);
            } else if (missed) {
                stats.skipped += duration;
                if (b.date) missedDates[b.goal_id!].add(b.date);
            }
        }
    }

    for (const [goalId, dates] of Object.entries(completedDates)) {
        goalStats[goalId].activeDays = dates.size;
    }
    for (const [goalId, dates] of Object.entries(missedDates)) {
        goalStats[goalId].missedDates = [...dates].sort();
    }

    return { plannedMinutes, completedMinutes, skippedMinutes, goalStats };
}

/**
 * Which third of the day a block sits in, from its start time. These are the
 * same three labels `preferred_windows.time_of_day` accepts, so a proposal to
 * move a goal can be expressed directly as a goal field.
 */
export function timeOfDayBucket(startTime?: string | null): TimeOfDay | null {
    const h = parseInt((startTime || '').split(':')[0], 10);
    if (Number.isNaN(h) || h < 0 || h > 23) return null;
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
}

const emptyTimeOfDay = (): Record<TimeOfDay, { total: number; complete: number }> => ({
    morning: { total: 0, complete: 0 },
    afternoon: { total: 0, complete: 0 },
    evening: { total: 0, complete: 0 },
});

/**
 * Per-goal completion split by time of day, over the blocks the Productivity
 * Profile already scores. Lever 3 reads this: a goal completing at 70% in the
 * morning and 20% in the evening is badly placed, not badly sized.
 */
export function completionByTimeOfDay(
    scored: BlockLike[]
): Record<string, Record<TimeOfDay, { total: number; complete: number }>> {
    const out: Record<string, Record<TimeOfDay, { total: number; complete: number }>> = {};
    for (const b of scored) {
        if (!b.goal_id) continue;
        const slot = timeOfDayBucket(b.start_time);
        if (!slot) continue;
        const buckets = (out[b.goal_id] ||= emptyTimeOfDay());
        buckets[slot].total++;
        if (isComplete(b)) buckets[slot].complete++;
    }
    return out;
}

/**
 * The ONE goals query the weekly review uses.
 *
 * `/stats` and `/generate-report` each hand-wrote their own, over the same
 * table, for the same screen — and they diverged: `/generate-report` filtered
 * with `.eq('is_paused', false)`, which does NOT match NULL, so any goal
 * predating that column was invisible to the narrative while `/stats` counted
 * it. The totals would still look right (they accumulate from blocks) while
 * every per-goal `completed` silently read zero.
 *
 * Null-safe, per Prompt 27 §1: a goal counts unless it is explicitly paused.
 */
export const REVIEW_GOAL_FIELDS =
    'id, title, category, pillar, importance, minutes_per_day, days_per_week, is_paused, created_at, status, preferred_windows';

export async function fetchReviewGoals(
    supabase: SupabaseClient,
    userId: string
): Promise<{ all: any[]; active: any[] }> {
    const { data, error } = await supabase
        .from('goals')
        .select(REVIEW_GOAL_FIELDS)
        .eq('user_id', userId);
    if (error) throw error;
    const all = data || [];
    const active = all.filter((g: any) => g.is_paused !== true && g.status !== 'archived');
    return { all, active };
}

/**
 * Minutes the user planned this week and did not do.
 *
 * Per-goal shortfall and block-level skipped time overlap almost entirely, so
 * these are compared rather than summed — adding them would double-count the
 * same missing hour and inflate the number the copy quotes.
 */
export function totalMissedMinutes(m: WeekMetrics): number {
    const shortfall = Object.values(m.goalStats).reduce(
        (sum, g) => sum + Math.max(0, g.weeklyTarget - g.completed),
        0
    );
    return Math.round(Math.max(shortfall, m.skippedMinutes));
}

/**
 * Wins, computed from the data rather than written by a model.
 *
 * A win is a fact — this goal beat its target, this day was clean, this many
 * hours got done. Leaving them to the AI meant that when a provider was
 * rate-limited (or, as in Prompt 29 §2, when the model simply returned an empty
 * array) the entire Wins panel vanished, even though every fact needed to fill
 * it was already sitting in the stats payload.
 *
 * Struggles stay AI-only on purpose: a good struggle needs interpretation.
 */
export function deriveWins(
    metrics: WeekMetrics,
    dayStats: DayCompletion[],
    chain: { streak: number; longest: number }
): string[] {
    const wins: string[] = [];
    const h = (mins: number) => {
        const v = Math.round(mins);
        return v >= 60 ? `${(v / 60).toFixed(v % 60 === 0 ? 0 : 1)}h` : `${v}m`;
    };

    // 1. Goals that hit or beat their target.
    const hit = Object.values(metrics.goalStats)
        .filter((g) => g.weeklyTarget > 0 && g.completed >= g.weeklyTarget)
        .sort((a, b) => b.completed - a.completed);
    for (const g of hit.slice(0, 3)) {
        const over = g.completed - g.weeklyTarget;
        wins.push(
            over >= 15
                ? `${g.title}: ${h(g.completed)} against a ${h(g.weeklyTarget)} target — ${h(over)} over.`
                : `${g.title}: hit the full ${h(g.weeklyTarget)} target.`
        );
    }
    if (hit.length > 3) wins.push(`${hit.length - 3} more goals also hit their target.`);

    // 2. Total time actually done.
    if (metrics.completedMinutes > 0) {
        const rate =
            metrics.plannedMinutes > 0
                ? Math.round((metrics.completedMinutes / metrics.plannedMinutes) * 100)
                : 0;
        // "of what was on your calendar", not "of your targets" — a week can be
        // 100% complete on blocks and still fall short of the weekly targets.
        wins.push(`${h(metrics.completedMinutes)} completed — ${rate}% of what was on your calendar.`);
    }

    // 3. Clean days: every eligible block finished.
    const past = dayStats.filter((d) => !d.is_future && d.total > 0);
    const clean = past.filter((d) => d.complete === d.total);
    if (clean.length > 0) {
        wins.push(
            clean.length === past.length && past.length > 1
                ? `A clean sweep — every planned block finished on all ${past.length} days.`
                : `${clean.length} of ${past.length} ${past.length === 1 ? 'day' : 'days'} finished with nothing left undone.`
        );
    }

    // 4. Best day.
    const best = [...past].sort((a, b) => b.completion - a.completion || b.total - a.total)[0];
    if (best && best.completion > 0 && clean.length !== past.length) {
        wins.push(
            `Your strongest day was ${DAY_NAMES[dayStats.indexOf(best)]} — ${Math.round(best.completion * 100)}% of ${best.total} blocks done.`
        );
    }

    // 5. The chain.
    if (chain.streak > 1) {
        wins.push(`A ${chain.streak}-day chain is running${chain.streak >= chain.longest ? ' — your longest yet' : ''}.`);
    }

    return wins;
}

/** One-line fingerprint of a metrics computation, for cross-route comparison. */
export function describeMetrics(
    m: WeekMetrics,
    weekStart: string,
    goalsFetched: number,
    goalsCounted: number
): string {
    const h = (mins: number) => `${(mins / 60).toFixed(1)}h`;
    const perGoal = Object.values(m.goalStats)
        .map((g) => `${g.title}=${h(g.completed)}/${h(g.weeklyTarget)}`)
        .join(' ');
    return (
        `week=${weekStart} goals_fetched=${goalsFetched} goals_counted=${goalsCounted} ` +
        `planned=${h(m.plannedMinutes)} completed=${h(m.completedMinutes)} skipped=${h(m.skippedMinutes)} | ${perGoal}`
    );
}

/** The user's local date, used to decide what counts as "not yet due". */
export function todayFor(timezone?: string | null): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || DEFAULT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
}

/**
 * Everything the Weekly Review page needs, minus the AI paragraph.
 *
 * Callers are expected to wrap this in try/catch and fall back to
 * `emptyWeekStats` — a Supabase failure must degrade to an empty dashboard,
 * never to a dead page.
 */
export async function computeWeekStats(
    supabase: SupabaseClient,
    userId: string,
    weekStart: string,
    weekEnd: string
): Promise<WeekStats> {
    // Profile drives the timezone (for "today") and the waking-hours figure.
    let profileRow: any = null;
    try {
        const { data } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end, timezone')
            .eq('id', userId)
            .single();
        profileRow = data;
    } catch {
        profileRow = null;
    }

    const today = todayFor(profileRow?.timezone);

    // One block query covers the week plus a day either side (the chain's edge
    // behaviour), and one goals query covers the metrics.
    const [blocksRes, goalsRes] = await Promise.all([
        supabase
            .from('schedule_blocks')
            .select('id, date, start_time, end_time, status, block_type, pillar, goal_id, title')
            .eq('user_id', userId)
            .gte('date', shiftDate(weekStart, -1))
            .lte('date', shiftDate(weekEnd, 1))
            .order('date', { ascending: true }),
        fetchReviewGoals(supabase, userId),
    ]);

    if (blocksRes.error) throw blocksRes.error;

    const allBlocks: BlockLike[] = blocksRes.data || [];
    const goals = goalsRes.all;

    const weekBlocks = allBlocks.filter((b) => (b.date || '') >= weekStart && (b.date || '') <= weekEnd);

    // ── Metrics ───────────────────────────────────────────────────────
    const activeGoals = goalsRes.active;
    const metrics = computeMetrics(weekBlocks, activeGoals, today);
    const missedMins = totalMissedMinutes(metrics);

    // The chip on screen and the AI narrative are written from two different
    // computations of the same week. Fingerprint both so a disagreement is
    // visible in the log instead of only on the user's screen.
    console.log(
        `[WeeklyReview/Stats] ${describeMetrics(metrics, weekStart, goals.length, activeGoals.length)} missed=${missedMins}m`
    );

    // ── One shared per-day computation (§3) ───────────────────────────
    // Day Patterns and the Chain both read from `dayStats`. They used to derive
    // the same percentage independently, which is how a future day came to show
    // 100% in one place and a broken link in the other.
    const blocksByDate = groupByDate(weekBlocks);
    const dayStats: DayCompletion[] = Array.from({ length: 7 }, (_, i) => {
        const date = shiftDate(weekStart, i);
        return dayCompletion(date, blocksByDate.get(date) || [], today);
    });

    // ── Profile (Prompt 16 §3) ────────────────────────────────────────
    // Pending blocks leave the denominator so an in-progress week is not
    // reported as a failed one, and days that have not happened are excluded
    // from every aggregate — numerator and denominator alike.
    const scored = scoredBlocks(
        weekBlocks.filter((b) => (b.date || '') <= today),
        today
    );
    const dataPoints = scored.length;

    const empty = emptyWeekStats(weekStart, weekEnd);
    let profile = { ...empty.profile, data_points: dataPoints };

    if (dataPoints >= 5) {
        const { peak, low } = computeWindows(scored);
        const { archetype, description } = archetypeFor(peak);

        const goalPillar = new Map<string, string | null>(
            goals.map((g: any) => {
                // `category` predates the pillar rename: future === craft.
                const raw = g.pillar || g.category || null;
                return [g.id, raw === 'future' ? 'craft' : raw];
            })
        );

        const pillarBuckets: Record<Pillar, { total: number; complete: number }> = {
            mind: { total: 0, complete: 0 },
            body: { total: 0, complete: 0 },
            craft: { total: 0, complete: 0 },
        };

        for (const b of scored) {
            const resolved = b.pillar || (b.goal_id ? goalPillar.get(b.goal_id) : null);
            if (!resolved || !(PILLARS as readonly string[]).includes(resolved)) continue;
            const bucket = pillarBuckets[resolved as Pillar];
            bucket.total++;
            if (isComplete(b)) bucket.complete++;
        }

        profile = {
            archetype,
            description,
            peak_window: peak
                ? { start: peak.start, end: peak.end, completion_rate: peak.completion_rate }
                : null,
            low_window: low ? { start: low.start, end: low.end, completion_rate: low.completion_rate } : null,
            // Straight off dayStats — literally the same objects the Chain uses.
            day_patterns: DAY_NAMES.map((day, i) => ({
                day,
                date: dayStats[i].date,
                rate: dayStats[i].rate,
                blocks: dayStats[i].total,
                is_future: dayStats[i].is_future,
            })),
            pillar_insights: PILLARS.map((pillar) => ({
                pillar,
                completion_rate:
                    pillarBuckets[pillar].total > 0
                        ? pct(pillarBuckets[pillar].complete, pillarBuckets[pillar].total)
                        : null,
            })),
            overall_completion_rate: pct(scored.filter(isComplete).length, dataPoints),
            data_points: dataPoints,
            week_start: weekStart,
            week_end: weekEnd,
        };
    }

    // ── Chain (Prompt 16 §5) ──────────────────────────────────────────
    // The very same dayStats the Day Patterns above are built from.
    const byDate = groupByDate(allBlocks.filter((b) => isEligible(b) && !isPending(b, today)));
    const days = dayStats.map((d) => ({
        date: d.date,
        completion: d.completion,
        total: d.total,
        complete: d.complete,
        // A day that has not happened yet is not a link in the chain, however
        // much of it happens to be marked already. It neither extends nor
        // breaks the run.
        is_future: d.is_future,
    }));

    const chainState = await recomputeChain(supabase, userId, today);

    const entersLeft = isCompleteDay(byDate.get(shiftDate(weekStart, -1)) || []);
    const sundayComplete = !days[6].is_future && days[6].total > 0 && days[6].complete === days[6].total;

    // Descriptive hour figures. None of this touches the chain, which is driven
    // solely by block completion.
    //
    // These three deliberately do NOT sum to waking hours: wind-down, buffers
    // and any missed blocks fall outside all of them. That is intended — a
    // fourth reconciling bucket would be invented, not measured.
    let committedMins = 0;
    let investedMins = 0;
    for (const b of weekBlocks) {
        if ((b.date || '') > today) continue; // a future day contributes nothing
        if (!isComplete(b)) continue;
        if (COMMITTED_TYPES.has(b.block_type || '')) {
            // Committed does NOT use isEligible: that is now goal-only, so
            // anchors/meals/routine would always have summed to zero.
            committedMins += durationMinutes(b);
        } else if (isEligible(b)) {
            investedMins += durationMinutes(b);
        }
    }

    // Recovery = waking minutes with nothing scheduled at all, computed per day
    // over the merged union of EVERY block, whatever its type.
    const wakeMins = timeToMinutes(profileRow?.sleep_end || '07:00');
    const bedMins = timeToMinutes(profileRow?.sleep_start || '23:00');
    const blocksByDateAll = groupByDate(weekBlocks);
    let recoveryMins = 0;
    for (let i = 0; i < 7; i++) {
        const date = shiftDate(weekStart, i);
        if (date > today) continue; // a day that has not happened has no recovery yet
        recoveryMins += recoveryMinutesForDay(blocksByDateAll.get(date) || [], wakeMins, bedMins);
    }

    const committed = committedMins / 60;
    const invested = investedMins / 60;
    const recovery = recoveryMins / 60;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    // ── The scheduler, asked whether the week can hold the hours ──────
    //
    // This is the ONLY thing that licenses proposing a smaller target. It runs
    // exactly once per request (and is memoised per user+week), persists
    // nothing, and a failure is a well-formed "we don't know" rather than a
    // throw — see src/lib/scheduling/dry-run.ts.
    const planWeekStart = nextMondayAfter(today);
    let dry: DryRunResult;
    try {
        dry = await dryRunWeek(supabase, userId, planWeekStart);
    } catch (e: any) {
        console.error(`[WeeklyReview] Dry run threw: ${e?.message || e}`);
        dry = {
            ok: false,
            weekStart: planWeekStart,
            unscheduledByGoal: {},
            totalUnscheduledMins: 0,
            blocksPlanned: 0,
            capacity: null,
            ms: 0,
            error: e?.message,
        };
    }

    // ── Deterministic goal proposals (§1) ─────────────────────────────
    // These used to arrive inside the LLM response, which meant a provider
    // outage disabled the entire recalibration half of the review.
    const timeOfDayByGoal = completionByTimeOfDay(scored);
    const preferredWindowByGoal = new Map<string, TimeOfDay | null>(
        goals.map((g: any) => {
            const raw = (g.preferred_windows as any)?.time_of_day;
            const ok = raw === 'morning' || raw === 'afternoon' || raw === 'evening';
            return [g.id, ok ? (raw as TimeOfDay) : null];
        })
    );

    const usage: Record<string, GoalUsage> = {};
    for (const [goalId, gs] of Object.entries(metrics.goalStats)) {
        usage[goalId] = {
            title: gs.title,
            weeklyTarget: gs.weeklyTarget,
            completed: gs.completed,
            minutesPerDay: gs.minutesPerDay,
            daysPerWeek: gs.daysPerWeek,
            activeDays: gs.activeDays,
            eligibleBlocks: gs.eligibleBlocks,
            completedBlocks: gs.completedBlocks,
            createdAt: gs.createdAt,
            importance: gs.importance,
            missedDates: gs.missedDates,
            preferredTimeOfDay: preferredWindowByGoal.get(goalId) ?? null,
            timeOfDay: timeOfDayByGoal[goalId],
        };
    }
    const proposedGoalChanges = buildProposals(usage, today, {
        dryRun: dry.ok ? { ok: true, unscheduledByGoal: dry.unscheduledByGoal } : null,
        capacity: dry.capacity,
        totalMissedMins: missedMins,
    });

    const h1 = (m: number) => Math.round((m / 60) * 10) / 10;
    const scheduling: SchedulingEvidence = {
        week_start: planWeekStart,
        dry_run_ok: dry.ok,
        dry_run_ms: dry.ms,
        unplaceable_minutes: dry.totalUnscheduledMins,
        available_hours: dry.capacity ? h1(dry.capacity.availableMins) : null,
        targeted_hours: dry.capacity ? h1(dry.capacity.targetedMins) : null,
        headroom_hours: dry.capacity ? h1(dry.capacity.headroomMins) : null,
        is_overcommitted: dry.capacity?.isOvercommitted ?? false,
    };

    return {
        weekStart,
        weekEnd,
        metrics,
        profile,
        proposed_goal_changes: proposedGoalChanges,
        scheduling,
        total_missed_minutes: missedMins,
        // §4: reported, never acted on.
        unplaceable_notices: Object.entries(dry.unscheduledByGoal || {})
            .filter(([, m]) => Number(m) > 0)
            .map(([goalId, m]) => ({
                goal_id: goalId,
                title: metrics.goalStats[goalId]?.title || 'A goal',
                minutes: Math.round(Number(m)),
                of_minutes: metrics.goalStats[goalId]?.weeklyTarget || 0,
            })),
        untouched_goals: untouchedGoals(usage, today),
        wins: deriveWins(metrics, dayStats, {
            streak: chainState.current_streak,
            longest: chainState.longest_streak,
        }),
        chain: {
            days,
            streak: chainState.current_streak,
            longest: chainState.longest_streak,
            state: chainState.state,
            enters_left: entersLeft,
            exits_right: sundayComplete && chainState.state === 'RUNNING',
            hours: { committed: round1(committed), invested: round1(invested), recovery: round1(recovery) },
            week_start: weekStart,
            week_end: weekEnd,
        },
    };
}
