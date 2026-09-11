/**
 * Prompt 54 §1: the ONE answer to "is the weekly review open?".
 *
 * Every gate — the Monday prompt, the page's closed state, the client-side
 * fetchAi guard and the server-side refusals in generate-report and execute —
 * reads from here. Nothing else may decide what day it is.
 *
 * The day is resolved in the USER's timezone via `nowInTimezone`, the same
 * helper the context builders use. The old page helpers used `getUTCDay()`,
 * which for an Asia/Kolkata user (the app default) made Monday 04:00 local
 * read as Sunday — the review was closed during the exact hours it exists for.
 *
 * Pure and side-effect free apart from `logReviewWindow`, so it runs
 * identically on the client and the server.
 */
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

/** Error code both AI routes return when refused outside the window. */
export const REVIEW_WINDOW_CLOSED = 'REVIEW_WINDOW_CLOSED';
/** Error code when the window is open but the requested week is not last week. */
export const REVIEW_WEEK_NOT_REVIEWABLE = 'REVIEW_WEEK_NOT_REVIEWABLE';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** yyyy-MM-dd arithmetic on an already-localised date. Never touches a timezone. */
export function shiftIsoDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso` (a local calendar date). */
export function mondayOfIso(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay();
    return shiftIsoDate(iso, -((weekday + 6) % 7));
}

/** The user's local calendar date and weekday for a given instant. */
export function userLocalDay(nowUtc: Date, timezone: string): { date: string; weekday: number } {
    const tz = timezone || DEFAULT_TIMEZONE;
    try {
        const { date, dayOfWeek } = nowInTimezone(tz, nowUtc);
        return { date, weekday: dayOfWeek };
    } catch {
        // An invalid IANA name must not take the page down; fall back to the
        // app default rather than to UTC.
        const { date, dayOfWeek } = nowInTimezone(DEFAULT_TIMEZONE, nowUtc);
        return { date, weekday: dayOfWeek };
    }
}

/** True only when today, in the user's own timezone, is a Monday. */
export function isReviewWindowOpen(nowUtc: Date, timezone: string): boolean {
    return userLocalDay(nowUtc, timezone).weekday === 1;
}

/** The Monday of the week containing `now`, in the user's timezone. */
export function userThisMonday(nowUtc: Date, timezone: string): string {
    const { date, weekday } = userLocalDay(nowUtc, timezone);
    return shiftIsoDate(date, -((weekday + 6) % 7));
}

/** The Monday before `userThisMonday` — the week the review is FOR. */
export function userLastMonday(nowUtc: Date, timezone: string): string {
    return shiftIsoDate(userThisMonday(nowUtc, timezone), -7);
}

/**
 * The next date the window is open: today if it is Monday, otherwise the
 * coming Monday. This is the date §3's "Your next review opens Monday …" names.
 */
export function nextReviewOpenDate(nowUtc: Date, timezone: string): string {
    const { date, weekday } = userLocalDay(nowUtc, timezone);
    if (weekday === 1) return date;
    return shiftIsoDate(date, (8 - weekday) % 7);
}

/**
 * The Monday on which a given week's review opens (and, being a one-day
 * window, closes): the Monday immediately after that week.
 */
export function reviewDueDate(weekStart: string): string {
    return shiftIsoDate(mondayOfIso(weekStart), 7);
}

/** Everything a caller needs, resolved once. Serialisable as-is. */
export interface ReviewWindow {
    timezone: string;
    /** Local calendar date, yyyy-MM-dd. */
    today: string;
    /** 0 (Sun) – 6 (Sat), local. */
    weekday: number;
    weekday_name: string;
    is_open: boolean;
    this_monday: string;
    last_monday: string;
    next_open_date: string;
}

export function resolveReviewWindow(nowUtc: Date, timezone?: string | null): ReviewWindow {
    const tz = timezone || DEFAULT_TIMEZONE;
    const { date, weekday } = userLocalDay(nowUtc, tz);
    return {
        timezone: tz,
        today: date,
        weekday,
        weekday_name: WEEKDAY_NAMES[weekday],
        is_open: weekday === 1,
        this_monday: userThisMonday(nowUtc, tz),
        last_monday: userLastMonday(nowUtc, tz),
        next_open_date: nextReviewOpenDate(nowUtc, tz),
    };
}

/**
 * §1: log the resolved day once per page load / request. A boundary bug here
 * is invisible in testing and total in production, so the value it resolved
 * to must be visible in the logs.
 */
export function logReviewWindow(scope: string, w: ReviewWindow): void {
    console.log(
        `[ReviewWindow/${scope}] timezone=${w.timezone} local_date=${w.today} weekday=${w.weekday_name} ` +
            `open=${w.is_open} this_monday=${w.this_monday} last_monday=${w.last_monday} next_open=${w.next_open_date}`
    );
}

/**
 * "Monday 14 September" — the exact date, never "come back Monday".
 * Purely calendar formatting of a yyyy-MM-dd; no timezone involved.
 */
export function prettyLongDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    });
}
