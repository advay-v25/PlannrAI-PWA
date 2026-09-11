import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';
import { chooseWeekMode } from '@/lib/scheduling/dry-run';
import { gateReviewWindow } from '@/lib/weekly-review/server-gate';

// Every accepted review now runs a full week AI generation (generateWeekPlan)
// after the goal writes, in series. 60s is the Vercel Hobby ceiling and matches
// generate-report.
export const maxDuration = 60;

/**
 * §6 belt-and-braces: two overlapping executions would generate next week
 * twice. `isExecuting` guards the button, but a double-submit that slips past
 * it must not double-plan. Keyed by user + reviewed week, 60s TTL.
 *
 * In-process rather than the suggested weekly_reviews check, because that row
 * only sets lever_applied when a goal actually changed — so it could never
 * cover the zero-proposal case, which is exactly the case this prompt adds.
 */
const recentRuns = new Map<string, { at: number; promise: Promise<any> }>();
const IDEMPOTENCY_MS = 60_000;

type ExecutionMode = 'auto' | 'semi-auto' | 'manual';

/**
 * Change types that write minutes/days on the goal.
 *
 * `update_time` and `update_days` are no longer generated — Prompt 28 replaced
 * the two shrinking levers with `redistribute` — but they stay accepted so a
 * page left open across the deploy submits a stale proposal and gets a 200
 * rather than a 400.
 */
/**
 * Prompt 38 §1: `reshape` is the only change the review can make. Legacy names
 * are still accepted so a page left open across the deploy gets a 200 with a
 * stated reason rather than a 400 — but nothing acts on them.
 */
const LEGACY_CHANGE_TYPES = new Set([
    'pause', 'delete', 'reduce', 'increase', 'redistribute', 'shift_window',
    'update_time', 'update_days',
]);

/** Every run of a weekly review has to leave a record, including a declined one. */
const RESPONSE_BY_MODE: Record<ExecutionMode, 'accepted' | 'partial' | 'ignored'> = {
    auto: 'accepted',
    'semi-auto': 'partial',
    manual: 'ignored',
};

export const POST = secureApiRoute(
    async (context, body) => {
        const { mode, changes = [], report, weekStart: requestedWeekStart } = (body as any) || {};
        const { userId, supabase } = context;

        if (!mode) return apiError('Missing execution mode', 400);
        if (!['auto', 'semi-auto', 'manual'].includes(mode)) {
            return apiError(`Unknown execution mode "${mode}"`, 400);
        }

        // Prompt 54 §5: this is the path that writes plans and records
        // decisions, so it is refused off-window and for any week other than
        // last week BEFORE the idempotency claim and before any write. A stale
        // Monday tab submitted on Thursday must change nothing.
        const gate = await gateReviewWindow(supabase, userId, 'execute', requestedWeekStart);
        if (!gate.ok) return gate.response;
        const weekStart = gate.weekStart;
        const weekEnd = gate.weekEnd;

        // §6: a duplicate submit for the same week returns the first result
        // rather than generating next week a second time.
        //
        // The claim is made BEFORE the work and holds a promise, not a finished
        // body — two genuinely concurrent requests both reach this point before
        // either has anything to record, so a claim written at the end catches
        // nothing and the week gets planned twice.
        const idempotencyKey = `${userId}:${weekStart || 'default'}`;
        const prior = recentRuns.get(idempotencyKey);
        if (prior && Date.now() - prior.at < IDEMPOTENCY_MS) {
            console.warn(
                `[WeeklyReview] Duplicate execute for ${idempotencyKey} — awaiting the first run instead of replanning.`
            );
            const firstBody = await prior.promise;
            return apiSuccess({ ...firstBody, idempotent: true });
        }

        const willPlan = mode === 'auto' || mode === 'semi-auto';
        let settleFirstRun: (body: any) => void = () => {};
        if (willPlan) {
            recentRuns.set(idempotencyKey, {
                at: Date.now(),
                promise: new Promise((resolve) => {
                    settleFirstRun = resolve;
                }),
            });
        }

        // 1. Process explicit goal changes (for both auto and semi-auto).
        // If mode is 'auto', `changes` contains every proposal from /stats.
        // If mode is 'semi-auto', only the ones the user ticked.
        //
        // Only goals named in `changes` are ever touched — there is no blanket
        // update anywhere in this route.
        // If anything below throws, waiters must not hang for the full TTL.
        const failSafe = setTimeout(() => {
            settleFirstRun({ success: false, mode, replanned: false, plan_error: 'Run did not complete.' });
            recentRuns.delete(idempotencyKey);
        }, maxDuration * 1000);

        const applied: any[] = [];
        const skipped: { goal_id: string; reason: string }[] = [];

        // §1: the weekly review NEVER writes to the `goals` table.
        //
        // Every accepted proposal used to become an `update_goal` op that ran
        // BEFORE the planner, so the review edited the user's targets to match a
        // schedule it was about to invent. Run it a few times and the Goals page
        // drifts away from what the user set.
        //
        // The Goals page is the source of truth; the calendar follows it, never
        // the reverse. Accepted changes are applied to `schedule_blocks` for the
        // target week only — see week-copy.ts. A change made here therefore
        // lasts one week and no longer, which the confirm modal now says.
        const requestedIds = [...new Set(changes.map((c: any) => c?.goal_id).filter(Boolean))] as string[];

        // Ownership is still verified: a stale proposal from a page left open
        // must not reach into a goal that is not the user's.
        const goalsById = new Map<string, any>();
        if (requestedIds.length > 0) {
            const { data: ownedGoals, error: goalsErr } = await supabase
                .from('goals')
                .select('id, title, is_paused, status, minutes_per_day, days_per_week')
                .eq('user_id', userId)
                .in('id', requestedIds);
            if (goalsErr) return apiError('Could not verify goals', 500);
            for (const g of ownedGoals || []) goalsById.set(g.id, g);
        }

        /** The only proposal type there is. */
        const CALENDAR_CHANGES = new Set(['reshape']);

        const calendarChanges: any[] = [];
        for (const change of changes) {
            const { goal_id, change_type } = change || {};
            if (!goal_id) continue;

            const goal = goalsById.get(goal_id);
            if (!goal) { skipped.push({ goal_id, reason: 'not found for this user' }); continue; }
            if (goal.is_paused || goal.status === 'archived') {
                skipped.push({ goal_id, reason: 'already paused or archived' });
                continue;
            }
            // Prompt 38 §1: the review may never reduce a goal's hours, so
            // pause/reduce/increase are not applicable changes at all. A stale
            // page sending one gets a clear reason rather than a silent drop.
            if (!CALENDAR_CHANGES.has(change_type)) {
                skipped.push({
                    goal_id,
                    reason: LEGACY_CHANGE_TYPES.has(change_type)
                        ? `"${change_type}" is no longer applied — the review only reshapes hours, never removes them`
                        : `unknown change_type "${change_type}"`,
                });
                continue;
            }
            calendarChanges.push(change);
            applied.push(change);
        }

        if (skipped.length > 0) {
            console.warn(`[WeeklyReview] Skipped ${skipped.length} change(s): ${JSON.stringify(skipped)}`);
        }

        // 2. Plan the week AHEAD.
        //
        // Gated on the MODE, not the op count. Accepting the review is itself
        // the decision to rebuild next week — a user who gets no goal edits, or
        // ticks nothing in semi-auto, still asked for a fresh week built on
        // their current goals. Manual never plans: "I'll handle it myself" and
        // silently rewriting their week would be the opposite of that.
        const shouldPlanNextWeek = willPlan;

        let replanned = false;
        let planError: string | null = null;
        let planSummary: {
            week_start: string;
            week_end: string;
            blocks_created: number;
            blocks_cleared: number;
            /** Concrete outcome for the user: how many of each block type landed. */
            blocks_by_type?: Record<string, number>;
            blocks_skipped?: any[];
            blocks_failed?: any[];
            /** §5: goals the week genuinely could not hold, and by how much. */
            goal_shortfalls?: Array<{
                goal_id: string; title: string; target_mins: number;
                placed_mins: number; short_by_mins: number; reason: string;
            }>;
        } | null = null;
        let planMode: 'balanced' | 'momentum' = 'balanced';
        let undoToken: string | null = null;

        if (shouldPlanNextWeek) {
            // §5: a tight week is planned in `momentum` — zero per-block buffers
            // and a higher per-day cap, which buys real room. A loose week keeps
            // `balanced`, because zero buffers on a half-empty week just means
            // back-to-back everything for no reason.
            //
            // Measured with the goal edits applied, since those are exactly what
            // changes how tight the week is. Explicit and logged, never implicit.
            // No overrides: the goals are not being changed, so the week's
            // tightness is measured exactly as it stands.
            const modeDecision = await chooseWeekMode(supabase, userId, {});
            planMode = modeDecision.mode;
            console.log(`[WeeklyReview] Planning next week in "${planMode}" mode — ${modeDecision.reason}`);

            // One op. There are no goal writes to sequence ahead of it any
            // more — the accepted changes ride in the payload as calendar edits.
            const patchResult = await PatchService.applyPatch(
                userId,
                {
                    ops: [
                        {
                            op: 'plan_current_week',
                            // The accepted changes now reach the plan HERE,
                            // as calendar edits — there is no goal write for
                            // them to travel through any more.
                            payload: {
                                mode: planMode,
                                allow_weekend: true,
                                changes: calendarChanges,
                            },
                        },
                    ],
                    scope: 'week',
                },
                supabase,
                'coach'
            );

            undoToken = patchResult.undo_token;

            // `patchResult.success` means "at least one op worked" — the loop
            // continues past a failure. Reporting that as `replanned` would
            // tell the user next week is ready when only the goal writes
            // landed. Derive it from the planning op itself.
            const planOp = (patchResult.op_results || []).find((r) => r.op === 'plan_current_week');

            if (!planOp) {
                planError = 'Planning did not run.';
            } else if (!planOp.ok) {
                planError = planOp.error || 'Planning failed.';
            } else {
                planSummary = planOp.data ?? null;
                const created = planSummary?.blocks_created ?? 0;
                if (created > 0) {
                    replanned = true;
                } else {
                    // An empty plan is a failure, not a success: every goal is
                    // paused, or the generator returned only bio blocks.
                    planError =
                        'The planner produced no blocks for next week — every goal may be paused.';
                }
                if (planSummary) {
                    console.log(
                        `[WeeklyReview] planned ${planSummary.week_start}..${planSummary.week_end}: ` +
                        `${planSummary.blocks_created} blocks ${JSON.stringify(planSummary.blocks_by_type || {})}`
                    );
                    if (planSummary.blocks_skipped?.length) {
                        console.error(
                            `[WeeklyReview] the writer dropped ${planSummary.blocks_skipped.length} ` +
                            `block(s) the planner had placed: ${JSON.stringify(planSummary.blocks_skipped)}`
                        );
                    }
                }
            }

            if (planError) {
                console.error(
                    `[WeeklyReview] plan_current_week did not complete: ${JSON.stringify({
                        planError,
                        calendar_changes: calendarChanges.length,
                        errors: patchResult.errors,
                    })}`
                );
            } else {
                console.log(
                    `[WeeklyReview] Next week planned: ${JSON.stringify(planSummary)}`
                );
            }
        }

        // 3. Persist the review. Until now, running a weekly review left no
        // record whatsoever — including when the user declined it, which is
        // itself a decision worth recording.
        let reviewSaved = false;
        if (weekStart && weekEnd) {
            try {
                const { error } = await supabase.from('weekly_reviews').upsert(
                    {
                        user_id: userId,
                        week_start: weekStart,
                        week_end: weekEnd,
                        planned_minutes: report?.metrics?.plannedMinutes ?? 0,
                        actual_minutes: report?.metrics?.completedMinutes ?? 0,
                        friction_patterns: report?.data?.struggles ?? [],
                        suggested_adjustment: report?.data?.summary ?? null,
                        lever_action: report?.data?.proposed_goal_changes ?? [],
                        user_response: RESPONSE_BY_MODE[mode as ExecutionMode],
                        lever_applied: applied.length > 0,
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id,week_start' }
                );

                if (error) throw error;
                reviewSaved = true;
            } catch (e: any) {
                // A bookkeeping failure must not undo goal changes we already made.
                console.error('[WeeklyReview] Failed to persist review:', e?.message || e);
            }
        }

        const responseBody = {
            success: true,
            mode,
            applied_changes: applied.length,
            skipped_changes: skipped.length,
            replanned,
            plan_error: planError,
            plan: planSummary,
            plan_mode: planMode,
            // §5: the user is told which goals the week could not hold, rather
            // than being handed a calendar with unexplained gaps.
            goal_shortfalls: planSummary?.goal_shortfalls ?? [],
            // §3: which triage branch fired for every missed block.
            triage: (planSummary as any)?.triage ?? [],
            path: (planSummary as any)?.path ?? null,
            goals_written: 0, // §1: always zero. The review never edits goals.
            blocks_dropped: planSummary?.blocks_skipped ?? [],
            undo_token: undoToken,
            review_saved: reviewSaved,
        };

        // Release anyone waiting on this run's result.
        clearTimeout(failSafe);
        settleFirstRun(responseBody);

        return apiSuccess(responseBody);
    },
    { requireAuth: true, rateLimit: 'aiWeeklyReview', auditAction: 'weekly_review_execute' }
);
