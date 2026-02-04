import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const { recommendation_id, start_time, date } = body as {
            recommendation_id: string;
            start_time: string; // HH:MM
            date: string; // YYYY-MM-DD
        };

        const supabase = await createClient();

        // Get recommendation details
        const { data: rec } = await supabase
            .from('routine_recommendations')
            .select('*')
            .eq('id', recommendation_id)
            .single();

        if (!rec) return apiError('Recommendation not found');

        // Calculate end time
        const [h, m] = start_time.split(':').map(Number);
        const duration = rec.routine.duration_minutes || 15;
        const endDate = new Date();
        endDate.setHours(h, m + duration);
        const end_time = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        // Create Calendar Block
        const { data: block, error: blockError } = await supabase
            .from('schedule_blocks')
            .insert({
                user_id: context.userId,
                date,
                start_time,
                end_time,
                status: 'planned',
                context: `${rec.routine.name} (${rec.routine.goal})`,
                block_type: 'routine'
            })
            .select()
            .single();

        if (blockError) return apiError('Failed to schedule block', 500);

        // Mark recommendation as accepted
        await supabase
            .from('routine_recommendations')
            .update({ accepted: true, calendar_event_id: block.id })
            .eq('id', recommendation_id);

        return apiSuccess({ block, message: 'Routine scheduled successfully' });
    },
    { requireAuth: true, auditAction: 'schedule_routine' }
);
