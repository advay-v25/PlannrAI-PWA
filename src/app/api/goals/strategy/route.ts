import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';

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

        // 2. Call AI via callAI (with fallback)
        try {
            const systemPrompt = `You are PlannrAI's Expert Goal Strategist. Your mission is to decompose a high-level goal into a sustainable, science-backed routine.
            Respond ONLY with valid JSON.`;

            const prompt = `Goal: ${goal.title}
            Description: ${goal.description || 'None'}
            Category: ${goal.category}
            Current Commitment: ${goal.minutes_per_day || 30}m/day, ${goal.days_per_week || 3}d/week
            Energy Demand: ${goal.energy_demand}
            
            Capacity: ${availableMinutes} free minutes per day.
            Other Goals: ${otherGoals.map((g: any) => g.title).join(', ')}
            
            Output JSON format:
            {
              "strategy_one_liner": "Concise high-level approach",
              "routine": {
                "frequency": "daily|weekly|custom",
                "duration_mins": number,
                "steps": ["Step 1", "Step 2"],
                "best_time": "morning|afternoon|evening",
                "notes": "Advice for success"
              },
              "milestones": ["Milestone 1", "Milestone 2"],
              "checklist": [{"text": "Action item 1"}],
              "donna_note": "A personal note from Donna the AI coach"
            }`;

            const response = await callAI<any>({
                model: 'smart',
                systemPrompt,
                prompt,
                requireJSON: true,
                userId: userId
            });

            const strategy = response.success ? response.data : null;

            if (!strategy) {
                throw new Error(response.error || 'AI returned invalid strategy structure');
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
            }

            return apiSuccess({ strategy, provider: response.provider });

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

            return apiSuccess({ strategy: fallbackStrategy, source: 'fallback' });
        }
    },
    { requireAuth: true, auditAction: 'goal_strategy_generate' }
);
