import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Chain / completion service.
 *
 * This module owns the ONE definition of "did this block count, and did it
 * get done". The Productivity Profile (§3), the Day Chain (§5) and the
 * end-of-day sweep (§1) all read from here so their numbers can never
 * disagree with each other.
 */

export interface BlockLike {
    id?: string;
    date?: string;
    status?: string | null;
    block_type?: string | null;
    pillar?: string | null;
    goal_id?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    title?: string | null;
}

export const PILLARS = ['mind', 'body', 'craft'] as const;
export type Pillar = (typeof PILLARS)[number];

/** Statuses that mean the block was deliberately taken off the table. */
const EXCLUDED_STATUSES = new Set(['skipped', 'cancelled']);

/**
 * Only AI-scheduled goal work is scored. Sleep, meals, anchors, morning
 * routine, wind-down and buffers are scaffolding the user did not choose and
 * cannot meaningfully "complete" — counting them made a 100% day impossible
 * and diluted every percentage on the page.
 *
 * Requiring BOTH `goal_id` and a valid pillar makes this exactly the set
 * Pillar Performance already scored, which is why those figures were right
 * while the day rates were not.
 */
export function isScored(b: BlockLike): boolean {
    if (!b.goal_id) return false;
    return (PILLARS as readonly string[]).includes((b.pillar || '').toLowerCase());
}

/**
 * `skipped` is a deliberate decision not to do something and `cancelled` is a
 * block that stopped existing — neither helps nor hurts, so both leave the
 * denominator entirely.
 */
export function isEligible(b: BlockLike): boolean {
    return isScored(b) && !EXCLUDED_STATUSES.has(b.status || '');
}

/** `partial` counts as complete: the user showed up. */
export function isComplete(b: BlockLike): boolean {
    return b.status === 'done' || b.status === 'partial';
}

export interface DayTally {
    total: number;
    complete: number;
    /** 0..1, or 0 when nothing was eligible. */
    completion: number;
}

/** The single completion formula. Every ratio in the app routes through this. */
export function tally(blocks: BlockLike[]): DayTally {
    const eligible = blocks.filter(isEligible);
    const complete = eligible.filter(isComplete).length;
    return {
        total: eligible.length,
        complete,
        completion: eligible.length > 0 ? complete / eligible.length : 0,
    };
}

/**
 * A day is complete when every eligible block on it is done or partial.
 * A day with zero eligible blocks breaks the chain — you cannot keep a streak
 * on a day you never planned.
 */
export function isCompleteDay(blocks: BlockLike[]): boolean {
    const t = tally(blocks);
    return t.total > 0 && t.complete === t.total;
}

/** Group blocks by their `date` field. */
export function groupByDate(blocks: BlockLike[]): Map<string, BlockLike[]> {
    const map = new Map<string, BlockLike[]>();
    for (const b of blocks) {
        if (!b.date) continue;
        const bucket = map.get(b.date);
        if (bucket) bucket.push(b);
        else map.set(b.date, [b]);
    }
    return map;
}

/** yyyy-MM-dd arithmetic that never touches the local timezone. */
export function shiftDate(isoDate: string, days: number): string {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/** How far back a recompute is willing to walk. */
const LOOKBACK_DAYS = 400;

export interface ChainState {
    current_streak: number;
    longest_streak: number;
    last_complete_date: string | null;
    state: 'RUNNING' | 'ENDED';
}

/**
 * Recompute the chain from `schedule_blocks` and persist it.
 *
 * We deliberately never trust the stored counter: a user marking an old block
 * through the end-of-day sweep has to be able to heal a broken streak, and the
 * only way that works is to derive the run from the blocks themselves.
 */
export async function recomputeChain(
    supabase: SupabaseClient,
    userId: string,
    throughDate: string
): Promise<ChainState> {
    const windowStart = shiftDate(throughDate, -LOOKBACK_DAYS);

    const { data: blocks, error } = await supabase
        .from('schedule_blocks')
        // goal_id and pillar are REQUIRED by isScored(). Without them every
        // block fails the test and every streak silently reads zero.
        .select('date, status, block_type, goal_id, pillar')
        .eq('user_id', userId)
        .gte('date', windowStart)
        .lte('date', throughDate);

    if (error) throw error;

    const byDate = groupByDate(blocks || []);

    // Current streak: unbroken run of 100% days ending at throughDate.
    let currentStreak = 0;
    let cursor = throughDate;
    while (cursor >= windowStart) {
        if (!isCompleteDay(byDate.get(cursor) || [])) break;
        currentStreak++;
        cursor = shiftDate(cursor, -1);
    }

    // Longest run anywhere in the window, plus the most recent complete day.
    let longestInWindow = 0;
    let run = 0;
    let lastCompleteDate: string | null = null;
    for (let d = windowStart; d <= throughDate; d = shiftDate(d, 1)) {
        if (isCompleteDay(byDate.get(d) || [])) {
            run++;
            if (run > longestInWindow) longestInWindow = run;
            lastCompleteDate = d;
        } else {
            run = 0;
        }
    }

    // Never regress the historical high-water mark just because it aged out
    // of the lookback window.
    let storedLongest = 0;
    try {
        const { data: existing } = await supabase
            .from('chain_state')
            .select('longest_streak')
            .eq('user_id', userId)
            .maybeSingle();
        storedLongest = existing?.longest_streak || 0;
    } catch {
        storedLongest = 0;
    }

    const longestStreak = Math.max(longestInWindow, storedLongest, currentStreak);

    const next: ChainState = {
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_complete_date: lastCompleteDate,
        state: currentStreak > 0 ? 'RUNNING' : 'ENDED',
    };

    try {
        await supabase.from('chain_state').upsert(
            {
                user_id: userId,
                current_streak: next.current_streak,
                longest_streak: next.longest_streak,
                last_complete_date: next.last_complete_date,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
        );
    } catch (e) {
        // A cache write failing must never break the read path.
        console.warn('[chain] Failed to persist chain_state:', e);
    }

    return next;
}
