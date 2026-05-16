// @ts-nocheck

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { PatchService } from '@/lib/calendar/patch-service';
import { addDays, format, parseISO } from 'date-fns';
import { z } from 'zod';

const UndoBodySchema = z.object({
    token: z.string().optional(), // Direct patch_run ID returned by coach apply
    version_id: z.string().uuid().optional(),
    range: z.object({
        start: z.string(),
        end: z.string()
    }).optional()
});

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        // 1. Validate Structure
        const parsed = UndoBodySchema.safeParse(body);
        if (!parsed.success) {
            return apiError('Invalid undo request', 400, parsed.error.format());
        }

        const { token, version_id, range } = parsed.data;
        const userId = context.user?.id || context.userId;

        if (!userId) {
            return apiError('Unauthorized', 401);
        }

        const supabase = await createClient() as unknown as SupabaseClient<any, "public", any>;

        // 2a. Direct patch_run undo (used by coach apply undo)
        if (token) {
            try {
                const { PatchService: PS } = await import('@/lib/services/patch-service');
                const result = await PS.undoPatch(userId, token, supabase);
                if (!result.success) return apiError('Nothing to undo or already reverted', 400);
                return apiSuccess({ success: true, changes: result.changes });
            } catch (err: any) {
                console.error('[undo] patch token undo failed:', err.message);
                return apiError('Undo failed: ' + err.message, 500);
            }
        }

        let targetRange = range;
        let targetVersionId = version_id;

        // 2b. Infer Range if missing (legacy schedule_versions path)
        if (!targetRange) {
            let query = supabase.from('schedule_versions').select('id, week_start').eq('user_id', userId);

            if (version_id) {
                query = query.eq('id', version_id);
            } else {
                query = query.order('created_at', { ascending: false }).limit(1);
            }

            const { data, error } = await query.single();

            if (error || !data) {
                return apiError('Nothing to undo', 400);
            }

            // Infer proper range
            const start = data.week_start; // DATE string YYYY-MM-DD
            const end = format(addDays(parseISO(start), 6), 'yyyy-MM-dd');
            targetRange = { start, end };

            // If we found the latest version, we should use its ID to be explicit
            if (!targetVersionId) {
                targetVersionId = data.id;
            }
        }

        // 3. Undo
        try {
            const result = await PatchService.undo(userId, targetVersionId, targetRange!, supabase);
            return apiSuccess(result);
        } catch (err: any) {
            console.error('[undo] Failed:', err.message);
            return apiError('Undo failed: ' + err.message, 500);
        }
    },
    { requireAuth: true }
);
