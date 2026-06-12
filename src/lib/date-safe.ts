import { parseISO, format, isValid, startOfDay } from 'date-fns';

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
export function safeDateTime(dateStr: string, timeStr: string, timezone: string = 'UTC'): Date | null {
    const date = safeParseISO(dateStr);
    const time = normalizeTime(timeStr);

    if (!date || !time) return null;

    try {
        // Construct ISO string
        const iso = `${format(date, 'yyyy-MM-dd')}T${time}:00`;
        const result = parseISO(iso);
        return isValid(result) ? result : null;
    } catch {
        return null;
    }
}
