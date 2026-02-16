
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { startOfDay, endOfDay, addDays, format, parseISO, subDays } from 'date-fns';

export const GET = secureApiRoute(
    async (context) => {
        const { searchParams } = new URL(context.request.url);
        const dateParam = searchParams.get('date'); // Target analysis date (usually today)

        // Week logic: Review is for the PAST 7 days ending yesterday? 
        // Or specific start/end? 
        // Standard: "Last Week" relative to now.
        // Let's support `weekStart` and `weekEnd` for precision, default to last complete week.

        const weekStartParam = searchParams.get('week_start');
        const weekEndParam = searchParams.get('week_end');

        let startDate: Date;
        let endDate: Date;

        if (weekStartParam && weekEndParam) {
            startDate = parseISO(weekStartParam);
            endDate = parseISO(weekEndParam);
        } else {
            // Default: Last 7 days ending yesterday
            const today = startOfDay(new Date());
            endDate = subDays(today, 1);
            startDate = subDays(today, 7);
        }

        const supabase = await createClient();

        // Parallel Fetch: Blocks, Goals, Commitments, Brain Dumps, Daily Logs
        const [blocksRes, goalsRes, logsRes] = await Promise.all([
            // 1. Schedule Blocks (The Truth)
            supabase.from('schedule_blocks')
                .select('*, goal:goals(title, pillar)')
                .eq('user_id', context.userId)
                .gte('date', format(startDate, 'yyyy-MM-dd'))
                .lte('date', format(endDate, 'yyyy-MM-dd')),

            // 2. Active Goals (Context)
            supabase.from('goals').select('*').eq('user_id', context.userId).eq('is_paused', false),

            // 3. Daily Logs (Subjective Reality)
            supabase.from('daily_logs')
                .select('*')
                .eq('user_id', context.userId)
                .gte('date', format(startDate, 'yyyy-MM-dd'))
                .lte('date', format(endDate, 'yyyy-MM-dd'))
        ]);

        if (blocksRes.error) return apiError('Failed to fetch schedule blocks', 500);

        const blocks = blocksRes.data || [];
        const goals = goalsRes.data || [];
        const logs = logsRes.data || [];

        // --- Aggregation Logic ---

        // 1. Minutes: Planned vs Done
        let plannedMinutes = 0;
        let actualMinutes = 0;
        let missedMinutes = 0;

        // 2. Pillar Split
        const pillarSplit: Record<string, number> = { mind: 0, body: 0, craft: 0, uncategorized: 0 };

        blocks.forEach((b: any) => {
            const start = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
            const end = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]);
            const duration = end - start;

            if (b.status === 'planned') {
                plannedMinutes += duration; // Assuming planned means "scheduled but not marked done"
                // If it's in the past and still 'planned', it's implicitly missed or ignored?
                // For "Planned vs Actual", 'planned' contributes to planned.
            } else if (b.status === 'done') {
                plannedMinutes += duration;
                actualMinutes += duration;
            } else if (b.status === 'missed') {
                plannedMinutes += duration;
                missedMinutes += duration;
            } else if (b.status === 'partial') {
                plannedMinutes += duration;
                actualMinutes += (duration * 0.5); // Heuristic
            }

            // Pillar Logic (from Goal or Block metadata?)
            // Block might have pillar override, else Goal pillar
            const pillar = b.pillar || (b.goal as any)?.pillar || 'uncategorized';
            pillarSplit[pillar] = (pillarSplit[pillar] || 0) + duration;
        });

        // 3. Subjective Trends
        const energyLevels = logs.map((l: any) => l.energy_level).filter(Boolean);
        const avgEnergy = energyLevels.length > 0
            ? Math.round(energyLevels.reduce((a: number, b: number) => a + b, 0) / energyLevels.length)
            : 0;

        return apiSuccess({
            range: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd') },
            metrics: {
                planned_minutes: plannedMinutes,
                actual_minutes: actualMinutes,
                missed_minutes: missedMinutes,
                execution_rate: plannedMinutes > 0 ? Math.round((actualMinutes / plannedMinutes) * 100) : 0
            },
            pillar_split: pillarSplit,
            subjective: {
                avg_energy: avgEnergy,
                log_count: logs.length
            },
            // Return raw data for Context
            blocks: blocks.map((b: any) => {
                const startMins = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
                const endMins = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]);
                return {
                    title: b.title || b.context,
                    status: b.status,
                    pillar: b.pillar || (b.goal as any)?.pillar,
                    day: b.date,
                    duration: endMins - startMins
                };
            }),
            active_goals: goals.map((g: any) => ({ title: g.title, pillar: g.pillar }))
        });
    },
    { requireAuth: true }
);
