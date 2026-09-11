import { format, startOfWeek, addDays } from 'date-fns';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

/**
 * §4: turn a relative date word into a real `YYYY-MM-DD`, in the user's
 * timezone.
 *
 * The plan-week route was returning 400 for `start_date: "tomorrow"`. Nothing
 * in `src/` sends that literal — every in-app caller formats a date first — so
 * it arrives from outside the codebase, almost certainly an LLM-generated
 * `plan_week` op passing the user's own words straight through. Rejecting it
 * was correct in that a bare string must never reach the planner, but the
 * user-visible result was a planning request that silently did nothing.
 *
 * Anything still unparseable returns null, and the caller keeps its 400.
 */
export function resolveRelativeDate(
    raw: string,
    timezone: string = DEFAULT_TIMEZONE
): { date: string; interpreted: boolean } | null {
    if (!raw || typeof raw !== 'string') return null;
    const value = raw.trim().toLowerCase();

    // Already a real date — pass it through untouched.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return Number.isNaN(new Date(`${value}T00:00:00`).getTime())
            ? null
            : { date: value, interpreted: false };
    }

    const today = new Date(`${nowInTimezone(timezone).date}T00:00:00`);
    const iso = (d: Date) => format(d, 'yyyy-MM-dd');
    const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

    switch (value) {
        case 'today':
        case 'now':
            return { date: iso(today), interpreted: true };
        case 'tomorrow':
            return { date: iso(addDays(today, 1)), interpreted: true };
        case 'yesterday':
            return { date: iso(addDays(today, -1)), interpreted: true };
        case 'this week':
        case 'this monday':
            return { date: iso(mondayOf(today)), interpreted: true };
        case 'next week':
        case 'next monday':
            return { date: iso(addDays(mondayOf(today), 7)), interpreted: true };
        case 'last week':
            return { date: iso(addDays(mondayOf(today), -7)), interpreted: true };
    }

    // Weekday names resolve to the NEXT such day (today counts as itself).
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const bare = value.replace(/^(next|this|on)\s+/, '');
    const idx = weekdays.indexOf(bare);
    if (idx >= 0) {
        const wantNext = /^next\s+/.test(value);
        let d = today;
        for (let i = 0; i < 7; i++) {
            const candidate = addDays(today, i);
            if (candidate.getDay() === idx) { d = candidate; break; }
        }
        return { date: iso(wantNext && d.getTime() === today.getTime() ? addDays(d, 7) : d), interpreted: true };
    }

    return null;
}
