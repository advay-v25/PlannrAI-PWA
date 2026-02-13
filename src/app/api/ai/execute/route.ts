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
    input: z.string().min(1).max(12000), // Increased for larger context
    context: z.record(z.string(), z.any()).optional().default({}),
    limits: z.object({
        max_options: z.number().min(1).max(3).optional(),
        low_energy: z.boolean().optional(),
        overwhelmed: z.boolean().optional(),
    }).optional(),
});

// --- Constants ---
const AI_TIMEOUT_MS = 55_000; // 55s internal timeout (safety buffer before Vercel kills it)
const MAX_RETRIES = 1;

export const POST = secureApiRoute(
    async (context, body) => {
        const requestId = crypto.randomUUID();
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
            let coachSupabase: any = null;

            // 3. Context Enrichment (Fail-Safe)
            try {
                if (channel === 'coach' || channel === 'goal_strategy' || channel === 'habit_stack') {
                    const { buildCoachContext, saveCoachMessage } = await import('@/lib/coach/coach-context');
                    coachSupabase = await createClient();
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
                    coachSupabase = await createClient(); // reuse variable
                    const bdCtx = await buildBrainDumpContext(context.userId!, coachSupabase);
                    richContext = { ...richContext, ...bdCtx };
                }
            } catch (e: any) {
                console.warn(`[AI Gateway] [${requestId}] Context enrichment warning:`, e.message);
                // Continue with partial context
            }

            // 4. Build Prompts
            const systemMsg = channelDef.systemPrompt(richContext, limits);
            const userMsg = channelDef.userPrompt(input, richContext);

            // 5. Execute LLM with Strict Timeboxing & Retry
            let rawText: string | null = null;
            let lastError: Error | null = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const abortController = new AbortController();
                    const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

                    try {
                        rawText = await groqChat({
                            model: channelDef.config.model,
                            messages: [
                                { role: 'system', content: systemMsg },
                                { role: 'user', content: userMsg }
                            ],
                            temperature: channelDef.config.temperature,
                            max_tokens: channelDef.config.maxTokens,
                            userId: context.userId
                        });
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    if (rawText) break; // Success
                } catch (e: any) {
                    lastError = e;
                    console.warn(`[AI Gateway] [${requestId}] Attempt ${attempt + 1} failed:`, e.message);

                    const isRetryable = e.message.includes('429') || e.message.includes('network') || e.message.includes('fetch');
                    if (attempt < MAX_RETRIES && isRetryable) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    // Stop retrying
                    break;
                }
            }

            if (!rawText) {
                throw lastError || new Error('Upstream AI returned no content');
            }

            // 6. JSON Structure Recovery
            let data;
            try {
                data = await JSONReliability.validateOrRepair(
                    rawText,
                    channelDef.schema,
                    channelDef.config.model
                );
            } catch (e: any) {
                console.error(`[AI Gateway] [${requestId}] Schema validation failed completely:`, e.message);
                console.error(`[AI Gateway] [${requestId}] Raw Invalid Output:`, rawText.slice(0, 500));
                return apiError('AI response format invalid', 502, 'AI_INVALID_JSON', {
                    request_id: requestId,
                    raw_preview: rawText.slice(0, 100)
                });
            }

            // 7. Success & Side Effects
            const latencyMs = Date.now() - startTime;
            console.log(`[AI Gateway] [${requestId}] SUCCESS channel=${channel} latency=${latencyMs}ms`);

            // Non-blocking Audit & Persistence
            // We use setTimeout to detach from the response lifecycle on Vercel Node runtime
            setTimeout(async () => {
                try {
                    const sb = coachSupabase || await createClient();

                    // Audit Log
                    await sb.from('ai_audit_log').insert({
                        request_id: requestId,
                        user_id: context.userId,
                        channel,
                        success: true,
                        latency_ms: latencyMs,
                    });

                    // Persist History
                    if (channel === 'coach') {
                        const { saveCoachMessage } = await import('@/lib/coach/coach-context');
                        await saveCoachMessage(context.userId!, 'assistant', JSON.stringify(data), sb);
                    } else if (channel === 'brain_dump') {
                        const { saveBrainDumpExtraction, updateUserStateFromSignals } = await import('@/lib/brain-dump/brain-dump-context');
                        await saveBrainDumpExtraction(context.userId!, input, data, sb);
                        if (data.extracted?.signals) {
                            await updateUserStateFromSignals(context.userId!, data.extracted.signals, sb);
                        }
                    }
                } catch (e) {
                    console.error(`[AI Gateway] [${requestId}] Background tasks failed:`, e);
                }
            }, 0);

            return apiSuccess({ ...data, _meta: { request_id: requestId, latency_ms: latencyMs } });

        } catch (error: any) {
            // CATCH-ALL SAFETY NET
            const duration = Date.now() - startTime;
            console.error(`[AI Gateway] [${requestId}] CRITICAL FAILURE:`, error);

            // Map known errors to codes
            let status = 500;
            let code = 'INTERNAL_ERROR';

            if (error.message.includes('timeout') || error.message.includes('abort')) {
                status = 504;
                code = 'AI_TIMEOUT';
            } else if (error.message.includes('429')) {
                status = 429;
                code = 'RATE_LIMITED';
            } else if (error.message.includes('Upstream')) {
                status = 502;
                code = 'UPSTREAM_ERROR';
            }

            return apiError(error.message || 'AI System Error', status, code, {
                request_id: requestId,
                duration_ms: duration
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_execute',
    }
);
