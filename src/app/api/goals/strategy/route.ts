import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';

export const maxDuration = 45;
export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { goal_id } = body as { goal_id: string };

        if (!goal_id) return apiError('Goal ID required', 400);

        // 1. Gather Context
        const [goalRes, profileRes, habitsRes, otherGoalsRes] = await Promise.all([
            supabase.from('goals').select('*').eq('id', goal_id).single(),
            supabase.from('profiles').select('*').eq('id', userId).single(),
            supabase.from('habit_stacks').select('name, preferred_window').eq('user_id', userId).eq('enabled', true),
            supabase.from('goals').select('title, category, minutes_per_day').eq('user_id', userId).eq('is_paused', false).neq('id', goal_id)
        ]);

        if (goalRes.error) return apiError('Goal not found', 404);
        const goal = goalRes.data;

        // Compute real capacity: sum all other goals' daily commitment
        const otherGoals = otherGoalsRes.data || [];
        const totalCommitted = otherGoals.reduce((sum: number, g: any) => sum + (g.minutes_per_day || 0), 0);
        const availableMinutes = Math.max(0, 480 - totalCommitted); // ~8 hours productive time

        // 2. Call AI
        try {
            const aiResponse = await executeAI(userId, {
                channel: 'goal_strategy',
                input: goal.title,
                context: {
                    goal: {
                        id: goal.id,
                        title: goal.title,
                        description: goal.description || '',
                        category: goal.category,
                        current_commitment: `${goal.minutes_per_day || 30}m/day, ${goal.days_per_week || 3}d/week`,
                        energy_demand: goal.energy_demand,
                        notes: goal.notes || 'None'
                    },
                    capacity: {
                        available_minutes_per_day: availableMinutes,
                        other_goals: otherGoals.map((g: any) => `${g.title} (${g.minutes_per_day || 0}m/day)`)
                    },
                    profile: profileRes.data || {},
                    existing_habits: habitsRes.data?.map((h: any) => h.name) || []
                }
            });

            // 3. Validate flat strategy response
            const strategy = aiResponse?.strategy_one_liner ? aiResponse : null;

            if (!strategy) {
                throw new Error('AI returned invalid strategy structure');
            }

            // 4. Save directly to DB
            const { error: updateError } = await supabase
                .from('goals')
                .update({
                    ai_strategy: strategy,
                    updated_at: new Date().toISOString()
                })
                .eq('id', goal_id)
                .eq('user_id', userId);

            if (updateError) {
                console.error('[GoalStrategy] DB update failed:', updateError);
                // Still return the strategy even if DB save fails
            }

            return apiSuccess({ strategy });

        } catch (error: any) {
            console.error('[GoalStrategy] AI Failed:', error);
            // Return a usable fallback
            const fallbackStrategy = {
                strategy_one_liner: `Focus on ${goal.title} with consistent daily practice.`,
                routine: {
                    frequency: 'daily' as const,
                    duration_mins: goal.minutes_per_day || 30,
                    steps: ['Review your goal', 'Take one focused action', 'Log progress'],
                    best_time: 'morning' as const,
                    notes: 'Start small and build momentum.'
                },
                milestones: ['Complete first week consistently', 'Build the habit loop', 'Reach your target'],
                checklist: [{ text: 'Block time in your calendar' }, { text: 'Set a daily reminder' }],
                donna_note: 'AI strategy generation failed — here\'s a solid starting plan.'
            };

            // Save fallback too
            await supabase
                .from('goals')
                .update({ ai_strategy: fallbackStrategy, updated_at: new Date().toISOString() })
                .eq('id', goal_id)
                .eq('user_id', userId);

            return apiSuccess({ strategy: fallbackStrategy });
        }
    },
    { requireAuth: true, auditAction: 'goal_strategy_generate' }
);
