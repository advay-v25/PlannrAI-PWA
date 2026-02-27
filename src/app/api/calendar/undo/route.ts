// @ts-nocheck

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { PatchService } from '@/lib/calendar/patch-service';
import { addDays, format, parseISO } from 'date-fns';
import { z } from 'zod';

const UndoBodySchema = z.object({
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

        const { version_id, range } = parsed.data;
        const userId = context.user?.id || context.userId;

        if (!userId) {
            return apiError('Unauthorized', 401);
        }

        const supabase = await createClient() as unknown as SupabaseClient<any, "public", any>;

        let targetRange = range;
        let targetVersionId = version_id;

        // 2. Infer Range if missing
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
