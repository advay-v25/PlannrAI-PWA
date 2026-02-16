import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { goal_id, mode = 'expert' } = body as { goal_id: string; mode?: string };

        if (!goal_id) return apiError('Goal ID required', 400);

        // 1. Gather Context (Goal, Profile, Capacity, Schedule)
        const [goalRes, profileRes, capacityRes, habitsRes] = await Promise.all([
            supabase.from('goals').select('*').eq('id', goal_id).single(),
            supabase.from('profiles').select('*').eq('id', userId).single(),
            apiClient.get('/api/goals'), // Re-use our new capacity logic
            supabase.from('habit_stacks').select('*').eq('user_id', userId)
        ]);

        if (goalRes.error) return apiError('Goal not found', 404);
        const goal = goalRes.data;
        const capacity = (capacityRes as any)?.capacity || {};

        // 2. Call AI
        try {
            const aiResponse = await apiClient.ai.execute({
                channel: 'goal_strategy',
                input: goal.title,
                context: {
                    goal: {
                        title: goal.title,
                        category: goal.category,
                        current_commitment: `${goal.minutes_per_day}m/day, ${goal.days_per_week}d/week`,
                        energy_demand: goal.energy_demand,
                        notes: goal.notes || "None"
                    },
                    capacity: {
                        available: capacity.available_min_per_day,
                        overload: capacity.over_by_min_per_day > 0,
                    },
                    profile: profileRes.data || {},
                    existing_habits: habitsRes.data?.map((h: any) => h.name) || []
                }
            });

            // 3. Validate & Fallback
            if (!aiResponse || !aiResponse.options || aiResponse.options.length === 0) {
                // Fallback Options
                return apiSuccess({
                    options: [
                        {
                            label: "Manual Block",
                            impact: "Self-managed",
                            patch: {
                                undoable: true,
                                ops: [{
                                    op: "create_event",
                                    payload: {
                                        title: goal.title,
                                        block_type: "goal",
                                        goal_id: goal.id,
                                        duration: goal.minutes_per_day || 60
                                    }
                                }],
                                reason: "Fallback: AI unavailable"
                            }
                        }
                    ]
                });
            }

            // 4. Return Enriched Response
            return apiSuccess(aiResponse);

        } catch (error: any) {
            console.error('[GoalStrategy] AI Failed:', error);
            return apiError('AI Strategy Generation Failed', 500);
        }
    },
    { requireAuth: true, auditAction: 'goal_strategy_generate' }
);
