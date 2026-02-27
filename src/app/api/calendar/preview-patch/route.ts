// @ts-nocheck

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { CanonicalPatchSchema } from '@/lib/ai/schemas';
import { PatchService } from '@/lib/calendar/patch-service';
import { z } from 'zod';

const PreviewBodySchema = z.object({
    patch: CanonicalPatchSchema,
    range: z.object({
        start: z.string(),
        end: z.string()
    })
});

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        // 1. Validate
        const parsed = PreviewBodySchema.safeParse(body);
        if (!parsed.success) {
            return apiError('Invalid patch format', 400, parsed.error.format());
        }

        const { patch, range } = parsed.data;
        const userId = context.user?.id || context.userId;

        if (!userId) {
            return apiError('Unauthorized', 401);
        }

        const supabase = await createClient() as unknown as SupabaseClient<any, "public", any>;

        try {
            const result = await PatchService.preview(userId, patch, range, supabase);
            return apiSuccess(result);
        } catch (err: any) {
            console.error('[preview-patch] Failed:', err.message);
            return apiError(err.message || 'Preview failed', 400);
        }
    },
    { requireAuth: true }
);
