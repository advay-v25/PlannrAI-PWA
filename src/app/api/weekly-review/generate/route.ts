import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { week_start, week_end } = body as { week_start: string; week_end: string };
        const { userId } = context;

        if (!week_start || !week_end) return apiError("Missing week range", 400);

        const supabase = await createClient();

        // 1. Gather ALL relevant data for the week
        const [blocksRes, goalsRes, logsRes, reviewsRes] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('id, title, context, date, start_time, end_time, block_type, status, pillar, goal_id, is_focus')
                .eq('user_id', userId)
                .gte('date', week_start)
                .lte('date', week_end)
                .order('date')
                .order('start_time'),
            supabase.from('goals')
                .select('id, title, category, importance, status, pillar, minutes_per_day, days_per_week')
                .eq('user_id', userId)
                .eq('is_paused', false),
            supabase.from('daily_logs')
                .select('log_date, energy_level, mood, signals')
                .eq('user_id', userId)
                .gte('log_date', week_start)
                .lte('log_date', week_end)
                .order('log_date'),
            supabase.from('weekly_reviews')
                .select('week_start, lever_action, user_response')
                .eq('user_id', userId)
                .order('week_start', { ascending: false })
                .limit(3)
        ]);

        const blocks = blocksRes.data || [];
        const goals = goalsRes.data || [];
        const logs = logsRes.data || [];

        // 2. Calculate REAL metrics
        let plannedMinutes = 0;
        let actualMinutes = 0;
        let totalBlocks = blocks.length;
        let completedBlocks = 0;
        let cancelledBlocks = 0;
        const pillarMinutes: Record<string, number> = {};
        const dayBreakdown: Record<string, { planned: number; completed: number; cancelled: number }> = {};

        blocks.forEach((b: any) => {
            const start = parseInt(b.start_time?.split(':')[0] || '0') * 60 + parseInt(b.start_time?.split(':')[1] || '0');
            const end = parseInt(b.end_time?.split(':')[0] || '0') * 60 + parseInt(b.end_time?.split(':')[1] || '0');
            const duration = Math.max(0, end - start);

            if (b.status !== 'cancelled') plannedMinutes += duration;
            if (b.status === 'done') {
                actualMinutes += duration;
                completedBlocks++;
            }
            if (b.status === 'cancelled') cancelledBlocks++;

            // Pillar tracking
            const pillar = b.pillar || 'unassigned';
            pillarMinutes[pillar] = (pillarMinutes[pillar] || 0) + duration;

            // Day breakdown
            if (!dayBreakdown[b.date]) dayBreakdown[b.date] = { planned: 0, completed: 0, cancelled: 0 };
            dayBreakdown[b.date].planned++;
            if (b.status === 'done') dayBreakdown[b.date].completed++;
            if (b.status === 'cancelled') dayBreakdown[b.date].cancelled++;
        });

        const completionRate = plannedMinutes > 0 ? Math.round((actualMinutes / plannedMinutes) * 100) : 0;

        // Find top and neglected pillars
        const pillarEntries = Object.entries(pillarMinutes).sort((a, b) => b[1] - a[1]);
        const topPillar = pillarEntries[0]?.[0] || 'none';
        const neglectedPillar = pillarEntries[pillarEntries.length - 1]?.[0] || 'none';

        const summaryData = {
            range: { start: week_start, end: week_end },
            metrics: {
                plannedMinutes,
                actualMinutes,
                completionRate,
                totalBlocks,
                completedBlocks,
                cancelledBlocks,
                topPillar,
                neglectedPillar,
                pillarMinutes
            },
            dayBreakdown,
            blocks: blocks.map((b: any) => ({
                day: b.date,
                title: b.title || b.context || 'Untitled',
                status: b.status,
                pillar: b.pillar,
                block_type: b.block_type,
                start_time: b.start_time,
                end_time: b.end_time
            })),
            goals: goals.map((g: any) => ({
                title: g.title,
                category: g.category,
                importance: g.importance,
                pillar: g.pillar,
                target_minutes: (g.minutes_per_day || 30) * (g.days_per_week || 5)
            })),
            energy_logs: logs.map((l: any) => ({
                date: l.log_date,
                energy: l.energy_level,
                mood: l.mood
            })),
            previous_reviews: (reviewsRes.data || []).map((r: any) => ({
                week: r.week_start,
                lever: r.lever_action?.label,
                applied: r.user_response === 'accepted'
            }))
        };

        // 3. Call AI
        try {
            const aiResult = await executeAI(userId, {
                channel: 'weekly_review',
                input: `Generate Weekly Review for ${week_start} to ${week_end}`,
                context: summaryData
            });

            // Return AI result merged with real metrics
            return apiSuccess({
                ...aiResult,
                metrics: summaryData.metrics,
                dayBreakdown: summaryData.dayBreakdown
            });

        } catch (error) {
            console.error("AI Generation failed", error);
            return apiError("Weekly review generation failed", 500);
        }
    },
    { requireAuth: true }
);
