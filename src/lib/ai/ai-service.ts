import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { ChannelRegistry } from '@/lib/ai/registry';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { groqChat } from '@/lib/ai/groq-client';

// --- Configuration ---
const AI_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;
const MAX_CONTEXT_CHARS = 30_000;

// --- Request Schema ---
export const ExecuteRequestSchema = z.object({
    channel: z.string(),
    input: z.string().min(1).max(4000),
    context: z.record(z.string(), z.any()).optional().default({}),
    limits: z.object({
        max_options: z.number().min(1).max(3).optional(),
        low_energy: z.boolean().optional(),
        overwhelmed: z.boolean().optional(),
    }).optional(),
});

export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

// --- Helpers ---
function makeRequestId() {
    try {
        // @ts-ignore
        return crypto?.randomUUID?.() || `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    } catch {
        return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
}

function clipContext(ctx: any) {
    try {
        const s = JSON.stringify(ctx ?? {});
        if (s.length <= MAX_CONTEXT_CHARS) return ctx;
        return { __clipped: true, raw: s.slice(0, MAX_CONTEXT_CHARS) };
    } catch {
        return { __clipped: true, raw: '[unserializable_context]' };
    }
}

function channelRequiresOptions(channel: string) {
    return ['coach', 'brain_dump', 'weekly_review', 'goal_strategy', 'calendar_optimize', 'plan_week', 'optimize_week', 'habit_stack', 'habit_stacks'].includes(channel);
}

function safeFallback(channel: string, requestId: string) {
    const baseOptions = [
        {
            id: "retry",
            title: "Try again",
            label: "Try again",
            impact: "Retry generation",
            tradeoff: "Retry generation",
            patch: { ops: [], undoable: true, reason: "retry" },
            explanation: "Temporary error. Retry now."
        },
        {
            id: "open_calendar",
            title: "Open Calendar",
            label: "Open Calendar",
            impact: "Adjust manually",
            tradeoff: "Adjust manually",
            patch: { ops: [], undoable: true, reason: "noop" },
            explanation: "Adjust manually for now.",
            actions: [{ type: "navigate", target: "/calendar" }]
        }
    ];

    const fallback: any = {
        channel,
        summary: "AI temporarily unavailable. Choose a safe fallback.",
        mode: "propose",
        options: baseOptions,
        _meta: { request_id: requestId }
    };

    if (channel === 'habit_stack' || channel === 'habit_stacks') {
        fallback.stacks = [{
            name: "Manual Habit",
            steps: [{ trigger: "Existing Routine", title: "New Habit", minutes: 5 }]
        }];
    }

    if (channel === 'calendar' || channel === 'calendar.optimize' || channel === 'calendar_optimize') {
        fallback.analysis = {
            energy_state: 'normal',
            schedule_health: 'balanced',
            flow_opportunity: 'moderate'
        };
        fallback.strategy = {
            main_focus: "Manual adjustment",
            changes_made: "AI unavailable, no changes proposed.",
            reality_check_applied: false
        };
        fallback.patch = { ops: [], undoable: false, reason: "fallback" };
    }

    if (channel === 'brain_dump') {
        fallback.extracted = {
            summary: "AI analysis temporarily unavailable.",
            signals: { energy: 50, mood: "neutral" },
            items: []
        };
    }

    if (channel === 'goal_decomposition') {
        fallback.plan = {
            analysis: {
                complexity: 'low',
                time_horizon: 'unknown',
                resources: [],
                obstacles: ['AI unavailable']
            },
            milestones: [
                {
                    title: "Phase 1: Foundation",
                    description: "Setting up the initial environment and resources.",
                    deadline_offset_days: 7,
                    tasks: [
                        { title: "Research requirements", estimated_minutes: 60, is_recurring: false },
                        { title: "Setup workspace", estimated_minutes: 30, is_recurring: false }
                    ]
                },
                {
                    title: "Phase 2: Execution",
                    description: "Core implementation tasks.",
                    deadline_offset_days: 14,
                    tasks: [
                        { title: "Daily Practice", estimated_minutes: 45, is_recurring: true, recurrence: "daily" }
                    ]
                }
            ]
        };
        fallback.summary = "Decomposition service unavailable. Using emergency backup plan.";
    }

    return fallback;
}

/**
 * Core AI Execution Service
 * Handles context enrichment, prompt building, LLM execution, and JSON repair.
 */
export async function executeAI(userId: string, body: ExecuteRequest) {
    const requestId = makeRequestId();
    const startTime = Date.now();

    try {
        // 1. Validate Request (if not already validated)
        // We assume valid input if coming from internal call, but safeParse doesn't hurt.
        const result = ExecuteRequestSchema.safeParse(body);
        if (!result.success) {
            console.error(`[AI Service] [${requestId}] Validation Failed:`, JSON.stringify(result.error.format()));
            throw new Error(`Validation Error: ${JSON.stringify(result.error.format())}`);
        }

        let { channel, input, context: aiContext, limits } = result.data;



        console.log(`[AI Service] [${requestId}] START channel=${channel} input_len=${input.length}`);

        if (!(channel in ChannelRegistry)) {
            throw new Error(`Unknown channel: ${channel}`);
        }

        const channelDef = ChannelRegistry[channel];
        let richContext = { ...aiContext };

        // 3. Context Enrichment
        try {
            // GLOBAL CONTEXT INJECTION (Phase 15)
            // Every AI call gets the "Liquid Context" (User, State, Schedule, Goals)
            const { ContextService } = await import('@/lib/ai/context-service');
            const liquidContext = await ContextService.getLiquidContext(userId);
            richContext = { ...richContext, ...liquidContext };

            if (channel === 'coach' || channel === 'goal_strategy' || channel === 'habit_stack') {
                const { buildCoachContext, saveCoachMessage } = await import('@/lib/coach/coach-context');
                const coachSupabase = await createClient();
                const coachCtx = await buildCoachContext(userId, coachSupabase);
                richContext = { ...richContext, ...coachCtx };

                if (channel === 'coach') {
                    saveCoachMessage(userId, 'user', input, coachSupabase).catch(e =>
                        console.warn(`[AI Service] [${requestId}] Failed to save user msg:`, e)
                    );
                }
            } else if (channel === 'brain_dump') {
                const { buildBrainDumpContext } = await import('@/lib/brain-dump/brain-dump-context');
                const coachSupabase = await createClient();
                const bdCtx = await buildBrainDumpContext(userId, coachSupabase);
                richContext = { ...richContext, ...bdCtx };
            }
        } catch (e: any) {
            console.warn(`[AI Service] [${requestId}] Context enrichment warning:`, e.message);
        }

        richContext = clipContext(richContext);

        // 4. Build Prompts
        const systemMsg = channelDef.systemPrompt(richContext, limits);
        const userMsg = channelDef.userPrompt(input, richContext);

        // 5. Execute LLM
        let rawText: string | null = null;
        let lastError: Error | null = null;
        let abortController: AbortController | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController?.abort(), AI_TIMEOUT_MS);

                try {
                    rawText = await groqChat({
                        model: channelDef.config.model,
                        messages: [
                            { role: 'system', content: systemMsg },
                            { role: 'user', content: userMsg }
                        ],
                        temperature: channelDef.config.temperature,
                        max_tokens: channelDef.config.maxTokens,
                        userId: userId,
                        signal: abortController.signal,
                    });
                } finally {
                    clearTimeout(timeoutId);
                }

                if (rawText) break;
            } catch (e: any) {
                lastError = e;
                console.warn(`[AI Service] [${requestId}] Attempt ${attempt + 1} failed:`, e.message);

                const isRetryable = e.message.includes('429') || e.message.includes('network') || e.message.includes('fetch') || e.message.includes('timed out');
                if (attempt < MAX_RETRIES && isRetryable) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                break;
            }
        }

        if (!rawText) {
            console.error(`[AI Service] [${requestId}] All attempts failed. Returning fallback.`);
            const fallback = safeFallback(channel, requestId);
            return { ...fallback, _meta: { request_id: requestId, degraded: true } };
        }

        // 6. JSON Structure Recovery
        let data: any;
        try {
            const repairController = new AbortController();
            const repairTimeout = setTimeout(() => repairController.abort(), 8000);

            try {
                const schemaHint = (channelDef as any).schemaHint || "See attached schema";

                data = await JSONReliability.validateOrRepair(
                    rawText,
                    channelDef.schema,
                    channelDef.config.model,
                    schemaHint,
                    repairController.signal
                );
            } finally {
                clearTimeout(repairTimeout);
            }

            if ((channel === 'calendar' || channel === 'calendar.optimize') && !(data as any)?.analysis) {
                (data as any).analysis = {
                    energy_state: 'normal',
                    schedule_health: 'balanced',
                    flow_opportunity: 'moderate'
                };
                if (!(data as any).strategy) {
                    (data as any).strategy = {
                        main_focus: "Manual adjustment",
                        changes_made: "AI response incomplete.",
                        reality_check_applied: false
                    };
                }
                if (!(data as any).patch) {
                    (data as any).patch = { ops: [], undoable: false, reason: "repair" };
                }
            }

            if (channelRequiresOptions(channel)) {
                const opts = (data as any)?.options;
                if (!Array.isArray(opts) || opts.length === 0) {
                    console.warn(`[AI Service] [${requestId}] No options returned. Injecting fallback.`);
                    const fallback = safeFallback(channel, requestId);
                    data = {
                        ...fallback,
                        summary: data.summary || fallback.summary
                    };
                }
            }
        } catch (e: any) {
            console.error(`[AI Service] [${requestId}] Schema validation failed:`, e.message);
            const fallback = safeFallback(channel, requestId);
            return { ...fallback, _meta: { request_id: requestId, degraded: true } };
        }

        const latencyMs = Date.now() - startTime;
        console.log(`[AI Service] [${requestId}] SUCCESS channel=${channel} latency=${latencyMs}ms`);

        return { ...data, _meta: { request_id: requestId, latency_ms: latencyMs } };

    } catch (error: any) {
        console.error(`[AI Service] [${requestId}] CRITICAL FAILURE:`, error);
        const channelName = body.channel || 'unknown';
        const fallback = safeFallback(channelName, requestId);
        return {
            ...fallback,
            summary: "System error. We've loaded a backup plan.",
            _meta: { request_id: requestId, degraded: true, error: error.message }
        };
    }
}
