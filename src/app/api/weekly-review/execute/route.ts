import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';

export const maxDuration = 45;

type ExecutionMode = 'auto' | 'semi-auto' | 'manual';

/** Every run of a weekly review has to leave a record, including a declined one. */
const RESPONSE_BY_MODE: Record<ExecutionMode, 'accepted' | 'partial' | 'ignored'> = {
    auto: 'accepted',
    'semi-auto': 'partial',
    manual: 'ignored',
};

export const POST = secureApiRoute(
    async (context, body) => {
        const { mode, changes = [], report, weekStart, weekEnd } = (body as any) || {};
        const { userId, supabase } = context;

        if (!mode) return apiError('Missing execution mode', 400);
        if (!['auto', 'semi-auto', 'manual'].includes(mode)) {
            return apiError(`Unknown execution mode "${mode}"`, 400);
        }

        // 1. Process explicit goal changes (for both auto and semi-auto).
        // If mode is 'auto', `changes` contains every proposal from /stats.
        // If mode is 'semi-auto', only the ones the user ticked.
        //
        // Only goals named in `changes` are ever touched — there is no blanket
        // update anywhere in this route.
        const applied: any[] = [];
        const skipped: { goal_id: string; reason: string }[] = [];
        // Goal edits go through PatchService as ops rather than direct writes,
        // so the inverse patch covers them and one Undo restores BOTH the goals
        // and the schedule.
        const goalOps: any[] = [];

        // Clamp so a malformed proposal can never write a target the scheduler
        // will then try to satisfy.
        const clampMinutes = (n: number) => Math.min(480, Math.max(10, Math.round(n)));
        const clampDays = (n: number) => Math.min(7, Math.max(1, Math.round(n)));

        const requestedIds = [...new Set(changes.map((c: any) => c?.goal_id).filter(Boolean))] as string[];

        // Re-verify ownership and current state in one query. A stale proposal
        // from a page left open must not resurrect or re-pause a goal.
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

        for (const change of changes) {
            const { goal_id, change_type, new_minutes_per_day, new_days_per_week } = change || {};
            if (!goal_id) continue;

            const goal = goalsById.get(goal_id);
            if (!goal) {
                skipped.push({ goal_id, reason: 'not found for this user' });
                continue;
            }
            if (goal.is_paused || goal.status === 'archived') {
                skipped.push({ goal_id, reason: 'already paused or archived' });
                continue;
            }

            if (change_type === 'pause') {
                goalOps.push({ op: 'update_goal', goal_id, fields: { is_paused: true } });
                applied.push(change);
            } else if (change_type === 'delete') {
                // Never hard-delete. Automatic mode can apply a change the user
                // never saw proposed, and destroying a goal on that basis is
                // unrecoverable — pause and archive instead. (Nothing proposes
                // `delete` any more; this stays as a guard for stale payloads.)
                goalOps.push({ op: 'update_goal', goal_id, fields: { is_paused: true, status: 'archived' } });
                applied.push(change);
            } else if (change_type === 'update_time' || change_type === 'update_days') {
                const updates: any = {};
                if (typeof new_minutes_per_day === 'number' && Number.isFinite(new_minutes_per_day)) {
                    updates.minutes_per_day = clampMinutes(new_minutes_per_day);
                }
                if (typeof new_days_per_week === 'number' && Number.isFinite(new_days_per_week)) {
                    updates.days_per_week = clampDays(new_days_per_week);
                }

                if (Object.keys(updates).length > 0) {
                    goalOps.push({ op: 'update_goal', goal_id, fields: updates });
                    applied.push({ ...change, applied_values: updates });
                } else {
                    skipped.push({ goal_id, reason: 'no usable numeric value' });
                }
            } else {
                skipped.push({ goal_id, reason: `unknown change_type "${change_type}"` });
            }
        }

        if (skipped.length > 0) {
            console.warn(`[WeeklyReview] Skipped ${skipped.length} change(s): ${JSON.stringify(skipped)}`);
        }

        // 2. Plan the week AHEAD — only when something actually changed.
        //
        // This used to fire `replan_week`, which rewrites the week the user is
        // currently living in and, run on a Sunday, deleted next week without
        // inserting anything. A weekly review looks back at a finished week and
        // sets up the one ahead, so `plan_next_week` is the correct semantic.
        let replanned = false;
        let undoToken: string | null = null;
        if (goalOps.length > 0) {
            // Goal edits first, so the generated plan reflects the new targets.
            const patchResult = await PatchService.applyPatch(
                userId,
                {
                    ops: [...goalOps, { op: 'plan_next_week', payload: { mode: 'balanced', allow_weekend: true } }],
                    scope: 'week',
                },
                supabase,
                'coach'
            );
            replanned = patchResult.success;
            undoToken = patchResult.undo_token;
            if (!patchResult.success) {
                console.error(`[WeeklyReview] apply failed: ${JSON.stringify(patchResult.errors)}`);
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

        return apiSuccess({
            success: true,
            mode,
            applied_changes: applied.length,
            skipped_changes: skipped.length,
            replanned,
            undo_token: undoToken,
            review_saved: reviewSaved,
        });
    },
    { requireAuth: true, rateLimit: 'aiWeeklyReview', auditAction: 'weekly_review_execute' }
);
