import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { CalendarPatchSchema } from '@/lib/agents/core/types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Input Schema
const ApplyPatchSchema = z.object({
    patch: CalendarPatchSchema,
    sourceType: z.enum(['brain_dump', 'weekly_review', 'coach', 'manual']),
    sourceId: z.string().optional()
});

export const POST = secureApiRoute(
    async (context, body) => {
        // Validation
        const validation = ApplyPatchSchema.safeParse(body);
        if (!validation.success) {
            return apiError(`Invalid patch format: ${validation.error.message}`);
        }

        const { patch, sourceType, sourceId } = validation.data;
        const userId = context.userId;

        console.log(`[API] Applying Patch for ${userId} from ${sourceType}`);

        // 1. Execute Changes (via Service)
        const { PatchService } = await import('@/lib/services/patch-service');
        const results = await PatchService.applyPatch(userId, patch);

        // 2. Mark Source as Applied (if applicable)
        // ... (Future: Update brain_dump status)

        // 3. Log Behavior Event (Action Taken)
        const { BehaviorService } = await import('@/lib/services/behavior-service');
        await BehaviorService.record(userId, {
            action_type: 'accept_suggestion',
            meta: {
                source: sourceType,
                summary: patch.summary,
                changes: results
            }
        });

        // 4. Log Patch Run (For Undo)
        // We log the run here so simpler Undo can access it.
        // We need an inverse patch.
        // For MVP, we pass null as inverse and assume Undo calculates it or we implement true inverse calc in Service later.
        // Or we rely on PatchService.applyPatch to return/log the run.
        // PatchService.logRun(userId, { patch, inverse_patch: null, source: sourceType });

        return apiSuccess({
            success: true,
            summary: `Applied: ${results.created} created, ${results.updated} updated, ${results.deleted} deleted.`,
            details: results
        });
    },
    { requireAuth: true, auditAction: 'apply_patch' }
);
