import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { review } = body as { review: any };
        const { userId } = context;

        if (!review || !review.lever_action) return apiError("Invalid review data", 400);

        const supabase = await createClient();

        try {
            // 1. Upsert Review (save state)
            const { data: savedReview, error } = await supabase.from('weekly_reviews').upsert({
                user_id: userId,
                week_start: review.week_start,
                week_end: review.week_end,
                planned_minutes: review.planned_minutes,
                actual_minutes: review.actual_minutes,
                friction_patterns: review.friction_patterns,
                suggested_adjustment: review.suggested_adjustment,
                lever_action: review.lever_action,
                user_response: 'accepted',
                lever_note: review.lever_note,
                lever_applied: true,
                updated_at: new Date().toISOString()
            }).select().single();

            if (error) {
                if (error.message?.includes('could not find the') || error.code === 'PGRST204') {
                    throw new Error(`DB_SCHEMA_MISMATCH: ${error.message}`);
                }
                throw error;
            }

            // 2. Apply Lever Patch via PatchService (unified undo support)
            const patch = review.lever_action.patch || review.lever_action.payload;
            let undoToken: string | null = null;

            if (patch && patch.ops && patch.ops.length > 0) {
                const result = await PatchService.applyPatch(userId, patch, supabase, 'weekly_review');
                undoToken = result.undo_token;

                if (!result.success && result.errors.length > 0) {
                    console.warn('[WeeklyReview] Patch errors:', result.errors);
                }
            }

            return apiSuccess({
                success: true,
                review: savedReview,
                undo_token: undoToken
            });

        } catch (e: any) {
            console.error("[WeeklyReview] Apply failed", e);

            if (e.message?.includes('DB_SCHEMA_MISMATCH')) {
                return apiError('Database Schema Mismatch', 500, 'DB_SCHEMA_MISMATCH', {
                    details: e.message
                });
            }

            return apiError(e.message || "Failed to apply review", 500);
        }
    },
    { requireAuth: true }
);
