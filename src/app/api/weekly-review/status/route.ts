import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';
import { logReviewWindow, resolveReviewWindow, reviewDueDate, shiftIsoDate } from '@/lib/weekly-review/window';
import { serverNow } from '@/lib/weekly-review/server-gate';

/**
 * GET /api/weekly-review/status?weekStart=yyyy-MM-dd
 *
 * Prompt 54: the server's answer to "is the review open, and what is the
 * state of this week?". The page and the Monday prompt both render from THIS
 * rather than from the browser clock, so a clock-skewed client can never
 * open the review a day early or late — where the two disagree, the server
 * wins (§5).
 *
 * No AI here, ever. Three cheap Postgres reads at most.
 */
export interface WeekReviewInfo {
    week_start: string;
    week_end: string;
    is_current_week: boolean;
    is_future_week: boolean;
    is_last_week: boolean;
    /** The Monday this week's review opens (and closes). */
    review_due_date: string;
    /** §5 client gate: Monday AND last week AND not yet reviewed. */
    ai_allowed: boolean;
    reviewed: boolean;
    completed_at: string | null;
    user_response: string | null;
    lever_applied: boolean | null;
}

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        const params = context.request.nextUrl.searchParams;
        const requestedWeek = params.get('weekStart');

        const { data: profile } = await supabase
            .from('profiles')
            .select('timezone, onboarding_complete')
            .eq('id', userId)
            .maybeSingle();

        const win = resolveReviewWindow(serverNow(), profile?.timezone);
        logReviewWindow('status', win);

        // §2: the prompt's data conditions. Two indexed existence reads.
        const [lastWeekRow, priorData] = await Promise.all([
            supabase
                .from('weekly_reviews')
                .select('id')
                .eq('user_id', userId)
                .eq('week_start', win.last_monday)
                .maybeSingle(),
            supabase
                .from('schedule_blocks')
                .select('id')
                .eq('user_id', userId)
                .lt('date', win.this_monday)
                .limit(1),
        ]);

        const lastWeekReviewed = !!lastWeekRow?.data;
        const hasPriorWeekData = (priorData?.data?.length ?? 0) > 0;
        const onboardingComplete = profile?.onboarding_complete === true;
        const shouldPrompt = win.is_open && !lastWeekReviewed && hasPriorWeekData && onboardingComplete;

        let week: WeekReviewInfo | null = null;
        if (requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)) {
            // The generated types predate the schema-drift migration that added
            // user_response / lever_applied, so the row is typed by hand here.
            const { data: row } = (await supabase
                .from('weekly_reviews')
                .select('completed_at, user_response, lever_applied, created_at')
                .eq('user_id', userId)
                .eq('week_start', requestedWeek)
                .maybeSingle()) as {
                data: {
                    completed_at: string | null;
                    user_response: string | null;
                    lever_applied: boolean | null;
                    created_at: string | null;
                } | null;
            };

            const isLastWeek = requestedWeek === win.last_monday;
            const reviewed = !!row;
            week = {
                week_start: requestedWeek,
                week_end: shiftIsoDate(requestedWeek, 6),
                is_current_week: requestedWeek === win.this_monday,
                is_future_week: requestedWeek > win.this_monday,
                is_last_week: isLastWeek,
                review_due_date: reviewDueDate(requestedWeek),
                ai_allowed: win.is_open && isLastWeek && !reviewed,
                reviewed,
                completed_at: row?.completed_at ?? row?.created_at ?? null,
                user_response: row?.user_response ?? null,
                lever_applied: row?.lever_applied ?? null,
            };
        }

        return apiSuccess({
            window: win,
            onboarding_complete: onboardingComplete,
            has_prior_week_data: hasPriorWeekData,
            last_week_reviewed: lastWeekReviewed,
            should_prompt: shouldPrompt,
            week,
        });
    },
    { requireAuth: true }
);
