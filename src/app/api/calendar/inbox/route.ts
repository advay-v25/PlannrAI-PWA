import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';
import { z } from 'zod';

const inboxSchema = z.object({
    title: z.string().min(1, 'Missing title'),
    estimated_minutes: z.number().int().positive().optional()
});

export const POST = secureApiRoute(async (context, rawBody) => {
    const { supabase, user } = context;

    const parsed = inboxSchema.safeParse(rawBody);
    if (!parsed.success) {
        return apiError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR');
    }

    const { title, estimated_minutes } = parsed.data;

    try {
        const result = await CalendarEngine.addInboxItem(user.id, title, estimated_minutes, supabase);
        return apiSuccess({ success: true, data: result });
    } catch (e: any) {
        console.error('[inbox API] Error:', e);
        return apiError(e.message, 500, 'INBOX_ERROR');
    }
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'calendar_inbox_add' });
