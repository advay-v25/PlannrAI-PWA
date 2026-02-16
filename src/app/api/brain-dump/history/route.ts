
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        // Fetch Dumps
        const { data: dumps, error } = await supabase
            .from('brain_dumps') // Assuming table name is brain_dumps
            .select('*, extractions:brain_dump_extractions(*)')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return apiError('Failed to fetch brain dumps', 500);
        }

        return apiSuccess({ dumps });
    },
    { requireAuth: true }
);
