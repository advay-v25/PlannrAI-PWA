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
import { buildProposals, type GoalUsage, type ProposedChange } from './proposals';
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
            createdAt?: string | null;
        }
    >;
}

export interface WeekStats {
    weekStart: string;
    weekEnd: string;
    metrics: WeekMetrics;
    profile: any;
    chain: any;
    /** Computed here, never by the AI — see src/lib/chain/proposals.ts */
    proposed_goal_changes: ProposedChange[];
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
            createdAt: g.created_at ?? null,
        };
        completedDates[g.id] = new Set();
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
            }
        }
    }

    for (const [goalId, dates] of Object.entries(completedDates)) {
        goalStats[goalId].activeDays = dates.size;
    }

    return { plannedMinutes, completedMinutes, skippedMinutes, goalStats };
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
        supabase
            .from('goals')
            .select('id, title, category, pillar, importance, minutes_per_day, days_per_week, is_paused, created_at, status')
            .eq('user_id', userId),
    ]);

    if (blocksRes.error) throw blocksRes.error;
    if (goalsRes.error) throw goalsRes.error;

    const allBlocks: BlockLike[] = blocksRes.data || [];
    const goals = goalsRes.data || [];

    const weekBlocks = allBlocks.filter((b) => (b.date || '') >= weekStart && (b.date || '') <= weekEnd);

    // ── Metrics ───────────────────────────────────────────────────────
    const activeGoals = goals.filter((g: any) => !g.is_paused && g.status !== 'archived');
    const metrics = computeMetrics(weekBlocks, activeGoals, today);

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

    // ── Deterministic goal proposals (§1) ─────────────────────────────
    // These used to arrive inside the LLM response, which meant a provider
    // outage disabled the entire recalibration half of the review.
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
        };
    }
    const proposedGoalChanges = buildProposals(usage, today);

    return {
        weekStart,
        weekEnd,
        metrics,
        profile,
        proposed_goal_changes: proposedGoalChanges,
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
