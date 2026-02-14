import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { ChannelRegistry } from '@/lib/ai/registry';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { groqChat } from '@/lib/ai/groq-client';

// --- Configuration ---
export const runtime = 'nodejs'; // FORCE NODEJS (Critical for Vercel/Supabase)
export const maxDuration = 60; // 60s timeout for Pro plan (or max allowed)

// --- Request Schema ---
const ExecuteRequestSchema = z.object({
    channel: z.string(),
    input: z.string().min(1).max(4000), // ✅ Reduced to 4000 to prevent timeouts
    context: z.record(z.string(), z.any()).optional().default({}),
    limits: z.object({
        max_options: z.number().min(1).max(3).optional(),
        low_energy: z.boolean().optional(),
        overwhelmed: z.boolean().optional(),
    }).optional(),
});

// --- Constants ---
const AI_TIMEOUT_MS = 20_000;   // ✅ reduced to avoid Vercel kill
const MAX_RETRIES = 1;
const MAX_CONTEXT_CHARS = 30_000; // ✅ prevent huge payloads

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
        // clip by string and reparse into object to keep it safe
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
            label: "Try again", // ✅ For StrategyOptionCard
            impact: "Retry generation",
            tradeoff: "Retry generation", // ✅ For StrategyOptionCard
            patch: { ops: [], undoable: true, reason: "retry" },
            explanation: "Temporary error. Retry now."
        },
        {
            id: "open_calendar",
            title: "Open Calendar",
            label: "Open Calendar", // ✅ For StrategyOptionCard
            impact: "Adjust manually",
            tradeoff: "Adjust manually", // ✅ For StrategyOptionCard
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

    // ✅ Special handling for Habit Stacks which expects 'stacks'
    if (channel === 'habit_stack' || channel === 'habit_stacks') {
        fallback.stacks = [{
            name: "Manual Habit",
            steps: [{ trigger: "Existing Routine", title: "New Habit", minutes: 5 }]
        }];
    }

    // ✅ Special handling for Calendar Optimization which expects 'schedule_health'
    if (channel === 'calendar' || channel === 'calendar.optimize' || channel === 'calendar_optimize') {
        fallback.schedule_health = {
            score: 70,
            summary: "Day is manually managed (AI unavailable).",
            issues: []
        };
        fallback.proposed_schedule = [];
    }

    return fallback;
}

export const POST = secureApiRoute(
    async (context, body) => {
        const requestId = makeRequestId();
        const startTime = Date.now();

        // 0. Top-Level Try/Catch to prevent 502s
        try {
            // 1. Validate Request
            const result = ExecuteRequestSchema.safeParse(body);
            if (!result.success) {
                console.error(`[AI Gateway] [${requestId}] Validation Failed:`, JSON.stringify(result.error.format()));
                return apiError('Invalid request format', 400, 'VALIDATION_ERROR', result.error.format());
            }

            let { channel, input, context: aiContext, limits } = result.data;

            // Alias for compatibility
            if (channel === 'goal_decomposition') channel = 'goal_strategy';

            console.log(`[AI Gateway] [${requestId}] START channel=${channel} input_len=${input.length}`);

            // 2. Validate Channel
            if (!(channel in ChannelRegistry)) {
                return apiError(`Unknown channel: ${channel}`, 400, 'BAD_REQUEST');
            }

            const channelDef = ChannelRegistry[channel];
            let richContext = { ...aiContext };

            // 3. Context Enrichment (Fail-Safe)
            try {
                if (channel === 'coach' || channel === 'goal_strategy' || channel === 'habit_stack') {
                    const { buildCoachContext, saveCoachMessage } = await import('@/lib/coach/coach-context');
                    const coachSupabase = await createClient();
                    const coachCtx = await buildCoachContext(context.userId!, coachSupabase);
                    richContext = { ...richContext, ...coachCtx };

                    if (channel === 'coach') {
                        // Fire-and-forget user message save
                        saveCoachMessage(context.userId!, 'user', input, coachSupabase).catch(e =>
                            console.warn(`[AI Gateway] [${requestId}] Failed to save user msg:`, e)
                        );
                    }
                } else if (channel === 'brain_dump') {
                    const { buildBrainDumpContext } = await import('@/lib/brain-dump/brain-dump-context');
                    const coachSupabase = await createClient();
                    const bdCtx = await buildBrainDumpContext(context.userId!, coachSupabase);
                    richContext = { ...richContext, ...bdCtx };
                }
            } catch (e: any) {
                console.warn(`[AI Gateway] [${requestId}] Context enrichment warning:`, e.message);
                // Continue with partial context
            }

            richContext = clipContext(richContext); // ✅ ensure it can't explode tokens

            // 4. Build Prompts
            const systemMsg = channelDef.systemPrompt(richContext, limits);
            const userMsg = channelDef.userPrompt(input, richContext);

            // 5. Execute LLM with Strict Timeboxing & Retry
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
                            userId: context.userId,
                            signal: abortController.signal, // ✅ NOW abort works
                        });
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    if (rawText) break; // Success
                } catch (e: any) {
                    lastError = e;
                    console.warn(`[AI Gateway] [${requestId}] Attempt ${attempt + 1} failed:`, e.message);

                    const isRetryable = e.message.includes('429') || e.message.includes('network') || e.message.includes('fetch') || e.message.includes('timed out');
                    if (attempt < MAX_RETRIES && isRetryable) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    // Stop retrying
                    break;
                }
            }

            if (!rawText) {
                // Return safe fallback instead of throwing
                console.error(`[AI Gateway] [${requestId}] All attempts failed. Returning fallback.`);
                const fallback = safeFallback(channel, requestId);
                return apiSuccess({ ...fallback, _meta: { request_id: requestId, degraded: true } });
            }

            // 6. JSON Structure Recovery
            let data: any;
            try {
                // Use a fresh abort controller for repair if needed, or pass the remaining time?
                // Better to give Repair its own short timeout
                const repairController = new AbortController();
                const repairTimeout = setTimeout(() => repairController.abort(), 8000); // 8s max for repair

                try {
                    // Extract Schema Hint if available on channelDef (it might not be typed yet, so cast or fallback)
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

                if (channelRequiresOptions(channel)) {
                    const opts = (data as any)?.options;
                    if (!Array.isArray(opts) || opts.length === 0) {
                        // ✅ Prevent "AI returned no options" UI crash
                        console.warn(`[AI Gateway] [${requestId}] No options returned for ${channel}. Injecting fallback.`);
                        // Instead of replacing entirely, we can inject options if Mode is ask/refuse? 
                        // Actually safeFallback is better to ensure UI has something to render.
                        // But maybe we keep the summary if valid?
                        const fallback = safeFallback(channel, requestId);
                        data = {
                            ...fallback,
                            summary: data.summary || fallback.summary // keep summary if we have it
                        };
                    }
                }
            } catch (e: any) {
                console.error(`[AI Gateway] [${requestId}] Schema validation failed completely:`, e.message);
                console.error(`[AI Gateway] [${requestId}] Raw Invalid Output:`, rawText.slice(0, 500));

                // ✅ Never hard-fail the UI if AI returns junk.
                // Return a safe fallback so the UI remains usable.
                const fallback = safeFallback(channel, requestId);
                return apiSuccess({ ...fallback, _meta: { request_id: requestId, degraded: true } });
            }

            // 7. Success & Side Effects
            const latencyMs = Date.now() - startTime;
            console.log(`[AI Gateway] [${requestId}] SUCCESS channel=${channel} latency=${latencyMs}ms`);

            return apiSuccess({ ...data, _meta: { request_id: requestId, latency_ms: latencyMs } });

        } catch (error: any) {
            // CATCH-ALL SAFETY NET
            const duration = Date.now() - startTime;
            console.error(`[AI Gateway] [${requestId}] CRITICAL FAILURE:`, error);

            // Return fallback instead of 500/502 where possible, or at least a clean error
            // Actually, for critical failure, let's also return a fallback if possible?
            // "AI System Error" is better than 502, but UI might still break if it expects specific shape.
            // Let's return apiSuccess with the fallback structure but marked as degraded.

            const channelName = (body as any)?.channel || 'unknown';
            const fallback = safeFallback(channelName, requestId);
            return apiSuccess({
                ...fallback,
                summary: "System error. We've loaded a backup plan.",
                _meta: { request_id: requestId, degraded: true, error: error.message }
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_execute',
    }
);
