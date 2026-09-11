import type { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiError } from '@/lib/api/envelope';
import {
    REVIEW_WEEK_NOT_REVIEWABLE,
    REVIEW_WINDOW_CLOSED,
    logReviewWindow,
    prettyLongDate,
    resolveReviewWindow,
    type ReviewWindow,
} from '@/lib/weekly-review/window';

/**
 * Prompt 54 §5: the server-side refusal both AI routes run BEFORE any work.
 *
 * Hiding a card is not the same as not calling the endpoint. A stale tab, a
 * background retry or a direct curl must not be able to spend quota or mutate
 * goals on a Thursday. The refusal carries the next open date so the client
 * renders §3's message from the server's answer rather than its own clock.
 *
 * Returns the resolved window and the week to use, or a ready-made response.
 */
export async function gateReviewWindow(
    supabase: SupabaseClient,
    userId: string,
    scope: string,
    requestedWeekStart?: string | null
): Promise<
    | { ok: true; window: ReviewWindow; weekStart: string; weekEnd: string; response?: undefined }
    | { ok: false; response: NextResponse; window: ReviewWindow }
> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();

    const win = resolveReviewWindow(serverNow(), profile?.timezone);
    logReviewWindow(scope, win);

    const details = {
        code: REVIEW_WINDOW_CLOSED,
        next_open_date: win.next_open_date,
        timezone: win.timezone,
        today: win.today,
        weekday: win.weekday_name,
        this_monday: win.this_monday,
        last_monday: win.last_monday,
    };

    if (!win.is_open) {
        return {
            ok: false,
            window: win,
            response: apiError(
                `The weekly review is closed today (${win.weekday_name}). Your next review opens ${prettyLongDate(win.next_open_date)}.`,
                409,
                REVIEW_WINDOW_CLOSED,
                details
            ),
        };
    }

    // A missing week means "the default", which is exactly last week. A
    // week that is present but is not last week is refused even on a Monday —
    // nothing about an older week is actionable, and the current week is not
    // over.
    const weekStart = requestedWeekStart || win.last_monday;
    if (weekStart !== win.last_monday) {
        return {
            ok: false,
            window: win,
            response: apiError(
                `Only last week (${win.last_monday}) can be reviewed; ${weekStart} is ${weekStart < win.last_monday ? 'older' : 'not over yet'}.`,
                409,
                REVIEW_WEEK_NOT_REVIEWABLE,
                { ...details, code: REVIEW_WEEK_NOT_REVIEWABLE, requested_week_start: weekStart }
            ),
        };
    }

    const [y, m, d] = weekStart.split('-').map(Number);
    const end = new Date(Date.UTC(y, m - 1, d + 6, 12)).toISOString().slice(0, 10);
    return { ok: true, window: win, weekStart, weekEnd: end };
}

/**
 * The instant the server resolves the window against.
 *
 * Verification hook, dev-only: `PLANNR_REVIEW_FAKE_NOW=<ISO>` pins "now" so
 * the Monday paths can be exercised on a Friday. Ignored — silently, and
 * unconditionally — in production; the override only ever changes the
 * instant, never the timezone, so it is not a second way of deciding the day.
 */
export function serverNow(): Date {
    if (process.env.NODE_ENV !== 'production') {
        const fake = process.env.PLANNR_REVIEW_FAKE_NOW;
        if (fake) {
            const d = new Date(fake);
            if (!Number.isNaN(d.getTime())) return d;
        }
    }
    return new Date();
}
