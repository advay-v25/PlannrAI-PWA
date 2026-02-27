import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;

        try {
            // 1. Fetch last 30 days of completed blocks
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = thirtyDaysAgo.toISOString().split('T')[0];

            const { data: blocks, error } = await supabase
                .from('schedule_blocks')
                .select('id, date, start_time, end_time, status, block_type, goal_id')
                .eq('user_id', userId)
                .gte('date', startDate)
                .order('date', { ascending: true });

            if (error) throw error;

            const allBlocks = blocks || [];
            const completedBlocks = allBlocks.filter(b => b.status === 'completed');
            const dataPoints = allBlocks.length;

            // Not enough data
            if (dataPoints < 5) {
                return apiSuccess({ profile: { data_points: dataPoints } });
            }

            // 2. Analyze time-of-day patterns
            const timeToMinutes = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            };

            const hourBuckets: Record<string, { total: number; completed: number }> = {};
            for (const b of allBlocks) {
                const hour = b.start_time?.split(':')[0] || '09';
                if (!hourBuckets[hour]) hourBuckets[hour] = { total: 0, completed: 0 };
                hourBuckets[hour].total++;
                if (b.status === 'completed') hourBuckets[hour].completed++;
            }

            // Find peak and low windows
            let peakHour = '09', lowHour = '09';
            let peakRate = 0, lowRate = 100;
            for (const [hour, data] of Object.entries(hourBuckets)) {
                if (data.total < 2) continue;
                const rate = Math.round((data.completed / data.total) * 100);
                if (rate > peakRate) { peakRate = rate; peakHour = hour; }
                if (rate < lowRate) { lowRate = rate; lowHour = hour; }
            }

            const peakStart = `${peakHour.padStart(2, '0')}:00`;
            const peakEnd = `${String(Math.min(23, parseInt(peakHour) + 2)).padStart(2, '0')}:00`;
            const lowStart = `${lowHour.padStart(2, '0')}:00`;
            const lowEnd = `${String(Math.min(23, parseInt(lowHour) + 2)).padStart(2, '0')}:00`;

            // 3. Determine archetype
            const peakHourNum = parseInt(peakHour);
            let archetype = 'Balanced Worker';
            let description = 'You perform consistently throughout the day.';
            if (peakHourNum < 10) {
                archetype = 'Morning Sprinter';
                description = 'Your best work happens early. You complete blocks at a higher rate before 10 AM. Front-load important tasks for max impact.';
            } else if (peakHourNum < 15) {
                archetype = 'Afternoon Warrior';
                description = 'You hit your stride midday. Your completion rate peaks in the early afternoon. Schedule deep work between 11 AM and 3 PM.';
            } else {
                archetype = 'Evening Owl';
                description = 'You do your best work later in the day. Your completion rate is highest after 3 PM. Protect your evening focus time.';
            }

            // 4. Day-of-week patterns
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayBuckets: Record<string, { total: number; completed: number }> = {};
            for (const b of allBlocks) {
                const dayIdx = new Date(b.date).getDay();
                const dayName = dayNames[dayIdx];
                if (!dayBuckets[dayName]) dayBuckets[dayName] = { total: 0, completed: 0 };
                dayBuckets[dayName].total++;
                if (b.status === 'completed') dayBuckets[dayName].completed++;
            }

            const dayRates = Object.entries(dayBuckets)
                .filter(([_, d]) => d.total >= 2)
                .map(([day, d]) => ({ day, rate: Math.round((d.completed / d.total) * 100) }))
                .sort((a, b) => b.rate - a.rate);

            const bestDays = dayRates.slice(0, 3);
            const worstDay = dayRates.length > 0 ? dayRates[dayRates.length - 1] : null;

            // 5. Pillar insights (goal categories)
            const { data: goals } = await supabase
                .from('goals')
                .select('id, category')
                .eq('user_id', userId);

            const goalMap = new Map((goals || []).map(g => [g.id, g.category || 'general']));
            const pillarBuckets: Record<string, { total: number; completed: number }> = {};
            for (const b of allBlocks) {
                const pillar = (b.goal_id && goalMap.get(b.goal_id)) || 'general';
                if (!pillarBuckets[pillar]) pillarBuckets[pillar] = { total: 0, completed: 0 };
                pillarBuckets[pillar].total++;
                if (b.status === 'completed') pillarBuckets[pillar].completed++;
            }

            const pillarInsights = Object.entries(pillarBuckets)
                .filter(([_, d]) => d.total >= 2)
                .map(([pillar, d]) => ({
                    pillar,
                    completion_rate: Math.round((d.completed / d.total) * 100)
                }))
                .sort((a, b) => b.completion_rate - a.completion_rate)
                .slice(0, 6);

            return apiSuccess({
                profile: {
                    archetype,
                    description,
                    peak_window: { start: peakStart, end: peakEnd, completion_rate: peakRate },
                    low_window: { start: lowStart, end: lowEnd, completion_rate: lowRate },
                    best_days: bestDays,
                    worst_day: worstDay,
                    pillar_insights: pillarInsights,
                    data_points: dataPoints,
                }
            });
        } catch (error: any) {
            console.error('[ProfileAnalysis] Error:', error);
            return apiSuccess({
                profile: {
                    archetype: 'New User',
                    description: 'Not enough data yet to determine your productivity profile.',
                    peak_window: { start: '09:00', end: '11:00', completion_rate: 0 },
                    low_window: { start: '15:00', end: '17:00', completion_rate: 0 },
                    best_days: [],
                    worst_day: null,
                    pillar_insights: [],
                    data_points: 0,
                }
            });
        }
    },
    { requireAuth: true }
);
