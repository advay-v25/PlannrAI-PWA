import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { generateAIResponse } from '@/lib/ai/groq-client';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';

/**
 * AI Goal Suggestions API
 * Suggests personalized goals based on user patterns
 */

interface GoalSuggestion {
    title: string;
    category: 'mind' | 'body' | 'career';
    why: string;
    importance: 'core' | 'growth' | 'maintenance';
}

interface SuggestionsResponse {
    suggestions: GoalSuggestion[];
    insight: string;
}

export const GET = secureApiRoute(
    async (context) => {
        const userId = context.userId;
        const supabase = await createClient();

        // Check AI permission
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_suggest, display_name, wake_time, sleep_time')
            .eq('id', userId)
            .single();

        if (!profile?.ai_can_suggest) {
            return apiSuccess({
                suggestions: [],
                insight: 'AI suggestions are disabled. Enable them in Settings.',
                source: 'disabled',
            });
        }

        try {
            // Gather context: existing goals, brain dumps, habits
            const [goalsResult, dumpsResult, habitsResult] = await Promise.all([
                supabase
                    .from('goals')
                    .select('title, category, importance, is_paused, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(10),
                supabase
                    .from('brain_dumps')
                    .select('content, signals')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(5),
                supabase
                    .from('habit_stacks')
                    .select('name, habits')
                    .eq('user_id', userId)
                    .limit(5),
            ]);

            // Analyze patterns
            const existingGoals = goalsResult.data || [];
            const categories = existingGoals.map(g => g.category);
            const categoryBalance = {
                mind: categories.filter(c => c === 'mind').length,
                body: categories.filter(c => c === 'body').length,
                career: categories.filter(c => c === 'career').length,
            };

            // Extract themes from brain dumps
            const recentThemes = dumpsResult.data
                ?.flatMap(d => {
                    if (d.signals && Array.isArray(d.signals)) {
                        return d.signals.map((s: { content?: string }) => s.content).filter(Boolean);
                    }
                    return [];
                })
                .slice(0, 5) || [];

            const prompt = `
User Profile Analysis:

Existing Goals (${existingGoals.length}):
${existingGoals.map(g => `- ${g.title} (${g.category}, ${g.importance})`).join('\n') || 'None set yet'}

Category Balance:
- Mind goals: ${categoryBalance.mind}
- Body goals: ${categoryBalance.body}
- Career goals: ${categoryBalance.career}

Recent Themes from Brain Dumps:
${recentThemes.join(', ') || 'No recent themes detected'}

Current Habits:
${habitsResult.data?.map(h => h.name).join(', ') || 'None set'}

Based on this analysis, suggest 2-3 new goals that would:
1. Balance their category distribution
2. Address themes from their brain dumps
3. Complement existing goals
4. Be realistic and meaningful

Avoid suggesting duplicates of existing goals.
`;

            const response = await generateAIResponse(prompt, 'GOAL_SUGGESTION', userId);
            await logAIRequest(userId, '/api/ai/suggest-goals', context.request, true);

            // Parse JSON response
            let result: SuggestionsResponse;
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                result = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [], insight: '' };
            } catch {
                result = {
                    suggestions: [
                        {
                            title: 'Start a daily journaling practice',
                            category: 'mind',
                            why: 'Helps process thoughts from brain dumps',
                            importance: 'growth',
                        },
                    ],
                    insight: 'Consider adding balance to your goals.',
                };
            }

            return apiSuccess({
                ...result,
                source: 'ai',
            });

        } catch (error) {
            await logAIRequest(userId, '/api/ai/suggest-goals', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return apiSuccess({
                suggestions: [
                    {
                        title: 'Establish a morning routine',
                        category: 'mind',
                        why: 'A consistent start sets the tone for the day',
                        importance: 'core',
                    },
                    {
                        title: 'Move for 30 minutes daily',
                        category: 'body',
                        why: 'Physical movement supports mental clarity',
                        importance: 'core',
                    },
                ],
                insight: 'Here are some foundational goals to consider.',
                source: 'fallback',
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_goal_suggestions',
    }
);
