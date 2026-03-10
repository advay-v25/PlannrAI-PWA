import { createClient } from '@/lib/supabase/server';
import { runAI } from './run-ai';
import { startOfWeek, endOfWeek, format } from 'date-fns';

export class WeeklyReviewAI {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async analyze(weekStart: string, weekEnd: string) {
        const supabase = await createClient();

        // 1. Gather Data (Re-using logic from route)
        const [blocksRes, goalsRes, logsRes, reviewsRes, habitLogsRes, brainDumpsRes, coachThreadsRes] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('id, title, context, date, start_time, end_time, block_type, status, pillar, goal_id')
                .eq('user_id', this.userId)
                .gte('date', weekStart)
                .lte('date', weekEnd),
            supabase.from('goals')
                .select('id, title, category, importance, status, pillar, minutes_per_day, days_per_week')
                .eq('user_id', this.userId)
                .eq('is_paused', false),
            supabase.from('daily_logs')
                .select('log_date, energy_level, mood, signals')
                .eq('user_id', this.userId)
                .gte('log_date', weekStart)
                .lte('log_date', weekEnd),
            supabase.from('weekly_reviews')
                .select('week_start, lever_action, user_response')
                .eq('user_id', this.userId)
                .order('week_start', { ascending: false })
                .limit(3),
            supabase.from('habit_logs')
                .select('habit_id, completed_at, status, habits(name)')
                .eq('user_id', this.userId)
                .gte('completed_at', `${weekStart}T00:00:00Z`)
                .lte('completed_at', `${weekEnd}T23:59:59Z`),
            supabase.from('brain_dumps')
                .select('raw_text, created_at, signals')
                .eq('user_id', this.userId)
                .gte('created_at', `${weekStart}T00:00:00Z`)
                .lte('created_at', `${weekEnd}T23:59:59Z`),
            supabase.from('coach_conversations')
                .select('id, coach_messages(role, content, created_at)')
                .eq('user_id', this.userId)
                .gte('last_message_at', `${weekStart}T00:00:00Z`)
                .lte('last_message_at', `${weekEnd}T23:59:59Z`)
        ]);

        const blocks = blocksRes.data || [];
        const goals = goalsRes.data || [];
        const logs = logsRes.data || [];
        const habitLogs = habitLogsRes.data || [];
        const brainDumps = brainDumpsRes.data || [];
        const coachThreads = coachThreadsRes.data || [];

        // 2. Process Metrics
        let plannedMinutes = 0;
        let actualMinutes = 0;
        const pillarMinutes: Record<string, number> = {};

        blocks.forEach((b: any) => {
            const start = this.timeToMinutes(b.start_time);
            const end = this.timeToMinutes(b.end_time);
            const duration = Math.max(0, end - start);

            if (b.status !== 'cancelled') plannedMinutes += duration;
            if (b.status === 'completed' || b.status === 'done') actualMinutes += duration;

            const pillar = b.pillar || 'unassigned';
            pillarMinutes[pillar] = (pillarMinutes[pillar] || 0) + duration;
        });

        const completionRate = plannedMinutes > 0 ? Math.round((actualMinutes / plannedMinutes) * 100) : 0;

        // 3. AI Execution
        const context = {
            range: { start: weekStart, end: weekEnd },
            metrics: {
                plannedMinutes,
                actualMinutes,
                completionRate,
                totalBlocks: blocks.length,
                pillarMinutes,
                habitCompletionRate: habitLogs.length > 0 ? Math.round((habitLogs.filter(h => h.status === 'completed').length / habitLogs.length) * 100) : 0
            },
            recentDumps: brainDumps.slice(-5).map(d => ({ text: d.raw_text, signals: d.signals })),
            coachContext: coachThreads.slice(-1).map(t => t.coach_messages.slice(-5)),
            activeGoals: goals.map(g => ({ title: g.title, pillar: g.pillar }))
        };

        const aiResponse = await runAI({
            channel: 'weekly_review',
            input: `Analyze the week from ${weekStart} to ${weekEnd}. Focus on patterns and a high-leverage change.`,
            context,
            userId: this.userId
        } as any);

        // 4. Return formatted for UI
        return {
            reality: aiResponse.summary || '',
            patterns: (aiResponse.explanation || '').split('\n').filter(l => l.length > 10).slice(0, 3).map(l => ({ title: 'Observation', evidence: l })),
            lever: (aiResponse.options || [])[0] || { label: 'Keep going', patch: { ops: [] } },
            note: aiResponse.note || 'Finish strong.',
            metrics: context.metrics
        };
    }

    private timeToMinutes(time: string): number {
        if (!time) return 0;
        const [h, m] = time.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }
}
