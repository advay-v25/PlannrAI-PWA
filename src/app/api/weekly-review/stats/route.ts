import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';
import { computeWeekStats, emptyWeekStats, defaultWeek } from '@/lib/chain/week-stats';

/**
 * GET /api/weekly-review/stats?weekStart=&weekEnd=
 *
 * Every deterministic number the Weekly Review page needs: metrics, the
 * Productivity Profile and the Day Chain, computed purely from Postgres.
 *
 * There is NO AI here and there must never be. The page that reads this route
 * previously lost an entire dashboard of good data whenever one LLM provider
 * timed out, because the stats and the narrative shared a request.
 *
 * This route is also written so it cannot return a 5xx: a Supabase failure
 * degrades to a well-formed, zeroed payload rather than a dead page.
 */
export const GET = secureApiRoute(
    async (context) => {
        const params = context.request.nextUrl.searchParams;
        const fallback = defaultWeek();
        const weekStart = params.get('weekStart') || fallback.weekStart;
        const weekEnd = params.get('weekEnd') || fallback.weekEnd;

        try {
            const stats = await computeWeekStats(context.supabase, context.userId, weekStart, weekEnd);
            return apiSuccess(stats);
        } catch (error: any) {
            // Interpolated, not a second console arg — Next's dev logger
            // renders extra args as `{}`.
            console.error(
                `[WeeklyReview/Stats] Falling back to empty stats: ${JSON.stringify({
                    code: error?.code,
                    message: error?.message,
                    details: error?.details,
                    hint: error?.hint,
                    weekStart,
                    weekEnd,
                })}`
            );
            return apiSuccess(emptyWeekStats(weekStart, weekEnd));
        }
    },
    { requireAuth: true }
);
