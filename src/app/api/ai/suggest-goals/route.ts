// @ts-nocheck
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { z } from 'zod';

const SuggestGoalsOutputSchema = z.object({
    suggestions: z.array(z.object({
        title: z.string(),
        category: z.enum(['mind', 'body', 'craft']),
        why: z.string(),
        importance: z.enum(['high', 'medium', 'low']),
        minutes_per_day: z.number().optional(),
        energy_demand: z.enum(['light', 'medium', 'heavy']).optional()
    })),
    insight: z.string()
});

/**
 * AI Goal Suggestions API
 * Suggests personalized goals based on user patterns
 */

interface GoalSuggestion {
    title: string;
    category: 'mind' | 'body' | 'craft';
    why: string;
    importance: 'high' | 'medium' | 'low';
    minutes_per_day?: number;
    energy_demand?: 'light' | 'medium' | 'heavy';
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
                    .from('brain_dump_entries')
                    .select('extracted_json')
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
                    const signals = d.extracted_json?.signals || [];
                    if (Array.isArray(signals)) {
                        return signals.map((s: { content?: string, description?: string }) => s.content || s.description).filter(Boolean);
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

            const rawText = await groqChat({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a goal strategist. Output STRICT JSON only. Schema: { suggestions: [{ title, category: mind|body|craft, why, importance: high|medium|low, minutes_per_day?, energy_demand?: light|medium|heavy }], insight: string }' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.4,
                max_tokens: 1500,
                userId
            });

            if (!rawText) throw new Error('AI returned no content');

            const result = await JSONReliability.validateOrRepair(
                rawText,
                SuggestGoalsOutputSchema,
                'llama-3.3-70b-versatile'
            );
            await logAIRequest(userId, '/api/ai/suggest-goals', context.request, true);

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
                        title: 'Morning Routine',
                        category: 'mind',
                        why: 'Sets the tone for the day',
                        importance: 'high',
                        minutes_per_day: 30,
                        energy_demand: 'medium'
                    },
                    {
                        title: 'Daily Walk',
                        category: 'body',
                        why: 'Physical movement supports mental clarity',
                        importance: 'medium',
                        minutes_per_day: 30,
                        energy_demand: 'light'
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
