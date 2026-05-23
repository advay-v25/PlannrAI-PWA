import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { CalendarEngine } from '@/lib/calendar/calendar-engine'; // indirect access to logic
import { ConflictService } from '@/lib/scheduling/conflict-service';
import { createClient } from '@/lib/supabase/server';
import { parseISO } from 'date-fns';
import { SupabaseClient } from '@supabase/supabase-js';

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        const { blockId, proposed } = body; // proposed: { date, start_time, end_time }

        if (!proposed) {
            return apiError("Missing proposed timing", 400);
        }

        const supabase = await createClient() as unknown as SupabaseClient<any, "public", any>;

        // 1. Fetch Schedule
        const { data: schedule } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', context.user.id)
            .eq('date', proposed.date);

        // 2. Generate Options
        const proposal = {
            id: blockId,
            start: parseISO(`${proposed.date}T${proposed.start_time}`),
            end: parseISO(`${proposed.date}T${proposed.end_time}`),
            title: proposed.title
        };

        const verdict = ConflictService.solve(schedule || [], proposal);

        if (verdict.status === 'allowed') {
            return apiSuccess({ ok: true, message: "No conflict" });
        }

        if (verdict.status === 'requires_choice') {
            return apiSuccess({ ok: false, reason: verdict.reason, options: verdict.options });
        }

        return apiSuccess({ ok: false, reason: "Conflict detected", options: [] });
    },
    { requireAuth: true }
);
