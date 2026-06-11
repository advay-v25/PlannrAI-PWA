import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';

export const maxDuration = 45;

export const POST = secureApiRoute(
    async (context, body) => {
        const { week_start, week_end } = body as { week_start: string; week_end: string };
        const { userId, supabase } = context;

        if (!week_start || !week_end) return apiError("Missing week range", 400);

        // 1. Gather ALL relevant data for the week
        const [blocksRes, goalsRes] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('id, title, context, date, start_time, end_time, block_type, status, pillar, goal_id')
                .eq('user_id', userId)
                .gte('date', week_start)
                .lte('date', week_end)
                .order('date')
                .order('start_time'),
            supabase.from('goals')
                .select('id, title, category, importance, status, pillar, minutes_per_day, days_per_week')
                .eq('user_id', userId)
                .eq('is_paused', false),
        ]);

        const blocks = blocksRes.data || [];
        const goals = goalsRes.data || [];

        // 2. Calculate REAL metrics
        let plannedMinutes = 0;
        let actualMinutes = 0;
        let totalBlocks = blocks.length;
        let completedBlocks = 0;
        let cancelledBlocks = 0;
        let missedBlocks = 0;
        const pillarMinutes: Record<string, number> = {};
        const dayBreakdown: Record<string, { planned: number; completed: number; cancelled: number; missed: number }> = {};

        blocks.forEach((b: any) => {
            const start = parseInt(b.start_time?.split(':')[0] || '0') * 60 + parseInt(b.start_time?.split(':')[1] || '0');
            const end = parseInt(b.end_time?.split(':')[0] || '0') * 60 + parseInt(b.end_time?.split(':')[1] || '0');
            const duration = Math.max(0, end - start);

            const effectiveStatus = (b.status === 'planned' || b.status === 'in_progress') ? 'missed' : b.status;

            if (effectiveStatus !== 'cancelled') plannedMinutes += duration;
            if (effectiveStatus === 'done') {
                actualMinutes += duration;
                completedBlocks++;
            }
            if (effectiveStatus === 'cancelled') cancelledBlocks++;
            if (effectiveStatus === 'missed') missedBlocks++;

            // Pillar tracking
            const pillar = b.pillar || b.block_type || 'unassigned';
            pillarMinutes[pillar] = (pillarMinutes[pillar] || 0) + duration;

            // Day breakdown
            if (!dayBreakdown[b.date]) dayBreakdown[b.date] = { planned: 0, completed: 0, cancelled: 0, missed: 0 };
            dayBreakdown[b.date].planned++;
            if (effectiveStatus === 'done') dayBreakdown[b.date].completed++;
            if (effectiveStatus === 'cancelled') dayBreakdown[b.date].cancelled++;
            if (effectiveStatus === 'missed') dayBreakdown[b.date].missed++;
        });

        const completionRate = plannedMinutes > 0 ? Math.round((actualMinutes / plannedMinutes) * 100) : 0;

        // Find top and neglected pillars
        const pillarEntries = Object.entries(pillarMinutes).sort((a, b) => b[1] - a[1]);
        const topPillar = pillarEntries[0]?.[0] || 'none';
        const neglectedPillar = pillarEntries[pillarEntries.length - 1]?.[0] || 'none';

        const metrics = {
            plannedMinutes,
            actualMinutes,
            completionRate,
            totalBlocks,
            completedBlocks,
            cancelledBlocks,
            missedBlocks,
            topPillar,
            neglectedPillar,
            pillarMinutes,
        };

        // 3. Build a compact summary for the LLM
        const blocksSummary = blocks.slice(0, 30).map((b: any) => (
            `${b.date} ${b.start_time}-${b.end_time}: ${b.title || b.context || 'Untitled'} [${b.status}] (${b.pillar || b.block_type})`
        )).join('\n');

        const goalsSummary = goals.map((g: any) => (
            `${g.title} (${g.category}, importance: ${g.importance})`
        )).join(', ');

        // 4. Call AI via callAI (resilient)
        try {
            // Rate Limit Check
            const { requireRateLimit } = await import('@/lib/rate-limit');
            const rateLimitCheck = await requireRateLimit(`weekly-review:${userId}`, 3, 3600);
            if (typeof rateLimitCheck !== 'boolean') return rateLimitCheck;

            const systemPrompt = `You are PlannrAI's weekly review analyst. Analyze the user's week and return JSON.
            Output JSON format:
            {
              "reality": "2-3 sentence honest assessment of the week",
              "patterns": [{"title": "pattern name", "evidence": "specific data-backed observation"}],
              "lever": {"label": "one high-leverage change for next week", "explanation": "why this matters"},
              "note": "one encouraging/motivating sentence"
            }`;

            const prompt = `Week: ${week_start} to ${week_end}
            Completion Rate: ${completionRate}%
            Planned: ${plannedMinutes}min | Actual: ${actualMinutes}min
            Blocks: ${totalBlocks} total, ${completedBlocks} done, ${cancelledBlocks} cancelled, ${missedBlocks} missed
            Top Pillar: ${topPillar} (${pillarMinutes[topPillar] || 0}min)
            Neglected: ${neglectedPillar} (${pillarMinutes[neglectedPillar] || 0}min)
            Goals: ${goalsSummary || 'None set'}
            
            Schedule:
            ${blocksSummary || 'No blocks this week'}`;

            const response = await callAI<any>({
                model: 'fast',
                systemPrompt,
                prompt,
                requireJSON: true,
                userId: userId
            });

            if (!response.success || !response.data) {
                throw new Error(response.error || "AI failed");
            }

            const parsed = response.data;

            return apiSuccess({
                reality: parsed.reality || 'Review data processed.',
                patterns: parsed.patterns || [],
                lever: parsed.lever || { label: 'Review your goals', explanation: 'Start with reflection.' },
                note: parsed.note || 'Keep building momentum.',
                metrics,
                dayBreakdown,
                provider: response.provider
            });

        } catch (error: any) {
            console.error("AI Generation failed", error);
            // Return 200 with metrics even if AI fails
            return apiSuccess({
                reality: `Your week had a ${completionRate}% completion rate across ${totalBlocks} blocks. ${completedBlocks} completed, ${cancelledBlocks} cancelled.`,
                patterns: completionRate < 50
                    ? [{ title: "Low Completion", evidence: `Only ${completionRate}% of planned time was completed. Consider reducing planned blocks.` }]
                    : [],
                lever: { label: "Focus on consistency", explanation: "Small daily wins compound over time." },
                note: "Every week is a fresh start. Keep going.",
                metrics,
                dayBreakdown,
                source: 'fallback'
            });
        }
    },
    { requireAuth: true, rateLimit: 'aiPlanWeek', auditAction: 'weekly_review_generate' }
);
