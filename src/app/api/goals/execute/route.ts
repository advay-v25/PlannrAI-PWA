
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

const ExecuteSchema = z.object({
    goal_id: z.string().uuid(),
    plan: z.any() // We trust the plan structure from our own AI service
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const result = ExecuteSchema.safeParse(body);

        if (!result.success) {
            return apiError('Invalid request', 400);
        }

        const { goal_id, plan } = result.data;

        // 1. Verify Goal Ownership
        const { data: goal, error: goalError } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goal_id)
            .eq('user_id', userId)
            .single();

        if (goalError || !goal) {
            return apiError('Goal not found', 404);
        }

        // 2. Create Milestones and Tasks
        if (plan.milestones && Array.isArray(plan.milestones)) {
            for (let i = 0; i < plan.milestones.length; i++) {
                const m = plan.milestones[i];

                // Create Milestone
                const { data: milestoneData, error: milestoneError } = await supabase
                    .from('milestones')
                    .insert({
                        goal_id: goal_id,
                        title: m.title,
                        description: m.description,
                        deadline: new Date(Date.now() + (m.deadline_offset_days * 24 * 60 * 60 * 1000)).toISOString(),
                        sort_order: i,
                        status: 'pending'
                    })
                    .select()
                    .single();

                if (milestoneError) {
                    console.error('Failed to create milestone:', milestoneError);
                    continue; // Skip tasks if milestone failed
                }

                // Create Tasks for this Milestone
                if (m.tasks && Array.isArray(m.tasks)) {
                    const tasksToInsert = m.tasks.map((t: any) => ({
                        goal_id: goal_id,
                        milestone_id: milestoneData.id,
                        title: t.title,
                        estimated_minutes: t.estimated_minutes || 30,
                        status: 'pending'
                    }));

                    const { error: tasksError } = await supabase
                        .from('goal_tasks')
                        .insert(tasksToInsert);

                    if (tasksError) {
                        console.error('Failed to create tasks for milestone:', tasksError);
                    }
                }
            }
        }

        // 3. Update Goal Status & Save Plan
        await supabase
            .from('goals')
            .update({
                ai_plan: plan,
                updated_at: new Date().toISOString()
                // potentially update status to 'active' if not already
            })
            .eq('id', goal_id);

        return apiSuccess({ success: true });
    },
    { requireAuth: true }
);
