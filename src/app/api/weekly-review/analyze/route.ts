import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { WeeklyReviewAI } from '@/lib/ai/WeeklyReviewAI';

export const maxDuration = 60;


export const POST = secureApiRoute(
    async (context, bodyData) => {
        const { userId, supabase } = context;

        const { week_start, week_end } = (bodyData as any) || {};

        if (!week_start || !week_end) {
            return apiError('Missing week_start or week_end', 400);
        }

        const processor = new WeeklyReviewAI(userId);
        const result = await processor.analyze(week_start, week_end);

        // Save to weekly_review_data for persistence during the flow
        await supabase.from('weekly_review_data').insert({
            user_id: userId,
            week_start,
            metrics: result.metrics,
            patterns: result.patterns,
            lever: result.lever
        });

        return apiSuccess(result);
    },
    { requireAuth: true, rateLimit: 'aiWeeklyReview' }
);
