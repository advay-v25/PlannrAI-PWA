'use client';

import { CalendarClock, CheckCircle2, Lock } from 'lucide-react';
import { prettyLongDate, type ReviewWindow } from '@/lib/weekly-review/window';
import type { WeekReviewInfo } from '@/app/api/weekly-review/status/route';

/**
 * Prompt 54 §3/§4: what sits where the AI summary and the action cards would
 * be, whenever the review is not open for the selected week.
 *
 * Every state here is terminal. There is no "generate" button and no
 * execution control — nothing about a closed week is actionable.
 */
const MODE_LABEL: Record<string, string> = {
    accepted: 'Automatic',
    partial: 'Semi-automated',
    ignored: 'Manual',
};

/** A timestamp's calendar date in the user's timezone, as "Monday 8 September". */
function reviewedOn(iso: string, timezone: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: timezone,
        });
    } catch {
        return prettyLongDate(iso.slice(0, 10));
    }
}

export interface ServerRefusal {
    code: string;
    next_open_date?: string;
    message?: string;
}

export function ReviewStatePanel({
    window: win,
    week,
    refusal,
    hasStats = true,
}: {
    window: ReviewWindow;
    week: WeekReviewInfo | null;
    /** §5: a refusal from the server. When present it wins over local state. */
    refusal?: ServerRefusal | null;
    /** False when the dashboard above is empty, so the copy doesn't point at it. */
    hasStats?: boolean;
}) {
    let icon = <Lock className="w-5 h-5 text-[var(--text-tertiary)]" />;
    let title: string;
    let body: string;
    let detail: string | null = null;
    let tone = 'border-[var(--glass-border)]';

    const nextOpen = refusal?.next_open_date || win.next_open_date;

    if (refusal) {
        // The server said no. Render its date, not ours.
        title = 'The weekly review is closed today';
        body = `Your next review opens ${prettyLongDate(nextOpen)}.`;
    } else if (!week || week.is_current_week || week.is_future_week) {
        // §3a — on every day, Monday included. The week is not over.
        icon = <CalendarClock className="w-5 h-5 text-[var(--text-tertiary)]" />;
        title = 'This week is still in progress';
        body = `Its review opens ${prettyLongDate(week?.review_due_date ?? win.next_open_date)}. ${
            hasStats ? 'The numbers above fill in as the week goes on.' : 'Nothing has been marked yet; the numbers appear here as the week goes on.'
        }`;
    } else if (week.reviewed) {
        // §4a — a row exists, and it holds what was decided.
        icon = <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />;
        tone = 'border-emerald-500/30';
        title = 'Weekly review completed';
        body = week.completed_at
            ? `Reviewed ${reviewedOn(week.completed_at, win.timezone)}.`
            : 'Reviewed.';
        const mode = week.user_response ? MODE_LABEL[week.user_response] ?? week.user_response : null;
        detail = [
            mode ? `You chose ${mode}.` : null,
            week.lever_applied
                ? 'Goal adjustments were applied to the following week.'
                : 'No goal adjustments were applied.',
        ]
            .filter(Boolean)
            .join(' ');
    } else {
        // §4b — no row. Honest and just as final.
        title = "This week wasn't reviewed";
        body = `The review window closed on ${prettyLongDate(week.review_due_date)}.`;
    }

    // §3: the exact next date, on every closed day. Skipped when the window
    // is open — "opens today" beside an old week's state would only confuse.
    const showNextOpen = !refusal && !win.is_open && !(week && (week.is_current_week || week.is_future_week));

    return (
        <div
            data-testid="review-state-panel"
            className={`p-6 rounded-3xl bg-[var(--glass-bg)] border ${tone} backdrop-blur-xl`}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center">
                    {icon}
                </div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
            </div>
            <p className="text-sm md:text-base text-[var(--text-secondary)]">{body}</p>
            {detail && <p className="text-sm text-[var(--text-tertiary)] mt-1">{detail}</p>}
            {showNextOpen && (
                <p className="text-sm text-[var(--text-tertiary)] mt-3 pt-3 border-t border-[var(--glass-border)]">
                    The weekly review opens on Mondays. Your next review opens{' '}
                    <span className="font-semibold text-[var(--text-secondary)]">{prettyLongDate(nextOpen)}</span>.
                </p>
            )}
        </div>
    );
}
