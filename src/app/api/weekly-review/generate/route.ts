
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const POST = secureApiRoute(
    async (context, body) => {
        const { week_start, week_end } = body as { week_start: string; week_end: string };
        const { userId } = context;

        if (!week_start || !week_end) return apiError("Missing week range", 400);

        // 1. Gather Context
        const supabase = await createClient();

        const [blocksRes, goalsRes, logsRes] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('*, goal:goals(title, pillar)')
                .eq('user_id', userId)
                .gte('date', week_start)
                .lte('date', week_end),
            supabase.from('goals').select('*').eq('user_id', userId).eq('is_paused', false),
            supabase.from('daily_logs').select('*').eq('user_id', userId).gte('date', week_start).lte('date', week_end)
        ]);

        const blocks = blocksRes.data || [];

        // Calc Metrics
        let plannedMinutes = 0, actualMinutes = 0;
        blocks.forEach((b: any) => {
            const start = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
            const end = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]);
            const duration = end - start;
            if (b.status !== 'cancelled') plannedMinutes += duration;
            if (b.status === 'done') actualMinutes += duration;
        });

        const summaryData = {
            range: { start: week_start, end: week_end },
            metrics: { plannedMinutes, actualMinutes },
            blocks: blocks.map((b: any) => ({
                day: b.date,
                title: b.title,
                status: b.status,
                pillar: b.pillar || (b.goal as any)?.pillar
            })),
            goals: goalsRes.data?.map((g: any) => g.title),
            energy_logs: logsRes.data?.map((l: any) => l.energy_level)
        };

        // 2. Call AI via unified pipeline
        try {
            const aiResult = await executeAI(userId, {
                channel: 'weekly_review',
                input: `Generate Weekly Review for ${week_start} to ${week_end}`,
                context: summaryData
            });

            return apiSuccess(aiResult);

        } catch (error) {
            console.error("AI Generation failed", error);
            return apiError("Weekly review generation failed", 500);
        }
    },
    { requireAuth: true }
);
