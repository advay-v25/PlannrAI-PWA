/**
 * The ONE place a planned week is written to the database.
 *
 * There used to be two: `apply-schedule/route.ts` (the Plan Week button) and a
 * hand-rolled delete/insert inside `plan_next_week` (the weekly review). They
 * diverged, as two implementations of the same job always do — the weekly
 * review's copy dropped every sleep/meal/wind-down block on the floor, never
 * ran the commitment-overlap filter, never enforced per-goal daily limits, and
 * never normalised block types or pillars. The calendar it produced was missing
 * half a day.
 *
 * Everything that decides WHAT a week contains stays with the caller. This
 * module only decides how it reaches Postgres.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

export type WriteAction = 'plan_week' | 'weekly_review' | 'optimize_day' | 'replan' | 'manual';

/**
 * Actions whose clear step is allowed to delete anything not locked.
 *
 * ONLY direct user edits. Every planner-driven action must take the preserving
 * branch — `manual` is the natural-looking choice for a coach replan and it
 * would quietly let one delete anchors and finished work.
 */
const UNRESTRICTED_ACTIONS: ReadonlySet<WriteAction> = new Set<WriteAction>(['manual']);

export interface BlockDraft {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    block_type: string;
    goal_id?: string | null;
    pillar?: string | null;
    checklist?: any;
    status?: string;
    is_locked?: boolean;
    is_fixed?: boolean;
    commitment_id?: string | null;
    source?: string | null;
    meta?: any;
}

/** A block that did not make it in, and why. These used to be console.log only. */
export interface SkippedBlock {
    title: string;
    date: string;
    start_time: string;
    reason: string;
}

export interface WeekWriteResult {
    added: number;
    updated: number;
    removed: number;
    /** Reported, not merely logged — the caller can now tell the user. */
    skipped: SkippedBlock[];
    /** Rows the database itself rejected, per row rather than per batch. */
    failed: Array<{ title: string; date: string; error: string }>;
    version_id: string | null;
}

export interface WriteWeekOptions {
    userId: string;
    supabase: SupabaseClient;
    action: WriteAction;
    /** Inclusive date window to clear before inserting. */
    clearRange?: { start: string; end: string } | null;
    /** Nothing on or before this date may be deleted. */
    notBefore?: string | null;
    add?: BlockDraft[];
    update?: Array<{ id: string; changes: Record<string, any> }>;
    remove?: string[];
    /**
     * On for every planner-driven write. Off only for a caller that has
     * already resolved its blocks against the target week's commitments.
     */
    filterCommitmentOverlaps?: boolean;
    enforceGoalDailyLimits?: boolean;
    /** Snapshot for undo. Off when the caller records its own version. */
    snapshot?: boolean;
    /**
     * §4: the day the plan is being generated (D), as YYYY-MM-DD in the user's
     * timezone. Completion marks survive only on blocks that already existed on
     * days BEFORE this; everything from this day onward is written unmarked,
     * whatever it was before. Defaults to today in the app timezone.
     */
    markCutoffDate?: string;
}

/** Statuses that represent a real completion judgement, not planner scratch state. */
const COMPLETION_MARKS = new Set(['done', 'in_progress', 'missed', 'incomplete', 'skipped']);

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    timeToMin(aStart) < timeToMin(bEnd) && timeToMin(aEnd) > timeToMin(bStart);

/** Rows are inserted in chunks so one bad row cannot cost the whole week. */
const INSERT_CHUNK = 100;

export const ALLOWED_BLOCK_TYPES = [
    'anchor',
    'goal',
    'meal',
    'buffer',
    'routine',
    'sleep',
    'wind_down',
    'flex',
] as const;

const BLOCK_TYPE_ALIASES: Record<string, string> = {
    focus: 'goal', body: 'goal', mind: 'goal', craft: 'goal',
    task: 'flex', break: 'buffer', free: 'buffer', transition: 'buffer',
    exercise: 'goal', work: 'goal', deep_work: 'goal',
    admin: 'flex', personal: 'flex',
};

/** Maps generator block_type values onto the DB's check constraint. */
export function normalizeBlockType(type: string): string {
    if ((ALLOWED_BLOCK_TYPES as readonly string[]).includes(type)) return type;
    return BLOCK_TYPE_ALIASES[type] || 'flex';
}

/** Lowercases and validates a pillar; an invalid one becomes null, not a 500. */
export function normalizePillar(pillar: string | null | undefined): string | null {
    if (!pillar) return null;
    const lower = String(pillar).toLowerCase();
    return ['mind', 'body', 'craft', 'soul'].includes(lower) ? lower : null;
}

export const timeToMin = (t: string): number => {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

export function addDaysIso(date: string, days: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

export async function writeWeek(opts: WriteWeekOptions): Promise<WeekWriteResult> {
    const {
        userId,
        supabase,
        action,
        clearRange = null,
        notBefore = null,
        add = [],
        update = [],
        remove = [],
        filterCommitmentOverlaps = true,
        enforceGoalDailyLimits = true,
        snapshot = true,
        markCutoffDate = nowInTimezone(DEFAULT_TIMEZONE).date,
    } = opts;

    // §4: blocks on days before the generation day that carry a real completion
    // mark. These are preserved as-is and never re-created, so their marks
    // survive a regeneration while nothing new inherits one.
    const preservedMarked: Array<{ id: string; date: string; start_time: string; end_time: string; goal_id: string | null; status: string; title: string }> = [];
    if (clearRange) {
        const { data: marked } = await supabase
            .from('schedule_blocks')
            .select('id, date, start_time, end_time, goal_id, status, title')
            .eq('user_id', userId)
            .gte('date', clearRange.start)
            .lt('date', markCutoffDate)
            .in('status', [...COMPLETION_MARKS]);
        for (const m of marked || []) preservedMarked.push(m as any);
        if (preservedMarked.length > 0) {
            console.log(
                `[WeekWriter] §4: preserving ${preservedMarked.length} marked block(s) before ${markCutoffDate} ` +
                    `(${[...new Set(preservedMarked.map((m) => m.status))].join(', ')})`
            );
        }
    }

    const result: WeekWriteResult = {
        added: 0, updated: 0, removed: 0, skipped: [], failed: [], version_id: null,
    };

    // ── 1. Undo snapshot ─────────────────────────────────────────────
    if (snapshot) {
        try {
            const from = clearRange?.start || new Date().toISOString().split('T')[0];
            const { data: rows } = await supabase
                .from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', from)
                .lte('date', addDaysIso(from, 13));

            const { data: version } = await supabase
                .from('schedule_versions')
                .insert({
                    user_id: userId,
                    snapshot: rows || [],
                    trigger_action: action,
                    created_at: new Date().toISOString(),
                })
                .select('id')
                .single();
            result.version_id = version?.id || null;
        } catch (e) {
            console.warn('[WeekWriter] Snapshot failed, continuing:', e);
        }
    }

    // ── 2. Clear the window ──────────────────────────────────────────
    //
    // Selected then filtered in JS rather than expressed as a PostgREST `.or`
    // chain. The chain in apply-schedule reads as "keep anchors and completed
    // work" but `.or(...)` ORs across the whole clause, so its lock check was
    // easy to get subtly wrong — and `plan_next_week`'s hand-rolled version
    // filtered on `is_locked` without selecting it, so the check never fired.
    // Rows in the target window, and the ids the clear step removed — together
    // these give §1's overlap check the set of blocks still standing on each
    // day, which new rows must not collide with.
    let inRangeRows: any[] = [];
    const clearedIds = new Set<string>();

    if (clearRange) {
        const { data: inRange, error: selErr } = await supabase
            .from('schedule_blocks')
            // start/end/title are here for §1's overlap check, which needs the
            // blocks that SURVIVE this clear step, not just the ones removed.
            .select('id, date, start_time, end_time, title, block_type, status, is_locked')
            .eq('user_id', userId)
            .gte('date', clearRange.start)
            .lte('date', clearRange.end);

        if (selErr) throw new Error(`WeekWriter could not read the target window: ${selErr.message}`);

        inRangeRows = inRange || [];
        const ids = (inRange || [])
            .filter((b: any) => {
                if (notBefore && b.date <= notBefore) return false;
                if (b.is_locked) return false;
                // §4: a completion mark on a day BEFORE the generation day is a
                // record of what actually happened. Never delete it, whatever
                // the action — otherwise a regeneration silently erases the
                // user's history for the earlier part of the week.
                if (b.date < markCutoffDate && COMPLETION_MARKS.has(b.status)) return false;
                if (UNRESTRICTED_ACTIONS.has(action)) return true;
                // No planner-driven action may discard anchors.
                if (b.block_type === 'anchor') return false;
                // §4: finished work is spared ONLY in the past. This check used
                // to be unconditional, so a block marked done on a FUTURE date
                // survived every subsequent regeneration, permanently — which is
                // how Saturday and Sunday came to show ✓ DONE days before they
                // happened. A completion mark on a future day is meaningless;
                // the block is cleared and regenerated unmarked like any other.
                // (The past-day case is already handled above, before this.)
                if (b.date < markCutoffDate && (b.status === 'done' || b.status === 'in_progress')) return false;
                return true;
            })
            .map((b: any) => b.id);
        for (const id of ids) clearedIds.add(id);

        if (ids.length > 0) {
            const { error: delErr, count } = await supabase
                .from('schedule_blocks')
                .delete({ count: 'exact' })
                .eq('user_id', userId)
                .in('id', ids);
            if (delErr) throw new Error(`WeekWriter failed to clear the window: ${delErr.message}`);
            result.removed += count ?? ids.length;
        }
        console.log(
            `[WeekWriter] Cleared ${result.removed} of ${inRange?.length || 0} blocks in ` +
                `${clearRange.start}..${clearRange.end} (action=${action})`
        );
    }

    // ── 3. Explicit removals ─────────────────────────────────────────
    if (remove.length > 0) {
        const { count } = await supabase
            .from('schedule_blocks')
            .delete({ count: 'exact' })
            .eq('user_id', userId)
            .in('id', remove);
        result.removed += count || 0;
    }

    // ── 4. Updates ───────────────────────────────────────────────────
    for (const upd of update) {
        const { error } = await supabase
            .from('schedule_blocks')
            .update(upd.changes)
            .eq('id', upd.id)
            .eq('user_id', userId);
        if (!error) result.updated++;
        else result.failed.push({ title: upd.id, date: '', error: error.message });
    }

    if (add.length === 0) return result;

    // ── 5. Commitment-overlap filter ─────────────────────────────────
    let candidates = add;
    const targetDates = [...new Set(add.map((b) => b.date).filter(Boolean))];

    if (filterCommitmentOverlaps && targetDates.length > 0) {
        const { data: cmts } = await supabase
            .from('commitments')
            .select('id, title, start_time, end_time, days_of_week')
            .eq('user_id', userId)
            .eq('is_active', true);

        candidates = candidates.filter((b) => {
            // An anchor IS the commitment; it must never be filtered as an
            // overlap with itself.
            if (b.block_type === 'anchor') return true;
            if (!b.start_time || !b.end_time || !b.date) return true;
            const bStart = timeToMin(b.start_time);
            const bEnd = timeToMin(b.end_time);
            const dow = new Date(`${b.date}T12:00:00`).getDay();
            for (const c of cmts || []) {
                if (c.days_of_week && !c.days_of_week.includes(dow)) continue;
                if (bStart < timeToMin(c.end_time) && bEnd > timeToMin(c.start_time)) {
                    result.skipped.push({
                        title: b.title, date: b.date, start_time: b.start_time,
                        reason: `overlaps commitment "${c.title}" (${c.start_time}-${c.end_time})`,
                    });
                    return false;
                }
            }
            return true;
        });
    }

    // ── 6. Per-goal daily minute limits ──────────────────────────────
    if (enforceGoalDailyLimits && targetDates.length > 0) {
        const { data: userGoals } = await supabase
            .from('goals')
            .select('id, title, minutes_per_day')
            .eq('user_id', userId)
            .eq('status', 'active');

        const limits = new Map<string, number>();
        for (const g of userGoals || []) limits.set(g.id, g.minutes_per_day || 60);

        const alreadyByDateGoal = new Map<string, number>();
        const { data: existing } = await supabase
            .from('schedule_blocks')
            .select('date, goal_id, start_time, end_time')
            .eq('user_id', userId)
            .in('date', targetDates)
            .not('goal_id', 'is', null);
        for (const eb of existing || []) {
            const key = `${eb.date}|${eb.goal_id}`;
            alreadyByDateGoal.set(
                key,
                (alreadyByDateGoal.get(key) || 0) + Math.max(0, timeToMin(eb.end_time) - timeToMin(eb.start_time))
            );
        }

        const batchByDateGoal = new Map<string, number>();
        candidates = candidates.filter((b) => {
            if (!b.goal_id || !limits.has(b.goal_id)) return true;
            const key = `${b.date}|${b.goal_id}`;
            const limit = limits.get(b.goal_id)!;
            const mins = Math.max(0, timeToMin(b.end_time) - timeToMin(b.start_time));
            const total = (alreadyByDateGoal.get(key) || 0) + (batchByDateGoal.get(key) || 0) + mins;
            if (total > limit) {
                // §4: the planner is supposed to respect `minutes_per_day`
                // itself. Anything reaching here is a PLANNER bug, not routine
                // filtering — it means the writer is silently deleting work the
                // planner deliberately placed, leaving a hole in the calendar
                // and a success message on the screen.
                console.error(
                    `[WeekWriter] PLANNER BUG — dropping "${b.title}" on ${b.date} ${b.start_time}: ` +
                        `goal ${b.goal_id} would reach ${total}min today against its ${limit}min/day limit ` +
                        `(${alreadyByDateGoal.get(key) || 0}m already on the day, ` +
                        `${batchByDateGoal.get(key) || 0}m earlier in this batch, ${mins}m in this block)`
                );
                result.skipped.push({
                    title: b.title, date: b.date, start_time: b.start_time,
                    reason: `would put ${total}min on this goal today (limit ${limit}min/day)`,
                });
                return false;
            }
            batchByDateGoal.set(key, (batchByDateGoal.get(key) || 0) + mins);
            return true;
        });
    }

    // ── 6a. §4: don't re-create a block that was preserved for its mark ──
    //
    // Identity is (goal_id, date, overlapping time) — not row id, since a
    // regeneration produces entirely new rows. Without this the preserved
    // marked block and its freshly planned twin would both land on the day.
    if (preservedMarked.length > 0) {
        candidates = candidates.filter((b) => {
            const twin = preservedMarked.find(
                (m) =>
                    m.date === b.date &&
                    (m.goal_id || null) === (b.goal_id || null) &&
                    overlaps(b.start_time, b.end_time, m.start_time, m.end_time)
            );
            if (!twin) return true;
            result.skipped.push({
                title: b.title, date: b.date, start_time: b.start_time,
                reason: `already exists and is marked "${twin.status}" — keeping the existing block`,
            });
            return false;
        });
    }

    // ── 6b. Reject malformed rows outright ───────────────────────────
    //
    // This used to rewrite any block whose end was not after its start to
    // '23:59:59'. That converted a visible bug — a block rendering as
    // "15:30–" with no end — into a plausible-looking wrong answer: a block
    // silently running to midnight. A malformed block is a planner bug and
    // must be refused, not repaired.
    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    candidates = candidates.filter((b) => {
        const badStart = !b.start_time || !TIME_RE.test(b.start_time);
        const badEnd = !b.end_time || !TIME_RE.test(b.end_time);
        const notOrdered = !badStart && !badEnd && timeToMin(b.end_time) <= timeToMin(b.start_time);
        if (!badStart && !badEnd && !notOrdered) return true;

        const detail = badStart
            ? `invalid start_time ${JSON.stringify(b.start_time)}`
            : badEnd
                ? `invalid end_time ${JSON.stringify(b.end_time)}`
                : `end_time ${b.end_time} is not after start_time ${b.start_time}`;
        console.error(
            `[WeekWriter] PLANNER BUG — rejecting "${b.title}" on ${b.date}: ${detail}. ` +
                `Refusing to write it (this used to be rewritten to 23:59:59).`
        );
        result.skipped.push({
            title: b.title, date: b.date, start_time: b.start_time,
            reason: `malformed block: ${detail}`,
        });
        return false;
    });

    // ── 6c. §1: reject overlapping rows ──────────────────────────────
    //
    // Nothing on the write path ever asked whether two blocks occupied the same
    // time, so `Gym 09:30–11:30` and `PlannrAI 09:30–10:30` on one Monday was
    // not the planner making a mistake so much as nothing checking that it had
    // not. Candidates are checked against each other AND against the rows that
    // survived the clear step (anchors, past completions), since those are
    // still on the day.
    {
        const survivors = inRangeRows
            .filter((b: any) => !clearedIds.has(b.id) && b.start_time && b.end_time)
            .map((b: any) => ({
                date: b.date, start_time: b.start_time, end_time: b.end_time, title: b.title,
            }));
        const accepted: Array<{ date: string; start_time: string; end_time: string; title: string }> = [...survivors];
        candidates = candidates.filter((b) => {
            const clash = accepted.find(
                (a) => a.date === b.date && overlaps(b.start_time, b.end_time, a.start_time, a.end_time)
            );
            if (clash) {
                console.error(
                    `[WeekWriter] PLANNER BUG — rejecting "${b.title}" on ${b.date} ` +
                        `${b.start_time}–${b.end_time}: overlaps "${clash.title}" ` +
                        `${clash.start_time}–${clash.end_time}. Refusing to write an overlapping row.`
                );
                result.skipped.push({
                    title: b.title, date: b.date, start_time: b.start_time,
                    reason: `overlaps "${clash.title}" (${clash.start_time}–${clash.end_time})`,
                });
                return false;
            }
            accepted.push({ date: b.date, start_time: b.start_time, end_time: b.end_time, title: b.title });
            return true;
        });
    }

    // ── 7. Insert, in chunks, falling back to per-row ────────────────
    const rows = candidates.map((b) => {
        const end = b.end_time;
        return {
            user_id: userId,
            date: b.date,
            start_time: b.start_time,
            end_time: end,
            title: b.title,
            block_type: normalizeBlockType(b.block_type || 'flex'),
            pillar: normalizePillar(b.pillar),
            goal_id: b.goal_id || null,
            checklist: b.checklist ?? null,
            // §4: a newly created block never carries a completion mark —
            // not on an earlier day (it did not exist to be completed) and
            // never from the generation day onward, whatever it arrived with.
            status: COMPLETION_MARKS.has(b.status || '') ? 'planned' : (b.status || 'planned'),
            ...(b.is_locked !== undefined ? { is_locked: b.is_locked } : {}),
            ...(b.is_fixed !== undefined ? { is_fixed: b.is_fixed } : {}),
            ...(b.commitment_id ? { commitment_id: b.commitment_id } : {}),
            ...(b.source ? { source: b.source } : {}),
            ...(b.meta ? { meta: b.meta } : {}),
        };
    });

    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const { data, error } = await supabase.from('schedule_blocks').insert(chunk).select('id');
        if (!error) {
            result.added += data?.length || 0;
            continue;
        }
        // One malformed row used to fail the entire week and return added: 0
        // with the error only in the log. Retry the chunk row by row so the
        // rest of the week still lands and the bad rows are named.
        console.error(`[WeekWriter] Chunk insert failed (${chunk.length} rows): ${error.message} — retrying individually`);
        for (const row of chunk) {
            const { error: rowErr } = await supabase.from('schedule_blocks').insert(row);
            if (rowErr) result.failed.push({ title: row.title, date: row.date, error: rowErr.message });
            else result.added++;
        }
    }

    if (result.skipped.length > 0) {
        console.warn(
            `[WeekWriter] Skipped ${result.skipped.length} block(s): ` +
                JSON.stringify(result.skipped.slice(0, 10))
        );
    }
    if (result.failed.length > 0) {
        console.error(`[WeekWriter] ${result.failed.length} row(s) rejected: ${JSON.stringify(result.failed.slice(0, 5))}`);
    }
    console.log(
        `[WeekWriter] ${action}: +${result.added} ~${result.updated} -${result.removed} ` +
            `(skipped ${result.skipped.length}, failed ${result.failed.length})`
    );

    return result;
}
