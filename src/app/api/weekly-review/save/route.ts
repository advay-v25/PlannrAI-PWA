import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['review']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { review } = body as { review: any };
        const supabase = await createClient();

        // Save review
        const { data, error } = await supabase
            .from('weekly_reviews')
            .upsert({
                user_id: context.userId,
                week_start: review.week_start,
                week_end: review.week_end,
                planned_minutes: review.planned_minutes,
                actual_minutes: review.actual_minutes,
                energy_trend: review.energy_trend,
                stress_trend: review.stress_trend,
                friction_patterns: review.friction_patterns,
                suggested_adjustment: review.suggested_adjustment,
                lever_action: review.lever_action,
                user_response: review.user_response || null
            }, {
                onConflict: 'user_id,week_start', // Note: schema says 'week_start', verify conflict target
            })
            .select()
            .single();

        if (error) {
            // Check conflict constraint name if error
            if (error.code === '23505') { // Unique violation
                // Retry with explicit conflict target?
                // Usually supabase upsert handles it if unique index creates constraint.
                // We defined 'user_id,week_start' constraint.
            }
            return apiError('Failed to save review', 500, error);
        }

        return apiSuccess({ review: data });
    },
    {
        requireAuth: true,
        auditAction: 'weekly_review_save',
    }
);
