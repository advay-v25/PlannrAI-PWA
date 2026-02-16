
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { PatchService } from '@/lib/calendar/patch-service';
import { CanonicalPatchSchema } from '@/lib/ai/schemas';
import { z } from 'zod';

// We accept loosely typed body to allow normalization
const ApplyBodySchema = z.object({
    patch: z.any(),
    range: z.object({
        start: z.string(),
        end: z.string()
    }).optional() // Optional? PatchService needs it. If missing, we infer?
});

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        // 1. Validate Basic Structure
        const parsed = ApplyBodySchema.safeParse(body);
        if (!parsed.success) {
            return apiError('Invalid request format', 400, 'VALIDATION_ERROR', { issues: parsed.error.issues });
        }

        const { patch, range } = parsed.data;
        const userId = context.user?.id || context.userId;

        if (!userId) {
            return apiError('Unauthorized', 401);
        }

        // 2. Normalize
        let canonicalPatch;
        try {
            canonicalPatch = PatchService.normalize(patch);
        } catch (e: any) {
            return apiError('Invalid patch format: ' + e.message, 400);
        }

        // 3. Infer Range if missing (from patch ops?)
        // PatchService requires range for snapshotting.
        // We really should require range from client. 
        // If client doesn't send range, we default to "this week" based on patch dates?
        // Let's require range for now as per spec/previous usage?
        // Previous apply-patch didn't take range.
        // So we MUST infer it or fetch it.
        // Let's try to infer from ops if range is missing.

        let targetRange = range;
        if (!targetRange) {
            // Infer from ops
            const dates = canonicalPatch.changes
                .map(c => {
                    if (c.op === 'CREATE') return c.block.date;
                    if (c.op === 'MOVE') return c.new_date; // or existing block date?
                    // Update/Delete don't have date directly in Op, need block lookup.
                    // This is risky. 
                    // Safe fallback: Current Week?
                    return null;
                })
                .filter(Boolean) as string[];

            if (dates.length > 0) {
                dates.sort();
                targetRange = { start: dates[0], end: dates[dates.length - 1] };
                // Expand to week?
            } else {
                return apiError('Range required for patch application', 400);
            }
        }

        const supabase = await createClient() as unknown as SupabaseClient<any, "public", any>;

        try {
            const result = await PatchService.apply(userId, canonicalPatch, targetRange, supabase);

            if (!result.ok) {
                return apiError(result.error || 'Patch application failed', 500);
            }

            return apiSuccess(result);
        } catch (err: any) {
            console.error('[apply-patch] Failed:', err.message);
            return apiError(err.message || 'Apply failed', 500);
        }
    },
    { requireAuth: true }
);
