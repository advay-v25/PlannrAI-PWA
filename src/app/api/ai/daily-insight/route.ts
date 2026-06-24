import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { startOfDay, subDays, format } from 'date-fns';

export const maxDuration = 60;


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
                    .eq('status', 'active')
                    .limit(5),
                supabase
                    .from('schedule_blocks')
                    .select('status, start_time, end_time')
                    .eq('user_id', userId)
                    .eq('date', today),
                supabase
                    .from('daily_logs')
                    .select('energy_level')
                    .eq('user_id', userId)
                    .eq('log_date', today)
                    .single(),
            ]);

            const completedBlocks = blocksResult.data?.filter(b => b.status === 'done').length || 0;
            const totalBlocks = blocksResult.data?.length || 0;

            // Construct Context for Neural OS
            const homeContext = {
                today: today,
                schedule_stats: { total: totalBlocks, completed: completedBlocks },
                energy: energyResult.data?.energy_level || 3,
                active_goals: goalsResult.data?.map(g => `${g.title} (${g.category})`) || []
            };

            // Call AI via unified pipeline
            const response = await executeAI(userId, {
                channel: 'daily_briefing',
                input: "Generate daily insight",
                context: {
                    user: { name: profile.display_name || 'Friend', energy: homeContext.energy },
                    schedule: { count: homeContext.schedule_stats.total },
                    goals: homeContext.active_goals.join(', ')
                }
            });

            // Map AI response to DailyInsight-compatible structure for the UI
            const insight: DailyInsight = {
                greeting: `Good ${getTimeOfDay()}, ${profile.display_name || 'Friend'}!`,
                insight: response?.briefing || 'Today is a fresh start.',
                focusSuggestion: response?.priorities?.[0] || 'Focus on your top priority today.',
                encouragement: response?.tone === 'gentle' ? "Take it easy today." : "The path is clear. Execute.",
            };

            await logAIRequest(userId, '/api/ai/daily-insight', context.request, true);
            insightCache.set(cacheKey, { insight, timestamp: Date.now() });

            return apiSuccess({
                insight,
                source: 'ai',
                generatedAt: new Date().toISOString(),
            });

        } catch (error) {
            console.error("Daily Insight Error:", error);
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
