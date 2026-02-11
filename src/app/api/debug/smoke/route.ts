
import { createClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api/api-utils';
import { startOfWeek, endOfWeek, formatISO } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const supabase = await createClient();

    // Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return apiError('UNAUTHORIZED', 'Authentication required for smoke test', 401);
    }

    // Date Range (This Week)
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });

    const counts = {
        goals_active: 0,
        anchors_week: 0,
        schedule_blocks_week: 0,
        meals_week: 0
    };

    const warnings: string[] = [];

    try {
        // Query goals
        const { count: goalsCount, error: goalsError } = await supabase
            .from('goals')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'active');

        if (goalsError) warnings.push(`Goals Query Error: ${goalsError.message}`);
        else counts.goals_active = goalsCount || 0;

        // Query Schedule Blocks
        const { data: blocks, error: blocksError } = await supabase
            .from('schedule_blocks')
            .select('id, block_type, commitment_id, is_locked')
            .eq('user_id', user.id)
            .gte('start_time', formatISO(start)) // Note: start_time schema might be time or datetime. 
            // Checking schema: schedule_blocks usually has 'date' column + 'start_time' string.
            // Let's filter by Date column for safety if standard.
            .gte('date', formatISO(start, { representation: 'date' }))
            .lte('date', formatISO(end, { representation: 'date' }));

        if (blocksError) {
            warnings.push(`Blocks Query Error: ${blocksError.message}`);
        } else if (blocks) {
            counts.schedule_blocks_week = blocks.length;
            counts.anchors_week = blocks.filter(b => b.commitment_id || b.is_locked).length;
            counts.meals_week = blocks.filter(b => b.block_type === 'meal').length;
        }

    } catch (e: any) {
        return apiError('INTERNAL_ERROR', e.message, 500);
    }

    return apiSuccess({
        user: { id: user.id, email: user.email },
        counts,
        warnings
    });
}
