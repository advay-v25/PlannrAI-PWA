import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { ChannelRegistry } from '@/lib/ai/registry';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { groqChat } from '@/lib/ai/groq-client';

// --- Request Schema ---
const ExecuteRequestSchema = z.object({
    channel: z.string(),
    input: z.string().min(1).max(4000),
    context: z.record(z.string(), z.any()).optional().default({}),
    limits: z.object({
        max_options: z.number().min(1).max(3).optional(),
        low_energy: z.boolean().optional(),
        overwhelmed: z.boolean().optional(),
    }).optional(),
});

// --- Constants ---
const AI_TIMEOUT_MS = 60_000; // 60s timeout (Vercel Limit)
const MAX_RETRIES = 1;

export const POST = secureApiRoute(
    async (context, body) => {
        const requestId = crypto.randomUUID();
        const startTime = Date.now();

        // 1. Validate Request
        const result = ExecuteRequestSchema.safeParse(body);
        if (!result.success) {
            console.error('[AI Gateway] Validation Failed:', JSON.stringify(result.error.format(), null, 2));
            console.error('[AI Gateway] Invalid Body:', JSON.stringify(body, null, 2));
            return apiError('Invalid request format', 400, 'VALIDATION_ERROR', result.error.format());
        }

        let { channel, input, context: aiContext, limits } = result.data;

        // Alias for frontend compatibility
        if (channel === 'goal_decomposition') {
            channel = 'goal_strategy';
        }

        // 2. Validate Channel
        if (!(channel in ChannelRegistry)) {
            return apiError(`Unknown channel: ${channel}`, 400, 'BAD_REQUEST');
        }

        const channelDef = ChannelRegistry[channel];

        try {
            // 3. Enrich Context (channel-specific)
            let richContext = { ...aiContext };
            let coachSupabase: any = null;

            if (channel === 'coach') {
                try {
                    const { buildCoachContext, saveCoachMessage } = await import('@/lib/coach/coach-context');
                    coachSupabase = await createClient();
                    const coachCtx = await buildCoachContext(context.userId!, coachSupabase);
                    richContext = { ...richContext, ...coachCtx };

                    // Save user message to thread BEFORE LLM call
                    await saveCoachMessage(context.userId!, 'user', input, coachSupabase);
                } catch (e) {
                    console.warn(`[AI Gateway] Coach context enrichment failed:`, e);
                }
            } else if (channel === 'brain_dump') {
                try {
                    const { buildBrainDumpContext } = await import('@/lib/brain-dump/brain-dump-context');
                    coachSupabase = coachSupabase || await createClient();
                    const bdCtx = await buildBrainDumpContext(context.userId!, coachSupabase);
                    richContext = { ...richContext, ...bdCtx };
                } catch (e) {
                    console.warn(`[AI Gateway] Brain dump context enrichment failed:`, e);
                }
            } else if (channel === 'goal_strategy' || channel === 'habit_stack') {
                try {
                    const { buildCoachContext } = await import('@/lib/coach/coach-context');
                    coachSupabase = coachSupabase || await createClient();
                    const coachCtx = await buildCoachContext(context.userId!, coachSupabase);
                    richContext = { ...richContext, ...coachCtx };
                } catch (e) {
                    console.warn(`[AI Gateway] Context enrichment failed for ${channel}:`, e);
                }
            }

            // 4. Build Prompts
            const systemMsg = channelDef.systemPrompt(richContext, limits);
            const userMsg = channelDef.userPrompt(input, richContext);

            // 5. Execute LLM with timeout and retry
            let rawText: string | null = null;
            let lastError: Error | null = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    rawText = await Promise.race([
                        groqChat({
                            model: channelDef.config.model,
                            messages: [
                                { role: 'system', content: systemMsg },
                                { role: 'user', content: userMsg }
                            ],
                            temperature: channelDef.config.temperature,
                            max_tokens: channelDef.config.maxTokens,
                            userId: context.userId
                        }),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS)
                        )
                    ]);
                    break; // Success, exit retry loop
                } catch (e: any) {
                    lastError = e;
                    console.warn(`[AI Gateway] [${requestId}] Attempt ${attempt + 1} failed:`, e.message);
                    if (attempt < MAX_RETRIES && (e.message.includes('429') || e.message.includes('network') || e.message.includes('TIMEOUT'))) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Backoff
                        continue;
                    }
                    throw e;
                }
            }

            if (!rawText) {
                throw lastError || new Error('AI returned no content');
            }

            console.log(`[AI Gateway] [${requestId}] Raw response (${channel}):`, rawText.slice(0, 200));

            // 6. Parse, Validate, Repair
            const data = await JSONReliability.validateOrRepair(
                rawText,
                channelDef.schema,
                channelDef.config.model
            );

            // 7. Audit log (latency)
            const latencyMs = Date.now() - startTime;
            console.log(`[AI Gateway] [${requestId}] channel=${channel} latency=${latencyMs}ms ok=true`);

            // Optional: Store audit row (non-blocking)
            try {
                const auditSupabase = coachSupabase || await createClient();
                void (async () => {
                    try {
                        await auditSupabase.from('ai_audit_log').insert({
                            request_id: requestId,
                            user_id: context.userId,
                            channel,
                            success: true,
                            latency_ms: latencyMs,
                        });
                    } catch { /* ignore */ }
                })();
            } catch { /* ignore audit failures */ }

            // Save assistant response to coach thread (non-blocking)
            if (channel === 'coach' && coachSupabase) {
                void (async () => {
                    try {
                        const { saveCoachMessage } = await import('@/lib/coach/coach-context');
                        await saveCoachMessage(context.userId!, 'assistant', JSON.stringify(data), coachSupabase);
                    } catch { /* ignore */ }
                })();
            }

            // Save brain dump extraction + update user state (non-blocking)
            if (channel === 'brain_dump') {
                void (async () => {
                    try {
                        const { saveBrainDumpExtraction, updateUserStateFromSignals } = await import('@/lib/brain-dump/brain-dump-context');
                        const bdSupabase = coachSupabase || await createClient();

                        // Save extraction
                        await saveBrainDumpExtraction(context.userId!, input, data, bdSupabase);

                        // Update user state on strong signals
                        if (data.extracted?.signals) {
                            await updateUserStateFromSignals(context.userId!, data.extracted.signals, bdSupabase);
                        }
                    } catch (e) {
                        console.warn('[AI Gateway] Brain dump persistence failed:', e);
                    }
                })();
            }

            return apiSuccess({ ...data, _meta: { request_id: requestId, latency_ms: latencyMs } });

        } catch (error: any) {
            const latencyMs = Date.now() - startTime;
            console.error(`[AI Gateway] [${requestId}] channel=${channel} latency=${latencyMs}ms FAILED:`, error.message);

            if (error.message === 'AI_TIMEOUT') {
                return apiError('AI call timed out', 504, 'AI_TIMEOUT', { request_id: requestId });
            }

            if (error.message.includes('Schema validation failed')) {
                return apiError('AI output did not match expected schema', 502, 'AI_INVALID_JSON', {
                    request_id: requestId
                });
            }

            if (error.message.includes('Rate limited')) {
                return apiError(error.message, 429, 'RATE_LIMITED', {
                    request_id: requestId
                });
            }

            return apiError(error.message || 'Unknown AI error', 500, 'AI_EXECUTION_ERROR', {
                request_id: requestId
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_execute',
    }
);
