
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { GoalScheduler } from '@/lib/scheduling/goal-scheduler';
import { addDays, format } from 'date-fns';

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['goal_id']);
        if (!validation.valid) return apiError('Missing goal_id');

        const { goal_id } = body as { goal_id: string };

        const supabase = await createClient();

        // 1. Fetch Goal
        const { data: goal } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goal_id)
            .single();

        if (!goal) return apiError('Goal not found');

        // 2. Fetch Schedule Context (Next 7 days)
        const today = new Date();
        const nextWeek = addDays(today, 7);

        const { data: schedule } = await supabase
            .from('schedule_blocks')
            .select('start_time, end_time, date')
            .eq('user_id', context.userId)
            .gte('date', format(today, 'yyyy-MM-dd'))
            .lte('date', format(nextWeek, 'yyyy-MM-dd'));

        // 3. Run Goal Scheduler
        const proposal = GoalScheduler.proposeGoalSchedule(
            goal,
            schedule || []
        );

        if (!proposal) {
            return apiSuccess({ success: false, message: 'Could not find sufficient time slots.' });
        }

        return apiSuccess({
            success: true,
            proposal
        });
    },
    { requireAuth: true, auditAction: 'generate_goal_schedule' }
);
