import { callAI, getCircuitStates } from '@/lib/ai/unified-client';
import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';
import {
    computeMetrics,
    describeMetrics,
    fetchReviewGoals,
    todayFor,
    type WeekMetrics,
} from '@/lib/chain/week-stats';
import { buildProposals, type GoalUsage } from '@/lib/chain/proposals';
import { dryRunWeek, nextMondayAfter } from '@/lib/scheduling/dry-run';
import { gateReviewWindow } from '@/lib/weekly-review/server-gate';

export const maxDuration = 60;

/**
 * POST /api/weekly-review/generate-report
 *
 * The AI narrative ONLY. Every deterministic number now comes from
 * /api/weekly-review/stats, which cannot fail.
 *
 * This route is incapable of returning a non-2xx except for genuine auth and
 * rate-limit rejections — and, since Prompt 54, the review-window refusal. An
 * unavailable AI summary is a normal outcome — it returns `{ available: false }`
 * at HTTP 200 so one provider outage can never blank a page full of perfectly
 * good Postgres data again.
 *
 * Prompt 54 §5: the summary is generated ONLY on a Monday (user's timezone)
 * and ONLY for last week. Anything else is refused with REVIEW_WINDOW_CLOSED /
 * REVIEW_WEEK_NOT_REVIEWABLE before a single token is spent.
 */

const isDev = process.env.NODE_ENV !== 'production';

export interface ProviderError {
    provider: string;
    model: string;
    status: number | null;
    message: string;
}

/**
 * OpenRouter is last in the batch chain and 402s on every call when the account
 * has no credit — which means its billing message masks whatever actually went
 * wrong upstream. Once we have seen a 402 in this process we stop attempting
 * it: it costs a round trip and poisons the error message.
 *
 * Process-level on purpose. A credit top-up revives it on the next server
 * start, which is exactly the intended lifetime.
 */
let openRouterDead = false;

/** Pull an HTTP status out of a provider error string like "groq API 429: ...". */
function parseStatus(message: string): number | null {
    const m = message.match(/\b(4\d{2}|5\d{2})\b/);
    return m ? Number(m[1]) : null;
}

const isRateLimit = (e: ProviderError) =>
    e.status === 429 || /rate limit|too many requests/i.test(e.message);

/**
 * Order the failures so the actionable one leads. A 429 is almost always the
 * real cause and is self-healing; a 402 is a standing billing state that would
 * otherwise sit at the front simply because it happens to be last in the chain.
 */
function orderErrors(errors: ProviderError[]): ProviderError[] {
    return [...errors].sort((a, b) => {
        const rank = (e: ProviderError) => (isRateLimit(e) ? 0 : e.status === 402 ? 2 : 1);
        return rank(a) - rank(b);
    });
}

/** `available: false` is a normal response, not an error. */
function unavailable(reason?: string, errors: ProviderError[] = []) {
    const ordered = orderErrors(errors);
    const rateLimited = ordered.some(isRateLimit);
    return apiSuccess({
        available: false,
        rate_limited: rateLimited,
        // Provider detail is useful locally and must never leak to users.
        ...(isDev && reason ? { reason } : {}),
        ...(isDev && ordered.length ? { provider_errors: ordered } : {}),
        summary: null,
        achievements: [],
        struggles: [],
    });
}

export const POST = secureApiRoute(
    async (context, bodyData) => {
        const { userId, supabase } = context;

        const body = (bodyData as any) || {};
        // §5: refuse before any work. Outside the gate's own errors this is
        // the only non-2xx the route produces on purpose.
        const gate = await gateReviewWindow(supabase, userId, 'generate-report', body.weekStart);
        if (!gate.ok) return gate.response;
        const userTimezone = gate.window.timezone;

        try {
            const weekStart = gate.weekStart;
            const weekEnd = gate.weekEnd;

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
                const [blocksRes, goalsRes] = await Promise.all([
                    supabase
                        .from('schedule_blocks')
                        .select('id, date, start_time, end_time, status, block_type, pillar, goal_id, title')
                        .eq('user_id', userId)
                        .gte('date', weekStart)
                        .lte('date', weekEnd),
                    // The SAME query /stats uses. The hand-written duplicate
                    // that lived here filtered `.eq('is_paused', false)`, which
                    // never matches NULL — see fetchReviewGoals.
                    fetchReviewGoals(supabase, userId),
                ]);

                if (blocksRes.error) throw blocksRes.error;

                todayIso = todayFor(userTimezone);
                metrics = computeMetrics(blocksRes.data || [], goalsRes.active, todayIso);
                console.log(
                    `[WeeklyReview/Report] ${describeMetrics(metrics, weekStart, goalsRes.all.length, goalsRes.active.length)}`
                );
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
                    importance: gs.importance,
                };
            }

            // The same dry run /stats uses, memoised per user+week — so the
            // prose and the proposal panel can never disagree about whether the
            // user is being asked to reshape a week or to give hours up. A cache
            // hit costs nothing; a miss costs one deterministic week generation.
            const dry = await dryRunWeek(supabase, userId, nextMondayAfter(todayIso)).catch(() => null);

            const proposals = buildProposals(usage, todayIso, {
                dryRun: dry?.ok ? { ok: true, unscheduledByGoal: dry.unscheduledByGoal } : null,
                capacity: dry?.capacity ?? null,
            });
            const proposalContext = proposals.length
                ? `\nAdjustments already decided for them (do not restate as JSON, just weave into the prose). ` +
                  `A "reshape" keeps their weekly hours exactly and only changes the shape — never describe one as cutting back, ` +
                  `lowering the bar, or doing less:\n${proposals
                      .map(
                          (pr) =>
                              `- ${pr.title} [${pr.change_type}]: ${pr.headline}. ${pr.old_value} -> ${pr.new_value}. ${pr.rationale}`
                      )
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

            // Skipping a provider that cannot possibly succeed, without touching
            // unified-client: the batch chain is built from process.env
            // SYNCHRONOUSLY, before callAI's first await. Removing the key and
            // restoring it before we await keeps the whole swap inside one
            // synchronous block, so no other request can observe it.
            const savedOpenRouterKey = process.env.OPENROUTER_API_KEY;
            if (openRouterDead && savedOpenRouterKey) {
                console.log(
                    '[WeeklyReview] Skipping OpenRouter: it returned 402 (no credit) earlier in this process. Restart the server after topping up to re-enable it.'
                );
                delete process.env.OPENROUTER_API_KEY;
            }

            // The narrative and the metrics chip have disagreed before. Setting
            // WEEKLY_REVIEW_DEBUG_PROMPT dumps the exact string the model saw,
            // so the next disagreement can be read rather than guessed at.
            if (process.env.WEEKLY_REVIEW_DEBUG_PROMPT) {
                console.log(`[WeeklyReview/Report] PROMPT >>>\n${prompt}\n<<< END PROMPT`);
            }

            const aiPromise = callAI({
                model: 'smart',
                systemPrompt: 'You are an AI coach that outputs ONLY valid JSON matching the schema.',
                prompt,
                requireJSON: true,
                // Its own chain: Gemini → Groq → OpenRouter. A once-a-week batch
                // job must not compete with the real-time coach for providers.
                batchReview: true,
                timeout: AI_BUDGET_MS,
            });

            // Restore before the first await — see the note above.
            if (openRouterDead && savedOpenRouterKey) {
                process.env.OPENROUTER_API_KEY = savedOpenRouterKey;
            }

            const aiRes = await aiPromise;

            if (!aiRes.success) {
                const elapsed = Date.now() - startedAt;

                // Assemble every provider failure we can actually observe.
                //
                // LIMITATION: callAI returns only the LAST attempt, so the
                // per-attempt list has to be reconstructed. The circuit-breaker
                // states (exported in Prompt 19) are real evidence — a breaker
                // only opens on 429/5xx — so a rate-limited provider shows up
                // here even though its individual error never reaches us.
                const errors: ProviderError[] = [];
                const lastProvider = String((aiRes as any)?.provider ?? 'unknown');
                const lastModel = String((aiRes as any)?.model ?? 'unknown');
                const lastMessage = aiRes.error || 'All providers failed';
                errors.push({
                    provider: lastProvider,
                    model: lastModel,
                    status: parseStatus(lastMessage),
                    message: lastMessage,
                });

                const circuits = getCircuitStates();
                for (const [provider, c] of Object.entries(circuits)) {
                    if (provider === lastProvider || c.failures === 0) continue;
                    errors.push({
                        provider,
                        model: '(from circuit breaker)',
                        status: 429,
                        message: `Breaker ${c.state} after ${c.failures} failure(s) — only 429/5xx open a breaker, so this provider was rate-limited or erroring.`,
                    });
                }

                if (openRouterDead) {
                    errors.push({
                        provider: 'openrouter',
                        model: '(skipped)',
                        status: 402,
                        message: 'Skipped: returned 402 (no credit) earlier in this process.',
                    });
                }

                // Remember a 402 so the next call skips the round trip entirely.
                if (lastProvider === 'openrouter' && parseStatus(lastMessage) === 402 && !openRouterDead) {
                    openRouterDead = true;
                    console.warn(
                        '[WeeklyReview] OpenRouter returned 402 (no credit). It will be skipped for the rest of this process.'
                    );
                }

                const ordered = orderErrors(errors);
                console.error(
                    `[WeeklyReview] AI failed: ${JSON.stringify({
                        chain: 'batchReview (gemini -> groq -> openrouter)',
                        elapsed_ms: elapsed,
                        budget_ms: AI_BUDGET_MS,
                        rate_limited: ordered.some(isRateLimit),
                        provider_errors: ordered,
                        circuits,
                    })}`
                );
                return unavailable(lastMessage, errors);
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
