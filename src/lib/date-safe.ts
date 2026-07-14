import { parseISO, format, isValid, startOfDay } from 'date-fns';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';

/**
 * Safely parses an ISO date string.
 * Returns null if the input is invalid or null/undefined.
 */
export function safeParseISO(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;
    try {
        const date = parseISO(dateString);
        return isValid(date) ? date : null;
    } catch {
        return null;
    }
}

/**
 * Safely formats a date.
 * Returns null if the date is invalid or null/undefined.
 * Fallback can be provided.
 */
export function safeFormat(date: Date | number | null | undefined, formatStr: string, fallback: string = ''): string {
    if (!date) return fallback;
    try {
        if (!isValid(date)) return fallback;
        return format(date, formatStr);
    } catch {
        return fallback;
    }
}

/**
 * Validates if a string is a valid ISO date (YYYY-MM-DD).
 */
export function isValidISODate(dateString: string): boolean {
    const date = safeParseISO(dateString);
    return !!date;
}

/**
 * Normalizes HH:MM string.
 * Example: "9:0" -> "09:00", "5:30" -> "05:30"
 * Returns null if invalid.
 */
export function normalizeTime(timeString: string | null | undefined): string | null {
    if (!timeString) return null;

    // Remove whitespace
    const clean = timeString.trim();

    // Check basic format
    const parts = clean.split(':');
    if (parts.length !== 2) return null;

    const [h, m] = parts;
    const hour = parseInt(h, 10);
    const minute = parseInt(m, 10);

    if (isNaN(hour) || isNaN(minute)) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Safely combines a date and time into a Date object.
 * @param dateStr ISO Date string (YYYY-MM-DD)
 * @param timeStr HH:MM string
 * @returns Date object or null if invalid
 */
export function safeDateTime(dateStr: string, timeStr: string, timezone: string = DEFAULT_TIMEZONE): Date | null {
    const date = safeParseISO(dateStr);
    const time = normalizeTime(timeStr);

    if (!date || !time) return null;

    try {
        // Treat the wall-clock string as if it were UTC to get a reference instant,
        // then measure how that instant's wall-clock time reads in the target
        // timezone and correct for the difference. This correctly resolves any
        // IANA zone (fixed-offset like Asia/Kolkata, or DST-observing) without
        // needing the date-fns-tz package.
        const isoNaive = `${format(date, 'yyyy-MM-dd')}T${time}:00Z`;
        const asUtc = parseISO(isoNaive);
        if (!isValid(asUtc)) return null;

        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(asUtc);
        const map: Record<string, string> = {};
        for (const part of parts) map[part.type] = part.value;

        const shownAsLocal = new Date(Date.UTC(
            Number(map.year), Number(map.month) - 1, Number(map.day),
            Number(map.hour === '24' ? '0' : map.hour), Number(map.minute), Number(map.second)
        ));

        const offsetMs = asUtc.getTime() - shownAsLocal.getTime();
        const result = new Date(asUtc.getTime() + offsetMs);
        return isValid(result) ? result : null;
    } catch {
        return null;
    }
}
