import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { generateAIResponse } from '@/lib/ai/groq-client';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { subDays, format } from 'date-fns';

/**
 * AI Habit Optimization API
 * Analyzes habit completion patterns and suggests improvements
 */

interface HabitOptimization {
    habit: string;
    issue: string;
    suggestion: string;
    confidence: 'high' | 'medium' | 'low';
}

interface OptimizationResponse {
    optimizations: HabitOptimization[];
    stackingSuggestion: string;
    bestTimeSlot: 'morning' | 'afternoon' | 'evening';
}

export const GET = secureApiRoute(
    async (context) => {
        const userId = context.userId;
        const supabase = await createClient();

        // Check AI permission
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_suggest')
            .eq('id', userId)
            .single();

        if (!profile?.ai_can_suggest) {
            return apiSuccess({
                optimizations: [],
                stackingSuggestion: 'Enable AI in Settings for personalized suggestions.',
                bestTimeSlot: 'morning',
                source: 'disabled',
            });
        }

        try {
            // Get habit stacks and completion data
            const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

            const [stacksResult, habitsResult, energyResult] = await Promise.all([
                supabase
                    .from('habit_stacks')
                    .select('id, name, habits, time_of_day')
                    .eq('user_id', userId),
                supabase
                    .from('habit_logs')
                    .select('habit_id, completed, created_at')
                    .eq('user_id', userId)
                    .gte('created_at', thirtyDaysAgo),
                supabase
                    .from('energy_logs')
                    .select('level, created_at')
                    .eq('user_id', userId)
                    .gte('created_at', thirtyDaysAgo)
                    .order('created_at', { ascending: false }),
            ]);

            // Analyze completion patterns
            const stacks = stacksResult.data || [];
            const logs = habitsResult.data || [];
            const energyLogs = energyResult.data || [];

            // Calculate completion rates per habit
            const habitStats: Record<string, { completed: number; total: number }> = {};
            logs.forEach(log => {
                if (!habitStats[log.habit_id]) {
                    habitStats[log.habit_id] = { completed: 0, total: 0 };
                }
                habitStats[log.habit_id].total++;
                if (log.completed) habitStats[log.habit_id].completed++;
            });

            // Find average energy by time of day
            const timeEnergy = { morning: [] as number[], afternoon: [] as number[], evening: [] as number[] };
            energyLogs.forEach(log => {
                const hour = new Date(log.created_at).getHours();
                if (hour < 12) timeEnergy.morning.push(log.level);
                else if (hour < 17) timeEnergy.afternoon.push(log.level);
                else timeEnergy.evening.push(log.level);
            });

            const avgEnergy = {
                morning: timeEnergy.morning.length ? timeEnergy.morning.reduce((a, b) => a + b, 0) / timeEnergy.morning.length : 5,
                afternoon: timeEnergy.afternoon.length ? timeEnergy.afternoon.reduce((a, b) => a + b, 0) / timeEnergy.afternoon.length : 5,
                evening: timeEnergy.evening.length ? timeEnergy.evening.reduce((a, b) => a + b, 0) / timeEnergy.evening.length : 5,
            };

            const prompt = `
Habit Analysis for User:

Habit Stacks:
${stacks.map(s => `- ${s.name} (${s.time_of_day}): ${Array.isArray(s.habits) ? s.habits.length : 0} habits`).join('\n') || 'No stacks defined'}

Completion Patterns (last 30 days):
${Object.entries(habitStats).map(([id, stats]) => `- Habit ${id}: ${Math.round((stats.completed / stats.total) * 100)}% completion rate`).join('\n') || 'No data yet'}

Energy Patterns:
- Morning avg: ${avgEnergy.morning.toFixed(1)}/10
- Afternoon avg: ${avgEnergy.afternoon.toFixed(1)}/10
- Evening avg: ${avgEnergy.evening.toFixed(1)}/10

Based on this analysis:
1. Identify habits with low completion rates and suggest improvements
2. Suggest which habits could be stacked together
3. Recommend the best time slot based on energy patterns
`;

            const response = await generateAIResponse(prompt, 'HABIT_OPTIMIZATION', userId);
            await logAIRequest(userId, '/api/ai/optimize-habits', context.request, true);

            // Parse JSON response
            let result: OptimizationResponse;
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch {
                // Find best time slot based on energy
                type TimeSlot = 'morning' | 'afternoon' | 'evening';
                let bestTime: TimeSlot = 'morning';
                let highestEnergy = avgEnergy.morning;

                if (avgEnergy.afternoon > highestEnergy) {
                    bestTime = 'afternoon';
                    highestEnergy = avgEnergy.afternoon;
                }
                if (avgEnergy.evening > highestEnergy) {
                    bestTime = 'evening';
                }

                result = {
                    optimizations: [],
                    stackingSuggestion: 'Try grouping related habits together.',
                    bestTimeSlot: bestTime,
                };
            }

            return apiSuccess({
                ...result,
                source: 'ai',
            });

        } catch (error) {
            await logAIRequest(userId, '/api/ai/optimize-habits', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return apiSuccess({
                optimizations: [],
                stackingSuggestion: 'Start with habits you enjoy to build momentum.',
                bestTimeSlot: 'morning',
                source: 'fallback',
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_habit_optimization',
    }
);
