import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        const { searchParams } = new URL(context.request.url);
        const days = parseInt(searchParams.get('days') || '30');

        const today = new Date();
        const startDate = format(subDays(today, days), 'yyyy-MM-dd');
        const endDate = format(today, 'yyyy-MM-dd');

        // Fetch all schedule blocks in the range
        const { data: blocks, error: blocksErr } = await supabase
            .from('schedule_blocks')
            .select('date, start_time, end_time, block_type, status')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date');

        if (blocksErr) {
            console.warn('[Analytics] Blocks query failed:', blocksErr.message);
        }


        // Fetch goals for pillar data
        const { data: goals } = await supabase
            .from('goals')
            .select('id, title, pillar')
            .eq('user_id', userId);

        const validTypes = ['anchor', 'body', 'craft', 'mind', 'meal'];
        const safeBlocks = (blocks || []).filter((b: any) => validTypes.includes(b.block_type));

        // --- 1. Daily adherence data (planned vs completed per day) ---
        const dailyMap: Record<string, { planned: number; completed: number; date: string }> = {};
        
        safeBlocks.forEach((b: any) => {
            const start = new Date(`${b.date}T${b.start_time}`);
            const end = new Date(`${b.date}T${b.end_time}`);
            let duration = (end.getTime() - start.getTime()) / 60000;
            if (duration < 0) duration += 1440;

            if (!dailyMap[b.date]) {
                dailyMap[b.date] = { planned: 0, completed: 0, date: b.date };
            }
            dailyMap[b.date].planned += duration;
            if (b.status === 'done') {
                dailyMap[b.date].completed += duration;
            }
        });

        const adherenceTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        // --- 2. Pillar distribution (time by block_type) ---
        const pillarTotals: Record<string, number> = {};
        safeBlocks.forEach((b: any) => {
            const start = new Date(`${b.date}T${b.start_time}`);
            const end = new Date(`${b.date}T${b.end_time}`);
            let duration = (end.getTime() - start.getTime()) / 60000;
            if (duration < 0) duration += 1440;

            const pillar = b.block_type;
            pillarTotals[pillar] = (pillarTotals[pillar] || 0) + duration;
        });

        const pillarDistribution = Object.entries(pillarTotals).map(([pillar, minutes]) => ({
            pillar,
            minutes: Math.round(minutes)
        }));

        // --- 3. Day-of-week energy heatmap ---
        // Since user_states is a single row, we'll derive from blocks + status patterns
        // For a more useful heatmap, group adherence % by day of week
        const dayOfWeekMap: Record<string, { planned: number; completed: number; count: number }> = {
            'Mon': { planned: 0, completed: 0, count: 0 },
            'Tue': { planned: 0, completed: 0, count: 0 },
            'Wed': { planned: 0, completed: 0, count: 0 },
            'Thu': { planned: 0, completed: 0, count: 0 },
            'Fri': { planned: 0, completed: 0, count: 0 },
            'Sat': { planned: 0, completed: 0, count: 0 },
            'Sun': { planned: 0, completed: 0, count: 0 },
        };
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        adherenceTrend.forEach(day => {
            const d = new Date(day.date);
            const dayName = dayNames[d.getDay()];
            dayOfWeekMap[dayName].planned += day.planned;
            dayOfWeekMap[dayName].completed += day.completed;
            dayOfWeekMap[dayName].count += 1;
        });

        const weekdayPattern = Object.entries(dayOfWeekMap).map(([day, data]) => ({
            day,
            avgPlanned: data.count > 0 ? Math.round(data.planned / data.count) : 0,
            avgCompleted: data.count > 0 ? Math.round(data.completed / data.count) : 0,
            adherence: data.planned > 0 ? Math.round((data.completed / data.planned) * 100) : 0,
        }));

        // --- 4. Streak / summary stats ---
        let currentStreak = 0;
        const reversedTrend = [...adherenceTrend].reverse();
        for (const day of reversedTrend) {
            if (day.completed > 0) {
                currentStreak++;
            } else {
                break;
            }
        }

        const totalPlanned = adherenceTrend.reduce((sum, d) => sum + d.planned, 0);
        const totalCompleted = adherenceTrend.reduce((sum, d) => sum + d.completed, 0);
        const overallAdherence = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

        return apiSuccess({
            period: { start: startDate, end: endDate, days },
            summary: {
                total_planned_hours: Math.round(totalPlanned / 60 * 10) / 10,
                total_completed_hours: Math.round(totalCompleted / 60 * 10) / 10,
                overall_adherence: overallAdherence,
                active_days: adherenceTrend.length,
                current_streak: currentStreak,
                goals_count: goals?.length || 0,
            },
            adherence_trend: adherenceTrend,
            pillar_distribution: pillarDistribution,
            weekday_pattern: weekdayPattern,
        });
    },
    { requireAuth: true, auditAction: 'analytics_overview' }
);
