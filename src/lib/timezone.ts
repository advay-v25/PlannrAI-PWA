/**
 * PlannrAI is currently sold only in India — Asia/Kolkata (IST) is the
 * single supported timezone. This is the one place that default lives,
 * so it can be extended to multi-timezone later without hunting down
 * every 'UTC' fallback in the codebase again.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Resolves a profile's stored timezone, falling back to the app default. */
export function getUserTimezone(profileTimezone?: string | null): string {
    return profileTimezone || DEFAULT_TIMEZONE;
}

/**
 * Returns "now" as wall-clock date/time components in the given IANA timezone,
 * using native Intl (no date-fns-tz dependency needed).
 */
export function nowInTimezone(timezone: string = DEFAULT_TIMEZONE): {
    date: string;      // yyyy-MM-dd
    time: string;       // HH:mm
    dayOfWeek: number;  // 0 (Sun) - 6 (Sat), matches Date#getDay()
} {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short',
    }).formatToParts(now);

    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;

    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    // hour12: false can format midnight as "24" in some engines — normalize to "00".
    const hour = map.hour === '24' ? '00' : map.hour;

    return {
        date: `${map.year}-${map.month}-${map.day}`,
        time: `${hour}:${map.minute}`,
        dayOfWeek: weekdayMap[map.weekday] ?? now.getDay(),
    };
}
