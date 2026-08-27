import { isComplete, type BlockLike } from './chain-service';

/** Monday-first, calendar order. Day patterns are never sorted or filtered. */
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Minimum blocks in a 2-hour window before we are willing to draw a conclusion.
 * Lowered from 4 to 3: now that only goal-linked blocks are scored, the whole
 * set is far smaller and a floor of 4 left the profile permanently reading
 * "not enough data".
 */
export const MIN_WINDOW_BLOCKS = 3;

export interface TimeWindow {
    start: string;
    end: string;
    start_hour: number;
    completion_rate: number;
    blocks: number;
}

export const pct = (complete: number, total: number) =>
    total > 0 ? Math.round((complete / total) * 100) : 0;

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * Genuine rolling 2-hour windows — 00:00–02:00, 01:00–03:00, … 22:00–24:00.
 *
 * The previous implementation bucketed by single hour and then printed
 * `hour → hour+2` as if it were a window, which is how you end up showing an
 * overlapping 09:00–11:00 peak next to a 10:00–12:00 low.
 */
export function computeWindows(blocks: BlockLike[]): {
    peak: TimeWindow | null;
    low: TimeWindow | null;
} {
    const hourly = Array.from({ length: 24 }, () => ({ total: 0, complete: 0 }));

    for (const b of blocks) {
        const hour = parseInt((b.start_time || '').split(':')[0], 10);
        if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;
        hourly[hour].total++;
        if (isComplete(b)) hourly[hour].complete++;
    }

    const eligible: TimeWindow[] = [];
    for (let h = 0; h <= 22; h++) {
        const total = hourly[h].total + hourly[h + 1].total;
        const complete = hourly[h].complete + hourly[h + 1].complete;
        if (total < MIN_WINDOW_BLOCKS) continue;
        eligible.push({
            start: hh(h),
            end: h + 2 === 24 ? '24:00' : hh(h + 2),
            start_hour: h,
            completion_rate: pct(complete, total),
            blocks: total,
        });
    }

    // Fewer than two eligible windows means we cannot honestly name both a peak
    // and a low, so we name neither rather than fabricating 09:00–11:00.
    if (eligible.length < 2) return { peak: null, low: null };

    const peak = [...eligible].sort(
        (a, b) => b.completion_rate - a.completion_rate || b.blocks - a.blocks
    )[0];

    // A window where nothing was completed is not a peak. Without this, a week
    // in which the user marked nothing still yields a confident archetype built
    // on an all-zero distribution.
    if (peak.completion_rate === 0) return { peak: null, low: null };

    // Peak and low must not overlap. If the lowest-scoring window sits on top of
    // the peak, we take the next eligible one instead.
    const overlapsPeak = (w: TimeWindow) => Math.abs(w.start_hour - peak.start_hour) < 2;
    const low =
        [...eligible]
            .filter((w) => !overlapsPeak(w))
            .sort((a, b) => a.completion_rate - b.completion_rate || b.blocks - a.blocks)[0] || null;

    if (!low) return { peak: null, low: null };
    return { peak, low };
}

/**
 * Archetype comes from where the peak window actually starts. With no eligible
 * peak we say so rather than showing a confident label built on nothing.
 */
export function archetypeFor(peak: TimeWindow | null): { archetype: string; description: string } {
    if (!peak) {
        return {
            archetype: 'Still Learning',
            description:
                "There isn't enough marked data yet to read your rhythm. Keep marking blocks as done, partial, missed or skipped and your peak hours will surface here.",
        };
    }

    const h = peak.start_hour;
    if (h < 9) {
        return {
            archetype: 'Early Riser',
            description: `Your completion rate peaks before 9 AM (${peak.start}–${peak.end}). The day is most yours before anyone else needs it — put what matters there.`,
        };
    }
    if (h < 12) {
        return {
            archetype: 'Morning Sprinter',
            description: `Your best window is ${peak.start}–${peak.end}. You finish what you start in the late morning, so front-load the work that needs your full attention.`,
        };
    }
    if (h < 16) {
        return {
            archetype: 'Afternoon Builder',
            description: `You hit your stride between ${peak.start} and ${peak.end}. Deep work scheduled midday is the work that actually gets done.`,
        };
    }
    if (h < 20) {
        return {
            archetype: 'Evening Operator',
            description: `Your completion rate is highest from ${peak.start} to ${peak.end}. Protect the evening — that is where your follow-through lives.`,
        };
    }
    return {
        archetype: 'Night Owl',
        description: `You do your most reliable work after 8 PM (${peak.start}–${peak.end}). Plan around it rather than fighting it.`,
    };
}
