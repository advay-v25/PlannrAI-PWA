
import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';
import { WeekOrchestrator } from '@/lib/calendar/week-orchestrator';
import { createClient } from '@/lib/supabase/server';
import { parseISO, format } from 'date-fns';
import { SupabaseClient } from '@supabase/supabase-js';

export const POST = secureApiRoute(
    async (context: any, body: any) => {
        const { startDate } = body;
        const date = startDate ? parseISO(startDate) : new Date();
        const weekStartISO = format(date, 'yyyy-MM-dd');

        const supabase = createClient() as unknown as SupabaseClient<any, "public", any>;

        const result = await WeekOrchestrator.generateWeek({
            userId: context.user.id,
            weekStartISO,
            mode: 'optimise',
            supabase
        });

        return apiSuccess(result);
    },
    { requireAuth: true }
);
