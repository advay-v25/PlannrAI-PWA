
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { apiClient } from '@/lib/api-client';
import { groqChat } from '@/lib/ai/groq-client';
import { ChannelRegistry } from '@/lib/ai/registry';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { WeeklyReviewOutputSchema } from '@/lib/ai/schemas';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const POST = secureApiRoute(
    async (context, body) => {
        const { week_start, week_end } = body as { week_start: string; week_end: string };
        const { userId } = context;

        if (!week_start || !week_end) return apiError("Missing week range", 400);

        // 1. Fetch Summary Context (Internal API call or direct logic reuse)
        // For speed, let's reuse logic by fetching via internal URL or just duplicate logic?
        // Better: Fetch via internal URL to keep DRY.
        const summaryUrl = `${BASE_URL}/api/weekly-review/summary?week_start=${week_start}&week_end=${week_end}`;

        let summaryData;
        try {
            // We need to pass the cookie for auth if calling internal API, but that's complex in server-side.
            // Alternative: Import the GET handler NOT possible due to Next.js restrictions easily.
            // Best: Duplicate logic or simple data fetch.
            // Let's do simple data fetch here matching summary route.
            const supabase = await createClient();

            // Parallel Fetch: Blocks, Goals, Commitments, Logs
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

            summaryData = {
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

        } catch (e) {
            console.error("Context fetch failed", e);
            return apiError("Failed to build context", 500);
        }

        // 2. Call AI
        const channel = ChannelRegistry['weekly_review'];
        const systemPrompt = channel.systemPrompt(summaryData);

        try {
            const textResponse = await groqChat({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Generate Weekly Review for ${week_start}` }
                ],
                userId,
                temperature: 0.3
            });

            // 3. Validate
            const validated = await JSONReliability.validateOrRepair(textResponse, WeeklyReviewOutputSchema, 'llama-3.3-70b-versatile', "weekly_review");

            return apiSuccess(validated);

        } catch (error) {
            console.error("AI Generation failed", error);
            // Fallback
            return apiSuccess(channel.fallback("AI Error"));
        }
    },
    { requireAuth: true }
);
