import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { PatchService } from '@/lib/services/patch-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { patch, optionId } = body as { patch: any, optionId?: string };
        const { userId } = context;

        if (!patch || !patch.ops) return apiError("Invalid patch", 400);

        try {
            const supabase = await createClient();

            // 1. Apply Patch via Unified PatchService
            const result = await PatchService.applyPatch(userId, patch, supabase, 'coach');

            // 2. Log the applied option
            if (optionId) {
                await supabase.from('coach_interactions').insert({
                    user_id: userId,
                    option_id: optionId,
                    action: 'apply',
                    patch_data: patch,
                    undo_token: result.undo_token,
                    created_at: new Date().toISOString()
                }).then(r => {
                    if (r.error) console.warn('[Coach Apply] Log failed:', r.error.message);
                });
            }

            return apiSuccess({
                success: result.success,
                undo_token: result.undo_token,
                changes: result.changes,
                errors: result.errors.length > 0 ? result.errors : undefined
            });

        } catch (e: any) {
            console.error("Coach Apply failed", e);
            return apiError(e.message, 500);
        }
    },
    { requireAuth: true }
);
