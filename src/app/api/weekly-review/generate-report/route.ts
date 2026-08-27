import { callAI, getCircuitStates } from '@/lib/ai/unified-client';
import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';
import {
    computeMetrics,
    defaultWeek,
    todayFor,
    type WeekMetrics,
} from '@/lib/chain/week-stats';
import { buildProposals, type GoalUsage } from '@/lib/chain/proposals';

export const maxDuration = 60;

/**
 * POST /api/weekly-review/generate-report
 *
 * The AI narrative ONLY. Every deterministic number now comes from
 * /api/weekly-review/stats, which cannot fail.
 *
 * This route is incapable of returning a non-2xx except for genuine auth and
 * rate-limit rejections. An unavailable AI summary is a normal outcome — it
 * returns `{ available: false }` at HTTP 200 so one provider outage can never
 * blank a page full of perfectly good Postgres data again.
 */

const isDev = process.env.NODE_ENV !== 'production';

/** `available: false` is a normal response, not an error. */
function unavailable(reason?: string) {
    return apiSuccess({
        available: false,
        // Provider errors are useful locally and must never leak to users.
        ...(isDev && reason ? { reason } : {}),
        summary: null,
        achievements: [],
        struggles: [],
    });
}

export const POST = secureApiRoute(
    async (context, bodyData) => {
        const { userId, supabase } = context;

        try {
            const body = (bodyData as any) || {};
            const fallback = defaultWeek();
            const weekStart = body.weekStart || fallback.weekStart;
            const weekEnd = body.weekEnd || fallback.weekEnd;

            // The prompt's inputs are computed here rather than sent by the
            // client, so this request never has to wait on /stats.
            let metrics: WeekMetrics = {
                plannedMinutes: 0,
                completedMinutes: 0,
                skippedMinutes: 0,
                goalStats: {},
            };
            let todayIso = todayFor(null);

            try {
                const [blocksRes, goalsRes, profileRes] = await Promise.all([
                    supabase
                        .from('schedule_blocks')
                        .select('id, date, start_time, end_time, status, block_type, pillar, goal_id, title')
                        .eq('user_id', userId)
                        .gte('date', weekStart)
                        .lte('date', weekEnd),
                    supabase
                        .from('goals')
                        .select('id, title, importance, minutes_per_day, days_per_week')
                        .eq('user_id', userId)
                        .eq('is_paused', false),
                    supabase.from('profiles').select('timezone').eq('id', userId).single(),
                ]);

                if (blocksRes.error) throw blocksRes.error;
                if (goalsRes.error) throw goalsRes.error;

                todayIso = todayFor(profileRes.data?.timezone);
                metrics = computeMetrics(blocksRes.data || [], goalsRes.data || [], todayIso);
            } catch (dbError: any) {
                console.error(
                    `[WeeklyReview] Metric gather failed: ${JSON.stringify({
                        code: dbError?.code,
                        message: dbError?.message,
                        details: dbError?.details,
                    })}`
                );
                return unavailable(`Could not read week data: ${dbError?.message || 'unknown'}`);
            }

            // The deterministic proposals are passed in as CONTEXT only, so the
            // prose can reference them. They never come back from the model —
            // two sources of truth for one decision is worse than none.
            const usage: Record<string, GoalUsage> = {};
            for (const [goalId, gs] of Object.entries(metrics.goalStats)) {
                usage[goalId] = {
                    title: gs.title,
                    weeklyTarget: gs.weeklyTarget,
                    completed: gs.completed,
                    minutesPerDay: gs.minutesPerDay,
                    daysPerWeek: gs.daysPerWeek,
                    activeDays: gs.activeDays,
                    eligibleBlocks: gs.eligibleBlocks,
                    completedBlocks: gs.completedBlocks,
                    createdAt: gs.createdAt,
                };
            }
            const proposals = buildProposals(usage, todayIso);
            const proposalContext = proposals.length
                ? `\nAdjustments already decided for them (do not restate as JSON, just weave into the prose):\n${proposals
                      .map((pr) => `- ${pr.title}: ${pr.old_value} -> ${pr.new_value}. ${pr.rationale}`)
                      .join('\n')}\n`
                : '\nTheir goals matched their week; no adjustments are being proposed.\n';

            const goalLines = Object.values(metrics.goalStats)
                .map(
                    (g) =>
                        `- ${g.title} (Importance: ${g.importance}): Target = ${Math.round(g.weeklyTarget / 60)}h. Planned = ${Math.round(g.planned / 60)}h, Completed = ${Math.round(g.completed / 60)}h, Skipped = ${Math.round(g.skipped / 60)}h`
                )
                .join('\n');

            const prompt = `You are PlannrAI, an elite AI productivity and lifestyle coach.
You are running a Weekly Review for the user. Your job is to analyze their performance for the week against their goals and commitments.
Be objective, empathetic, but very practical.

The user's schedule blocks this week:
- Total Planned Time: ${Math.round(metrics.plannedMinutes / 60)} hours
- Completed Time: ${Math.round(metrics.completedMinutes / 60)} hours
- Skipped Time: ${Math.round(metrics.skippedMinutes / 60)} hours

Goals Breakdown:
${goalLines}

${proposalContext}
Write an honest, practical reflection on the week. If the adjustments listed above are present, you may reference them in your prose so the summary and the proposed changes read as one coherent story — but do NOT output the changes themselves, they are decided elsewhere.
If they nailed everything, congratulate them and suggest maintaining or slightly pushing.

You MUST respond in JSON format matching this schema:
{
    "summary": "A 2-3 sentence summary of their week.",
    "achievements": ["A bullet point celebrating a win", ...],
    "struggles": ["A bullet point calling out an area they struggled with", ...]
}`;

            // 50s stays inside maxDuration = 60.
            const AI_BUDGET_MS = 50000;
            const startedAt = Date.now();

            const aiRes = await callAI({
                model: 'smart',
                systemPrompt: 'You are an AI coach that outputs ONLY valid JSON matching the schema.',
                prompt,
                requireJSON: true,
                // Its own chain: Gemini → Groq → OpenRouter. A once-a-week batch
                // job must not compete with the real-time coach for providers.
                batchReview: true,
                timeout: AI_BUDGET_MS,
            });

            if (!aiRes.success) {
                const elapsed = Date.now() - startedAt;
                // §2b — `circuitBreakers` is module-private in unified-client.ts
                // and nothing exports it, so its state cannot be read from here
                // without editing that file (which §6 forbids).
                //
                // What CAN be stated from the code: recordFailure() returns
                // early unless the status is 429 or 5xx, so a 402/404/410 never
                // trips a breaker and that provider is retried every single
                // call. Only a rate-limited or 5xx provider can be silently
                // skipped. The per-provider verdict is in the [AI ✗] lines
                // immediately above this one.
                // Interpolated into the message rather than passed as a second
                // argument: Next's dev logger serialises extra console args as
                // `{}`, which made this diagnostic invisible in the one log it
                // exists for.
                console.error(
                    `[WeeklyReview] AI failed: ${JSON.stringify({
                        chain: 'batchReview (gemini -> groq -> openrouter)',
                        error: aiRes.error,
                        last_provider: (aiRes as any)?.provider,
                        last_model: (aiRes as any)?.model,
                        elapsed_ms: elapsed,
                        budget_ms: AI_BUDGET_MS,
                        circuits: getCircuitStates(),
                        circuit_rule:
                            'Only 429/5xx open a breaker; 4xx providers are retried every call.',
                    })}`
                );
                return unavailable(aiRes.error || 'All providers failed');
            }

            console.log(
                `[WeeklyReview] AI summary generated by ${(aiRes as any)?.provider}/${(aiRes as any)?.model} in ${(aiRes as any)?.latency_ms}ms`
            );

            const data = (aiRes.data as any) || {};

            // `proposed_goal_changes` is deliberately NOT read back off the
            // model, even if it volunteers one. /stats owns that decision.
            return apiSuccess({
                available: true,
                summary: data.summary ?? null,
                achievements: Array.isArray(data.achievements) ? data.achievements : [],
                struggles: Array.isArray(data.struggles) ? data.struggles : [],
                weekStart,
                weekEnd,
            });
        } catch (error: any) {
            // Nothing in this route is worth a 500. The page renders without us.
            console.error(`[WeeklyReview] generate-report threw: ${error?.message}`, error?.stack);
            return unavailable(error?.message || 'Unexpected error');
        }
    },
    { requireAuth: true, rateLimit: 'aiWeeklyReview' }
);
