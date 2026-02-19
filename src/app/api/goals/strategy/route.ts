import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { goal_id, mode = 'expert' } = body as { goal_id: string; mode?: string };

        if (!goal_id) return apiError('Goal ID required', 400);

        // 1. Gather Context (Goal, Profile, Habits) - Removed self-call to /api/goals
        const [goalRes, profileRes, habitsRes] = await Promise.all([
            supabase.from('goals').select('*').eq('id', goal_id).single(),
            supabase.from('profiles').select('*').eq('id', userId).single(),
            supabase.from('habit_stacks').select('*').eq('user_id', userId)
        ]);

        if (goalRes.error) return apiError('Goal not found', 404);
        const goal = goalRes.data;

        // Quick capacity calc (simplified for direct DB access)
        // In a real scenario, extract the capacity logic to a shared service function
        const capacity = { available_min_per_day: 120, overload: false };

        // 2. Call AI Directly
        try {
            const aiResponse = await executeAI(userId, {
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
                        overload: capacity.overload,
                    },
                    profile: profileRes.data || {},
                    existing_habits: habitsRes.data?.map((h: any) => h.name) || []
                }
            });

            // 3. Validate & Fallback (Handled by executeAI usually, but double check)
            if (!aiResponse || !aiResponse.options || aiResponse.options.length === 0) {
                // The fallback in executeAI should have covered this, but just in case
                throw new Error("Empty AI response");
            }

            // 4. Return Enriched Response
            return apiSuccess(aiResponse);

        } catch (error: any) {
            console.error('[GoalStrategy] AI Failed:', error);
            // Return a safe fallback manually if executeAI completely blew up
            return apiSuccess({
                options: [
                    {
                        label: "Manual Block",
                        impact: "Self-managed schedule block",
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
    },
    { requireAuth: true, auditAction: 'goal_strategy_generate' }
);
