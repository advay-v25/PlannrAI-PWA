/**
 * Next week is this week's schedule, shifted seven days — with only the blocks
 * the review specifically identifies touched, and NOTHING written to `goals`.
 *
 * Two things this replaces:
 *
 *  - Regenerating from scratch (Prompt 32). If the goals did not change, the
 *    schedule should not change. Re-solving a hard packing problem from nothing
 *    has no obligation to match an arrangement that was already working, and
 *    demonstrably produced less scheduled time and a 35-minute gym session at
 *    23:10 from the very same goals.
 *
 *  - Proportional resizing (the earlier carry-forward). Copying is copying:
 *    durations are never recomputed, so the 38-minute artefacts cannot recur.
 *
 * The weekly review suggests; the Goals page decides. A change made here lasts
 * for one week and no longer, which is why the confirm modal has to say so.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlockDraft } from './week-writer';
import { timeToMin, addDaysIso } from './week-writer';

/** Block types the generator rebuilds deterministically from the profile. */
export const BIO_TYPES = new Set(['sleep', 'meal', 'wind_down', 'routine']);

/** A block is "properly buffered" if it has at least this much clear air. */
export const HEALTHY_BUFFER_MINS = 10;

export type TriageBranch =
    | 'buffered_left_alone'
    | 'crowded_neighbours_moved'
    | 'overcommitted_shortened'
    | 'no_scheduling_cause';

export interface TriageNote {
    goal_id: string | null;
    title: string;
    date: string;
    time: string;
    branch: TriageBranch;
    reason: string;
}

export interface AcceptedChange {
    goal_id: string;
    change_type: string;
    new_minutes_per_day?: number;
    new_days_per_week?: number;
}

export interface WeekCopyResult {
    blocks: BlockDraft[];
    path: 'copy_forward' | 'full_generation';
    triage: TriageNote[];
    notes: string[];
    sourceWeekStart: string;
    /** Source hours vs copied hours — they should match. */
    sourceGoalMinutes: number;
    copiedGoalMinutes: number;
}

const minsToTime = (m: number) => {
    const c = Math.max(0, Math.min(1439, Math.round(m)));
    return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

const durationOf = (b: { start_time: string; end_time: string }) =>
    Math.max(0, timeToMin(b.end_time) - timeToMin(b.start_time));

/** Whole days between two Mondays; must be a positive multiple of 7. */
export function weekShiftDays(from: string, to: string): number {
    const d = Math.round(
        (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000
    );
    if (d <= 0 || d % 7 !== 0) {
        throw new Error(`Week copy needs a whole number of weeks between ${from} and ${to}, got ${d} days`);
    }
    return d;
}

/**
 * §3: what to do about a block the user missed, in order. Stops at the first
 * rule that applies.
 *
 * Rule 1 is the one worth stating out loud: a block that was properly scheduled
 * with buffers on both sides and still got missed is NOT a scheduling failure.
 * The schedule gave it every chance. Rescheduling it is noise and shrinking it
 * punishes the user for one bad day.
 */
export function triageMissedBlock(
    missed: { start_time: string; end_time: string; date: string; title: string; goal_id?: string | null },
    sameDayBlocks: Array<{ start_time: string; end_time: string; title: string }>,
    weekIsOvercommitted: boolean
): { branch: TriageBranch; reason: string } {
    const start = timeToMin(missed.start_time);
    const end = timeToMin(missed.end_time);

    let gapBefore = Infinity;
    let gapAfter = Infinity;
    for (const other of sameDayBlocks) {
        if (other === (missed as any)) continue;
        const oStart = timeToMin(other.start_time);
        const oEnd = timeToMin(other.end_time);
        if (oEnd <= start) gapBefore = Math.min(gapBefore, start - oEnd);
        if (oStart >= end) gapAfter = Math.min(gapAfter, oStart - end);
    }

    const buffered = gapBefore >= HEALTHY_BUFFER_MINS && gapAfter >= HEALTHY_BUFFER_MINS;
    if (buffered) {
        return {
            branch: 'buffered_left_alone',
            reason: `had ${gapBefore === Infinity ? 'open' : `${gapBefore}m`} before and ` +
                `${gapAfter === Infinity ? 'open' : `${gapAfter}m`} after — the schedule was fine, so it is left exactly where it is`,
        };
    }

    // Crowded. Fix the adjacency, not the block that got crowded out.
    const tight = Math.min(gapBefore, gapAfter);
    if (!weekIsOvercommitted) {
        return {
            branch: 'crowded_neighbours_moved',
            reason: `only ${tight}m of clear air on one side — keeping its time and length, moving the neighbouring block instead`,
        };
    }

    return {
        branch: 'overcommitted_shortened',
        reason: `crowded (${tight}m clear) in a week that genuinely cannot hold the hours — shortened in the calendar only, the goal is untouched`,
    };
}

/**
 * Copy `sourceWeekStart` forward to `targetWeekStart`.
 *
 * Goal blocks are copied VERBATIM. Bio blocks are not copied — the caller
 * regenerates them from the profile, which is deterministic and therefore
 * identical, and picks up profile edits.
 */
export async function copyWeekForward(args: {
    supabase: SupabaseClient;
    userId: string;
    sourceWeekStart: string;
    targetWeekStart: string;
    changes: AcceptedChange[];
    weekIsOvercommitted: boolean;
    /** Nothing may be scheduled at or after this minute. */
    windDownMins: number;
    wakeMins: number;
    /** The regenerated bio scaffolding for the target week — fixed points. */
    bioBlocks: BlockDraft[];
    /** Clear air a relocated block must leave on each side. */
    bufferMins: number;
}): Promise<Omit<WeekCopyResult, 'path'> & { usable: boolean }> {
    const { supabase, userId, sourceWeekStart, targetWeekStart, changes, weekIsOvercommitted,
            windDownMins, wakeMins, bioBlocks, bufferMins } = args;
    const notes: string[] = [];
    const triage: TriageNote[] = [];
    const shift = weekShiftDays(sourceWeekStart, targetWeekStart);
    if (shift !== 7) notes.push(`Copying ${shift / 7} weeks forward (${sourceWeekStart} → ${targetWeekStart}).`);

    const { data: source, error } = await supabase
        .from('schedule_blocks')
        .select('date, start_time, end_time, title, block_type, goal_id, pillar, checklist, status')
        .eq('user_id', userId)
        .gte('date', sourceWeekStart)
        .lte('date', addDaysIso(sourceWeekStart, 6))
        .order('date')
        .order('start_time');
    if (error) throw new Error(`Could not read the source week: ${error.message}`);

    const goalBlocks = (source || []).filter((b: any) => b.block_type === 'goal' && b.goal_id);
    if (goalBlocks.length === 0) {
        notes.push(`Week ${sourceWeekStart} has no goal blocks to copy — falling back to a full generation.`);
        return {
            blocks: [], triage, notes, sourceWeekStart,
            sourceGoalMinutes: 0, copiedGoalMinutes: 0, usable: false,
        };
    }

    // Prompt 38 §1: `reshape` is the only change there is. Nothing omits a
    // goal's blocks and nothing shortens them — the review may change WHEN and
    // HOW the hours are scheduled, never HOW MANY.
    const omitted = new Set<string>();
    const shorten = new Map<string, number>();
    const respace = new Set(changes.filter((c) => c.change_type === 'reshape').map((c) => c.goal_id));
    const ignored = changes.filter((c) => c.change_type !== 'reshape');
    if (ignored.length > 0) {
        notes.push(
            `Ignored ${ignored.length} change(s) of type ${[...new Set(ignored.map((c) => c.change_type))].join(', ')}: ` +
                `the weekly review only reshapes hours, it never removes them.`
        );
    }

    const byDate = new Map<string, any[]>();
    for (const b of source || []) {
        const list = byDate.get(b.date) || [];
        list.push(b);
        byDate.set(b.date, list);
    }

    const out: BlockDraft[] = [];
    let sourceGoalMinutes = 0;
    let copiedGoalMinutes = 0;

    for (const b of goalBlocks) {
        sourceGoalMinutes += durationOf(b);
        if (omitted.has(b.goal_id)) {
            triage.push({
                goal_id: b.goal_id, title: b.title, date: b.date,
                time: `${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}`,
                branch: 'no_scheduling_cause',
                reason: 'accepted pause — omitted from next week; the goal itself is unchanged',
            });
            continue;
        }

        let start = timeToMin(b.start_time);
        let mins = durationOf(b);

        const wasMissed = b.status === 'missed' || b.status === 'skipped';
        if (wasMissed) {
            const verdict = triageMissedBlock(b, byDate.get(b.date) || [], weekIsOvercommitted);
            triage.push({
                goal_id: b.goal_id, title: b.title, date: b.date,
                time: `${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}`,
                branch: verdict.branch, reason: verdict.reason,
            });
            // Rule 3 is the ONLY branch that changes this block, and only when
            // the review also accepted a reduction for it.
            if (verdict.branch === 'overcommitted_shortened' && shorten.has(b.goal_id)) {
                mins = Math.max(15, Math.min(mins, shorten.get(b.goal_id)!));
            }
        }

        // §4/§9: nothing lands at or after wind-down. A copied block cannot,
        // since it was legal last week — asserted rather than assumed.
        if (start + mins > windDownMins) {
            notes.push(
                `"${b.title}" on ${b.date} ${b.start_time.slice(0, 5)} would run past wind-down; not copied.`
            );
            continue;
        }

        copiedGoalMinutes += mins;
        out.push({
            date: addDaysIso(b.date, shift),
            start_time: minsToTime(start),
            end_time: minsToTime(start + mins),
            title: b.title,
            block_type: 'goal',
            goal_id: b.goal_id,
            pillar: b.pillar,
            checklist: b.checklist ?? null,
        });
    }

    // ── §3 rule 2 / §4: move the NEIGHBOUR, never the crowded block ──
    //
    // The missed block keeps its time and its length. What changes is the block
    // sitting on top of it, which is relocated to another window on the same
    // day — with the same buffers, and never past wind-down. Body blocks are
    // never the ones moved (Prompt 35: they are the rigid ones).
    const MAX_RELOCATIONS = 5;
    let relocations = 0;

    const crowded = triage.filter((t) => t.branch === 'crowded_neighbours_moved');
    for (const c of crowded) {
        if (relocations >= MAX_RELOCATIONS) break;
        const targetDate = addDaysIso(c.date, shift);
        const dayBlocks = out.filter((b) => b.date === targetDate);
        const fixed = bioBlocks.filter((b) => b.date === targetDate);

        const [cs, ce] = c.time.split('-').map((x) => timeToMin(x));
        // The neighbour is whichever block leaves less than a buffer's air.
        const neighbour = dayBlocks.find((b) => {
            if (b.goal_id === c.goal_id && timeToMin(b.start_time) === cs) return false;
            if (b.pillar === 'body') return false; // never move a body block
            const bs = timeToMin(b.start_time), be = timeToMin(b.end_time);
            const gap = be <= cs ? cs - be : bs >= ce ? bs - ce : -1;
            return gap >= 0 && gap < HEALTHY_BUFFER_MINS;
        });
        if (!neighbour) {
            notes.push(`"${c.title}" on ${targetDate}: nothing movable is crowding it — left as it is.`);
            continue;
        }

        const need = durationOf(neighbour);
        // Free windows on the day, with every other block padded by the buffer.
        const busy = [...dayBlocks, ...fixed]
            .filter((b) => b !== neighbour)
            .map((b) => ({ start: timeToMin(b.start_time) - bufferMins, end: timeToMin(b.end_time) + bufferMins }))
            .sort((a, b) => a.start - b.start);
        const free: Array<{ start: number; end: number }> = [];
        let cursor = wakeMins;
        for (const z of busy) {
            if (cursor < z.start) free.push({ start: cursor, end: Math.min(z.start, windDownMins) });
            cursor = Math.max(cursor, z.end);
            if (cursor >= windDownMins) break;
        }
        if (cursor < windDownMins) free.push({ start: cursor, end: windDownMins });

        const slot = free.find((w) => w.end - w.start >= need);
        if (!slot) {
            notes.push(
                `"${neighbour.title}" on ${targetDate} is crowding "${c.title}" but has nowhere else to go today — left as it is.`
            );
            continue;
        }

        const from = `${neighbour.start_time}-${neighbour.end_time}`;
        neighbour.start_time = minsToTime(slot.start);
        neighbour.end_time = minsToTime(slot.start + need);
        relocations++;
        notes.push(
            `Moved "${neighbour.title}" on ${targetDate} ${from} → ` +
                `${neighbour.start_time}-${neighbour.end_time} to open buffer space around "${c.title}" ` +
                `(which keeps its own time and length).`
        );
    }

    if (respace.size > 0) {
        notes.push(
            `${respace.size} goal(s) marked for respacing; their blocks keep their own times — ` +
                `crowding is fixed by moving neighbours, never by shrinking the block that was crowded out.`
        );
    }

    notes.push(`Copied ${out.length} goal block(s) verbatim from ${sourceWeekStart}.`);
    return { blocks: out, triage, notes, sourceWeekStart, sourceGoalMinutes, copiedGoalMinutes, usable: true };
}
