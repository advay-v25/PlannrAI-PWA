import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';
import { z } from 'zod';

const autoPlaceSchema = z.object({
    block_id: z.string().min(1, 'Missing block_id'),
    duration_minutes: z.number().int().positive('Duration must be positive'),
    target_date: z.string().min(1, 'Missing target_date')
});

export const POST = secureApiRoute(async (context, rawBody) => {
    const { supabase, user } = context;

    const parsed = autoPlaceSchema.safeParse(rawBody);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR');
    }

    const { block_id, duration_minutes, target_date } = parsed.data;

    try {
        const result = await CalendarEngine.autoPlace(user.id, block_id, duration_minutes, target_date, supabase);
        return apiSuccess({ success: true, data: result });
    } catch (e: any) {
        console.error('[auto-place API] Error:', e);
        return apiError(e.message, 500, 'AUTO_PLACE_ERROR');
    }
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'calendar_auto_place' });
