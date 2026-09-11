import { isEligible, isComplete, type BlockLike } from './chain-service';

/**
 * THE per-day completion calculation.
 *
 * Day Patterns and the Day Chain both render a percentage for the same day, and
 * they used to derive it separately. That is precisely how the future-day bug
 * got in: one of them divided 0 by 0 and printed 100%, while the other treated
 * "no eligible blocks" as a broken day. Both read from here now, so they cannot
 * disagree again.
 */

const UNMARKED = new Set(['planned', 'in_progress']);

/**
 * A block still sitting at `planned`/`in_progress` counts as missed once its day
 * has passed, but must not drag down a day that has not arrived yet.
 */
export function isPending(b: BlockLike, today: string): boolean {
    return UNMARKED.has(b.status || 'planned') && (b.date || '') >= today;
}

/** Blocks that count towards a day's ratio. */
export function scoredBlocks(blocks: BlockLike[], today: string): BlockLike[] {
    return blocks.filter((b) => isEligible(b) && !isPending(b, today));
}

export interface DayCompletion {
    date: string;
    /** 0..1. Zero when nothing was eligible — read `total` before trusting it. */
    completion: number;
    /** 0..100, or null when there is nothing to report (empty or future day). */
    rate: number | null;
    total: number;
    complete: number;
    /** The day is still to come. It neither extends nor breaks the chain. */
    is_future: boolean;
}

/**
 * One day's completion. `blocks` may be the day's raw blocks — filtering is
 * done here so every caller applies the same rules.
 */
export function dayCompletion(date: string, blocks: BlockLike[], today: string): DayCompletion {
    const isFuture = date > today;

    // A future day has no verdict at all: its blocks have not had their chance.
    if (isFuture) {
        return { date, completion: 0, rate: null, total: 0, complete: 0, is_future: true };
    }

    const scored = scoredBlocks(blocks, today);
    const complete = scored.filter(isComplete).length;
    const total = scored.length;

    return {
        date,
        completion: total > 0 ? complete / total : 0,
        rate: total > 0 ? Math.round((complete / total) * 100) : null,
        total,
        complete,
        is_future: false,
    };
}
