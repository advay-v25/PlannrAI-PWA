
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['goal_id', 'start_time', 'date']);
        if (!validation.valid) return apiError('Missing required fields');

        const { goal_id, start_time, date } = body as {
            goal_id: string;
            start_time: string; // HH:MM
            date: string; // YYYY-MM-DD
        };

        const supabase = await createClient();

        // 1. Fetch Goal Strategy
        const { data: goal } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goal_id)
            .single();

        if (!goal || !goal.ai_strategy) return apiError('Goal strategy not found');

        const strategy = goal.ai_strategy;
        const routine = strategy.routine;

        // 2. Calculate End Time
        const [h, m] = start_time.split(':').map(Number);
        const duration = routine.duration_mins || goal.minutes_per_day || 30;
        const endDate = new Date();
        endDate.setHours(h, m + duration);
        const end_time = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        // 3. Create Block with Strategy Checklist
        const checklist = strategy.checklist?.map((item: any) => ({
            id: crypto.randomUUID(),
            text: item.text,
            completed: false
        })) || [];

        const { data: block, error } = await supabase
            .from('schedule_blocks')
            .insert({
                user_id: context.userId,
                date,
                start_time,
                end_time,
                status: 'planned',
                block_type: 'goal', // It's a goal execution block
                goal_id: goal.id,
                context: `Execution: ${routine.steps?.[0] || 'Daily Protocol'}`,
                checklist: checklist // Using the new JSONB column
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            return apiError('Failed to schedule block', 500);
        }

        return apiSuccess({ block, message: 'Strategy executed on calendar' });
    },
    { requireAuth: true, auditAction: 'schedule_strategy' }
);
