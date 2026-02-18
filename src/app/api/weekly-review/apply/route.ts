
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { review } = body as { review: any };
        const { userId } = context;

        if (!review || !review.lever_action) return apiError("Invalid review data", 400);

        const supabase = await createClient();

        try {
            // 1. Upsert Review (Save State)
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
                lever_applied: true, // We are applying it now
                updated_at: new Date().toISOString()
            }).select().single();

            if (error) {
                // Check for schema mismatch specifically
                if (error.message?.includes('could not find the') || error.code === 'PGRST204') {
                    throw new Error(`DB_SCHEMA_MISMATCH: ${error.message}`);
                }
                throw error;
            }

            // 2. Apply Patch (Lever)
            const patch = review.lever_action.payload || review.lever_action.patch;
            if (patch) {
                // Use the internal patch API or service to ensure consistency
                // We'll manually execute strict ops here as a fallback or if PatchService isn't importable
                // Ideally: await PatchService.applyPatch(userId, patch, 'weekly_review');

                // For now, implementing the documented "apply" logic directly for robustness
                const ops = patch.ops || [];
                for (const op of ops) {
                    if (op.op === 'update_goal') {
                        await supabase.from('goals').update(op.fields).eq('id', op.goal_id).eq('user_id', userId);
                    } else if (op.op === 'update_settings') {
                        await supabase.from('profiles').update(op.fields).eq('id', userId);
                    } else if (op.op === 'create_block' || op.op === 'create_event') {
                        const payload = op.payload || op.event;
                        await supabase.from('schedule_blocks').insert({
                            user_id: userId,
                            ...payload,
                            status: 'planned'
                        });
                    }
                }
            }

            return apiSuccess({ success: true, review: savedReview });

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
