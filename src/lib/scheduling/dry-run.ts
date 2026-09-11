/**
 * The scheduler, asked a question instead of told to do something.
 *
 * Weekly Review needs to know one thing before it may ever suggest a smaller
 * target: can the week actually hold the hours the user asked for? A completion
 * ratio cannot answer that — it measures what the user did, not what the week
 * could fit, and using it as the trigger ratchets targets downward forever
 * (every shortfall cuts the target, which makes the next shortfall easier to
 * hit, which cuts it again).
 *
 * `generateWeekPlan` is fully deterministic and synchronous — no AI call, no
 * network, sub-two-second — so we can simply run it and read the answer off
 * `stats.unscheduled_minutes`. Nothing here writes: `buildCalendarContext`
 * reads, `generateWeekPlan` returns variants, and neither touches
 * `schedule_blocks`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { generateWeekPlan } from '@/lib/calendar/ai/plan-week';
import { SchedulingProtocol } from '@/lib/scheduling/protocol';
import {
    computeWeekCapacity,
    describeCapacity,
    type WeekCapacity,
} from '@/lib/scheduling/capacity';

export interface DryRunResult {
    /**
     * The ONLY thing that licenses a reduction. False means we have no
     * evidence, and no evidence must never become a cut.
     */
    ok: boolean;
    /** The Monday that was planned. */
    weekStart: string;
    /** Keyed by goal_id — titles collide and mask each other. */
    unscheduledByGoal: Record<string, number>;
    totalUnscheduledMins: number;
    blocksPlanned: number;
    capacity: WeekCapacity | null;
    ms: number;
    error?: string;
}

/**
 * The Monday AFTER the one containing `todayStr` — the window a weekly review
 * actually plans. Noon anchoring keeps DST out of it.
 */
export function nextMondayAfter(todayStr: string): string {
    const [y, m, d] = todayStr.split('-').map(Number);
    const today = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    const dow = today.getDay(); // 0 = Sunday
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const next = new Date(today.getTime() + (mondayOffset + 7) * 86400000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`;
}

/**
 * One dry run per user+week, shared by every caller inside the window.
 *
 * The cache holds the PROMISE, not the finished result: two concurrent callers
 * both reach this before either has an answer, so a cache written at the end
 * would let the plan generate twice.
 */
const CACHE_TTL_MS = 30_000;
const inflight = new Map<string, { at: number; promise: Promise<DryRunResult> }>();

export async function dryRunWeek(
    supabase: SupabaseClient,
    userId: string,
    weekStart: string,
    mode: 'balanced' | 'momentum' | 'recovery' = 'balanced'
): Promise<DryRunResult> {
    const key = `${userId}:${weekStart}:${mode}`;
    const prior = inflight.get(key);
    if (prior && Date.now() - prior.at < CACHE_TTL_MS) return prior.promise;

    const promise = runOnce(supabase, userId, weekStart, mode);
    inflight.set(key, { at: Date.now(), promise });
    // A rejected promise must not be served from cache for the full TTL.
    promise.catch(() => inflight.delete(key));
    return promise;
}

async function runOnce(
    supabase: SupabaseClient,
    userId: string,
    weekStart: string,
    mode: 'balanced' | 'momentum' | 'recovery'
): Promise<DryRunResult> {
    const started = Date.now();
    const empty: DryRunResult = {
        ok: false,
        weekStart,
        unscheduledByGoal: {},
        totalUnscheduledMins: 0,
        blocksPlanned: 0,
        capacity: null,
        ms: 0,
    };

    try {
        const ctx = await buildCalendarContext(userId, supabase);
        // §5 parity: the dry run has to be measured with the caps the real
        // plan will use, or it answers a question about a different week.
        const modeConfig = SchedulingProtocol.getModeConfig(mode);
        const variants = await generateWeekPlan(ctx, weekStart, mode, true, {
            maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
            maxDeepWorkMins: modeConfig.maxDeepWorkMins,
        }, weekStart);

        if (!variants || variants.length === 0) {
            return { ...empty, ms: Date.now() - started, error: 'generator returned no variants' };
        }

        const plan = variants[0];
        const unscheduledByGoal: Record<string, number> = {};
        for (const [goalId, mins] of Object.entries(plan.stats.unscheduled_minutes || {})) {
            const n = Number(mins);
            if (Number.isFinite(n) && n > 0) unscheduledByGoal[goalId] = Math.round(n);
        }
        const totalUnscheduledMins = Object.values(unscheduledByGoal).reduce((s, n) => s + n, 0);

        const ms = Date.now() - started;
        const capacity = ctx.weekCapacity ?? null;
        console.log(
            `[DryRun] ${weekStart} mode=${mode} ${ms}ms — ${plan.blocks.length} blocks planned, ` +
                `${totalUnscheduledMins}m unplaceable across ${Object.keys(unscheduledByGoal).length} goal(s)` +
                (capacity ? ` | ${describeCapacity(capacity)}` : '')
        );

        return {
            ok: true,
            weekStart,
            unscheduledByGoal,
            totalUnscheduledMins,
            blocksPlanned: plan.blocks.length,
            capacity,
            ms,
        };
    } catch (error: any) {
        const ms = Date.now() - started;
        // Interpolated, not a second console arg — Next's dev logger renders
        // extra args as `{}`.
        console.error(
            `[DryRun] Failed after ${ms}ms — no reduction may be proposed: ${JSON.stringify({
                message: error?.message,
                weekStart,
            })}`
        );
        return { ...empty, ms, error: error?.message || 'dry run failed' };
    }
}

/**
 * §5: momentum uses zero per-block buffers and a higher per-day cap, which buys
 * real room. Worth switching to when the week is tight; wrong when it is loose,
 * because zero buffers means back-to-back everything.
 *
 * Deliberately computed from capacity arithmetic rather than a second
 * `generateWeekPlan` — the execute route is about to run the real generation
 * anyway, and planning the week twice to pick its own mode would double a 60s
 * budget's most expensive step.
 */
export const TIGHT_HEADROOM_RATIO = 0.15;

export interface ModeDecision {
    mode: 'balanced' | 'momentum';
    reason: string;
    capacity: WeekCapacity | null;
}

export async function chooseWeekMode(
    supabase: SupabaseClient,
    userId: string,
    /** Pending goal edits, keyed by goal_id — applied before measuring. */
    overrides: Record<string, { minutes_per_day?: number; days_per_week?: number; is_paused?: boolean }> = {}
): Promise<ModeDecision> {
    try {
        // Measured through the SAME context the generator builds, not through a
        // direct read of `profiles`. The two disagree — buildCalendarContext
        // merges profile_preferences over profiles and falls back to its own
        // defaults when that query fails — and a mode chosen from a week the
        // planner is not going to build is worse than no choice at all.
        const ctx = await buildCalendarContext(userId, supabase);

        const goals = (ctx.goals || []).map((g: any) => ({
            minutes_per_day: g.minutes_per_day,
            days_per_week: g.days_per_week,
            is_paused: g.is_paused,
            status: g.is_active === false ? 'paused' : 'active',
            ...(overrides[g.id] || {}),
        }));

        const capacity = computeWeekCapacity(ctx.user as any, goals, ctx.commitments || []);
        const tight =
            capacity.isOvercommitted ||
            capacity.headroomMins < capacity.availableMins * TIGHT_HEADROOM_RATIO;

        const mode: 'balanced' | 'momentum' = tight ? 'momentum' : 'balanced';
        const reason = `${describeCapacity(capacity)} → ${tight ? 'tight' : 'loose'}`;
        console.log(`[WeekMode] ${mode} — ${reason}`);
        return { mode, reason, capacity };
    } catch (error: any) {
        // The safe default is the mode that was always used before.
        console.error(`[WeekMode] Falling back to balanced: ${error?.message || error}`);
        return { mode: 'balanced', reason: 'capacity unavailable', capacity: null };
    }
}
