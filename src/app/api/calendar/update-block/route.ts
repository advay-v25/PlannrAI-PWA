import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        const { blockId, updates } = body;

        if (!blockId || !updates) {
            return apiError("Missing fields", 400);
        }

        const supabase = await createClient() as unknown as SupabaseClient<any, "public", any>;

        try {
            const result = await CalendarEngine.updateBlock(context.user.id, blockId, updates, supabase);
            return apiSuccess({ success: true, block: result });
        } catch (e: any) {
            if (e.code === 'CONFLICT_REQUIRES_CHOICE') {
                return apiSuccess({ success: false, conflict: true, options: e.options }, 409);
            }
            return apiError(e.message, 400);
        }
    },
    { requireAuth: true }
);
