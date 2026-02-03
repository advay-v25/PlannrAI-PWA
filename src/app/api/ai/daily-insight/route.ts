import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { generateAIResponse } from '@/lib/ai/groq-client';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { startOfDay, subDays, format } from 'date-fns';

/**
 * Daily AI Insight API
 * Generates a personalized insight for the user's day
 * Rate limited and cached for 6 hours
 */

interface DailyInsight {
    greeting: string;
    insight: string;
    focusSuggestion: string;
    encouragement: string;
}

// Cache insights per user (6 hour TTL)
const insightCache = new Map<string, { insight: DailyInsight; timestamp: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export const GET = secureApiRoute(
    async (context) => {
        const userId = context.userId;
        const today = format(startOfDay(new Date()), 'yyyy-MM-dd');
        const cacheKey = `${userId}-${today}`;

        // Check cache first
        const cached = insightCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return apiSuccess({
                insight: cached.insight,
                source: 'cached',
                generatedAt: new Date(cached.timestamp).toISOString(),
            });
        }

        const supabase = await createClient();

        // Check AI permission
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_suggest, display_name, work_hours_start, work_hours_end')
            .eq('id', userId)
            .single();

        if (!profile?.ai_can_suggest) {
            return apiSuccess({
                insight: {
                    greeting: 'Good morning!',
                    insight: 'AI insights are disabled. Enable them in Settings to get personalized suggestions.',
                    focusSuggestion: 'Check your goals for today.',
                    encouragement: 'You\'ve got this!',
                },
                source: 'disabled',
            });
        }

        try {
            // Gather context data
            const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

            const [goalsResult, blocksResult, energyResult] = await Promise.all([
                supabase
                    .from('goals')
                    .select('title, category, importance')
                    .eq('user_id', userId)
                    .eq('is_paused', false)
                    .limit(5),
                supabase
                    .from('schedule_blocks')
                    .select('status, duration_minutes')
                    .eq('user_id', userId)
                    .gte('date', yesterday)
                    .lte('date', today),
                supabase
                    .from('energy_logs')
                    .select('level')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(3),
            ]);

            // Calculate stats
            const completedBlocks = blocksResult.data?.filter(b => b.status === 'complete').length || 0;
            const totalBlocks = blocksResult.data?.length || 0;
            const completionRate = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;
            const avgEnergy = energyResult.data?.length
                ? Math.round(energyResult.data.reduce((sum, e) => sum + e.level, 0) / energyResult.data.length)
                : 5;

            const prompt = `
User Context:
- Name: ${profile.display_name || 'Friend'}
- Current time: ${format(new Date(), 'h:mm a')}
- Active goals: ${goalsResult.data?.map(g => `${g.title} (${g.category})`).join(', ') || 'None set'}
- Yesterday's completion rate: ${completionRate}%
- Recent energy level: ${avgEnergy}/10

Generate a personalized daily insight.
`;

            const response = await generateAIResponse(prompt, 'DAILY_INSIGHT', userId);
            await logAIRequest(userId, '/api/ai/daily-insight', context.request, true);

            // Parse JSON response
            let insight: DailyInsight;
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                insight = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch {
                insight = {
                    greeting: `Good ${getTimeOfDay()}, ${profile.display_name || 'Friend'}!`,
                    insight: 'I\'m analyzing your patterns...',
                    focusSuggestion: 'Pick your most important goal and start small.',
                    encouragement: 'Every step forward counts!',
                };
            }

            // Cache the result
            insightCache.set(cacheKey, { insight, timestamp: Date.now() });

            return apiSuccess({
                insight,
                source: 'ai',
                generatedAt: new Date().toISOString(),
            });

        } catch (error) {
            await logAIRequest(userId, '/api/ai/daily-insight', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            // Return fallback insight
            return apiSuccess({
                insight: {
                    greeting: `Good ${getTimeOfDay()}!`,
                    insight: 'Today is a fresh start.',
                    focusSuggestion: 'Focus on what matters most to you.',
                    encouragement: 'You\'re capable of amazing things!',
                },
                source: 'fallback',
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'user',
        auditAction: 'ai_daily_insight',
    }
);

function getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}
