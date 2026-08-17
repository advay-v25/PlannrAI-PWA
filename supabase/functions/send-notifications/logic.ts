/**
 * Pure scheduling logic for send-notifications — no I/O, so it can be tested
 * directly. index.ts does the querying and sending; everything that decides
 * *whether* and *what* to send lives here.
 */

/**
 * How long a trigger stays eligible. One minute would mean a single late cron
 * tick silently drops the alert; two gives a spare tick, and the notification_log
 * unique index is what keeps that from sending twice.
 */
export const WINDOW_MINUTES = 2;

export const NOTIFIABLE_BLOCK_TYPES = ['goal', 'anchor'];

/** Mindspace pillar labels, matching DEFAULT_LABELS in MindspaceBoard.tsx. */
export const PILLAR_LABELS: Record<string, string> = {
    teal: 'Notes',
    purple: 'Ideas',
    orange: 'Urgent',
    blue: 'Work',
    pink: 'Personal',
};

/** Keeps the digest body inside the ~4KB push payload budget. */
export const MAX_DIGEST_ITEMS = 6;

export const APP_DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface LocalNow {
    date: string;     // YYYY-MM-DD in the user's timezone
    minutes: number;  // minutes since local midnight
}

function formatParts(timeZone: string, now: Date): Intl.DateTimeFormatPart[] {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
}

export function getLocalNow(timezone: string | null | undefined, now: Date): LocalNow {
    const tz = timezone?.trim() || APP_DEFAULT_TIMEZONE;
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = formatParts(tz, now);
    } catch {
        // Garbage timezone on the profile — fall back rather than skip the user
        // entirely, which would silently mute them forever.
        parts = formatParts(APP_DEFAULT_TIMEZONE, now);
    }

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
    };
}

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight; null when unparseable. */
export function timeToMinutes(time: string | null | undefined): number | null {
    if (!time) return null;
    const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
    if (!match) return null;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
}

export function toHHMM(time: string | null | undefined): string {
    return (time ?? '').trim().slice(0, 5);
}

/** True when `target` falls inside the current tick's eligibility window. */
export function inWindow(nowMinutes: number, target: number): boolean {
    return nowMinutes >= target && nowMinutes < target + WINDOW_MINUTES;
}

export function pillarOf(description: string | null | undefined): string | null {
    const match = /\[color:(teal|purple|orange|blue|pink)\]/i.exec(description ?? '');
    return match ? PILLAR_LABELS[match[1].toLowerCase()] ?? null : null;
}

export function isArchived(description: string | null | undefined): boolean {
    return (description ?? '').includes('[archived:true]');
}

/**
 * The moment the user's schedulable day begins — wake_time plus the morning
 * routine buffer, the same effectiveWakeTime the day generator uses. A missing
 * or zero buffer falls back to wake time exactly.
 */
export function digestTriggerMinutes(
    wakeTime: string | null | undefined,
    morningRoutineMin: number | null | undefined
): number | null {
    const wake = timeToMinutes(wakeTime);
    if (wake === null) return null;
    return wake + (morningRoutineMin || 0);
}

export interface DigestTodo {
    title: string;
    description?: string | null;
}

/**
 * Compose the digest body. Returns null when nothing is due — the caller must
 * send nothing at all rather than a "0 items" notification.
 */
export function composeDigestBody(todos: DigestTodo[]): string | null {
    if (!todos.length) return null;

    const listed = todos.slice(0, MAX_DIGEST_ITEMS).map(t => {
        const pillar = pillarOf(t.description);
        return pillar ? `${t.title} (${pillar})` : t.title;
    });
    const overflow = todos.length - listed.length;
    const itemText = listed.join(', ') + (overflow > 0 ? `, +${overflow} more` : '');
    const countText = `${todos.length} item${todos.length === 1 ? '' : 's'} due today`;

    return `${countText} — ${itemText}`;
}

export interface BlockLike {
    id: string;
    title?: string | null;
    block_type?: string | null;
    start_time: string;
    end_time: string;
    status?: string | null;
}

/** Title/body for a block alert, calendar-app style. */
export function composeBlockAlert(block: BlockLike): { title: string; body: string } {
    return {
        title: block.title || (block.block_type === 'anchor' ? 'Anchor' : 'Focus block'),
        body: `${toHHMM(block.start_time)} – ${toHHMM(block.end_time)}`,
    };
}

/**
 * A block is eligible when it is notifiable, live, and its lead time is now.
 *
 * Known edge: a block starting within `leadMins` of local midnight has a
 * negative target and so never alerts, because the lead time falls on the
 * previous calendar day and we only ever look at today's blocks. Left as-is
 * deliberately — goal/anchor blocks do not start at 00:0x, and handling it
 * would mean querying two days per user every tick.
 */
export function shouldAlertBlock(
    block: BlockLike,
    nowMinutes: number,
    leadMins: number
): boolean {
    if (!NOTIFIABLE_BLOCK_TYPES.includes(block.block_type ?? '')) return false;
    if (block.status === 'done' || block.status === 'missed') return false;

    const start = timeToMinutes(block.start_time);
    if (start === null) return false;

    return inWindow(nowMinutes, start - leadMins);
}
