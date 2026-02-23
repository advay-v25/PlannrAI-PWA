import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { ChannelRegistry } from '@/lib/ai/registry';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { openRouterChat } from '@/lib/ai/openrouter-client';

// --- Configuration ---
const AI_TIMEOUT_MS = 30_000;
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
        let s = JSON.stringify(ctx ?? {});
        if (s.length <= MAX_CONTEXT_CHARS) return ctx;

        // Smart Pruning Strategy
        console.warn(`[AI Service] Context too large (${s.length} chars). Pruning...`);
        const pruned = { ...ctx };

        // 1. Logs (Heavy text) -> Remove
        if (pruned.recentLogs) pruned.recentLogs = [];
        if (pruned.daily_logs) pruned.daily_logs = [];

        s = JSON.stringify(pruned);
        if (s.length <= MAX_CONTEXT_CHARS) return pruned;

        // 2. Schedule -> Limit to 20
        if (Array.isArray(pruned.schedule)) {
            pruned.schedule = pruned.schedule.slice(0, 20);
        } else if (pruned.schedule?.today) {
            // LiquidContext structure
            pruned.schedule.today = pruned.schedule.today.slice(0, 20);
            pruned.schedule.tomorrow = pruned.schedule.tomorrow.slice(0, 5);
            pruned.schedule.conflicts = [];
        }

        s = JSON.stringify(pruned);
        if (s.length <= MAX_CONTEXT_CHARS) return pruned;

        // 3. Goals -> Limit to 5
        if (Array.isArray(pruned.goals)) {
            pruned.goals = pruned.goals.slice(0, 5);
        } else if (pruned.goals?.active) {
            pruned.goals.active = pruned.goals.active.slice(0, 5);
        }

        s = JSON.stringify(pruned);
        if (s.length <= MAX_CONTEXT_CHARS) return pruned;

        // 4. Anchors -> Limit to 5
        if (Array.isArray(pruned.anchors)) pruned.anchors = pruned.anchors.slice(0, 5);

        s = JSON.stringify(pruned);
        if (s.length <= MAX_CONTEXT_CHARS) return pruned;

        // 5. Emergency Clip (Destructive)
        console.error(`[AI Service] Context STILL too large (${s.length}). Hard clipping.`);
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
            // GLOBAL CONTEXT INJECTION
            const { ContextService } = await import('@/lib/ai/context-service');
            const liquidContext = await ContextService.getLiquidContext(userId);
            richContext = { ...richContext, ...liquidContext };

            // FEATURE-SPECIFIC CONTEXT — all AI channels get schedule/goal/capacity enrichment
            const ENRICHED_CHANNELS = [
                'coach', 'goal_strategy', 'habit_stack', 'brain_dump',
                'weekly_review', 'calendar_plan_week', 'calendar_optimize_day'
            ];

            if (ENRICHED_CHANNELS.includes(channel)) {
                const { buildFeatureContext } = await import('@/lib/services/feature-context');
                const featureSupabase = await createClient();
                const featureCtx = await buildFeatureContext(userId, featureSupabase, {
                    includeChatHistory: channel === 'coach',
                    includeRecentDumps: channel === 'coach' || channel === 'brain_dump',
                    weekDays: channel === 'weekly_review' ? 7 : channel.startsWith('calendar_') ? 7 : 3
                });
                richContext = { ...richContext, ...featureCtx };

                // Coach-specific: save user message to thread
                if (channel === 'coach') {
                    const { saveCoachMessage } = await import('@/lib/coach/coach-context');
                    saveCoachMessage(userId, 'user', input, featureSupabase).catch(e =>
                        console.warn(`[AI Service] [${requestId}] Failed to save user msg:`, e)
                    );
                }
            }
        } catch (e: any) {
            console.warn(`[AI Service] [${requestId}] Context enrichment warning:`, e.message);
        }

        richContext = clipContext(richContext);

        // 4. Build Prompts
        const systemMsg = channelDef.systemPrompt(richContext, limits);
        const userMsg = channelDef.userPrompt(input, richContext);

        const debugMeta = {
            context_len_pre_clip: JSON.stringify(richContext).length, // approximate
            system_prompt_len: systemMsg.length,
            user_prompt_len: userMsg.length,
            model: channelDef.config.model,
            breakdown: (richContext as any)._debug_sizes
        };
        console.log(`[AI Service] [${requestId}] Sizes:`, debugMeta);

        // 5. Execute LLM
        let rawText: string | null = null;
        let lastError: Error | null = null;
        let abortController: AbortController | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController?.abort(), AI_TIMEOUT_MS);

                try {
                    const result = await openRouterChat(
                        [
                            { role: 'system', content: systemMsg },
                            { role: 'user', content: userMsg }
                        ],
                        {
                            model: channelDef.config.model,
                            temperature: channelDef.config.temperature,
                            maxTokens: channelDef.config.maxTokens
                        }
                    );
                    rawText = result.content;
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

            let fallback;
            fallback = ChannelRegistry[channel].fallback(input);

            return {
                ...fallback,
                _meta: {
                    request_id: requestId,
                    degraded: true,
                    error: lastError?.message || 'No response from LLM',
                    error_details: (lastError as any)?.meta,
                    debug: debugMeta
                }
            };
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
                // ... existing repair logic
            }

            if (channelRequiresOptions(channel)) {
                // ... existing options check
            }
        } catch (e: any) {
            console.error(`[AI Service] [${requestId}] Schema validation failed:`, e.message, JSON.stringify((e as any).cause || e, null, 2));
            console.error('RAW TEXT WAS:\n', rawText);

            let fallback;
            fallback = ChannelRegistry[channel].fallback(input);

            return {
                ...fallback,
                _meta: {
                    request_id: requestId,
                    degraded: true,
                    error: `Schema Validation Failed: ${e.message}`,
                    raw_text_snippet: rawText.slice(0, 200) // Leak a bit of raw text to see what happened
                }
            };
        }

        const latencyMs = Date.now() - startTime;
        console.log(`[AI Service] [${requestId}] SUCCESS channel=${channel} latency=${latencyMs}ms`);

        return { ...data, _meta: { request_id: requestId, latency_ms: latencyMs } };

    } catch (error: any) {
        console.error(`[AI Service] [${requestId}] CRITICAL FAILURE:`, error);

        const channelName = body?.channel || 'unknown';
        let fallback: any;
        if (channelName && channelName in ChannelRegistry) {
            fallback = ChannelRegistry[channelName].fallback(body?.input || '');
        } else {
            fallback = safeFallback(channelName, requestId);
        }

        // Ensure the error bubbles up into the fallback so the UI can log it during debugging
        if (fallback) {
            fallback.donna_note = `DEBUG FATAL: ${error.message}`;
            if (channelName === 'weekly_review') {
                fallback.reality = `DEBUG FATAL: ${error.message}`;
            }
        }

        throw new Error(error.message || 'AI Execution failed completely');
    }
}
