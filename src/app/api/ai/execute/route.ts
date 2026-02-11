import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { runAI } from '@/lib/ai/run-ai';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { ChannelEnum } from '@/lib/ai/schemas';

// Request Schema
const ExecuteRequestSchema = z.object({
    channel: ChannelEnum,
    input: z.string().min(1).max(2000), // Reasonable limit for user input
    context: z.record(z.string(), z.any()).optional().default({}),
    twoPass: z.boolean().optional(),
    maxTokens: z.number().min(100).max(8000).optional(),
    limits: z.object({
        low_energy: z.boolean().optional(),
        overwhelmed: z.boolean().optional(),
        max_options: z.number().min(1).max(5).optional(),
    }).optional(),
});

export const POST = secureApiRoute(
    async (context, body) => {
        // 1. Validate Input
        const result = ExecuteRequestSchema.safeParse(body);
        if (!result.success) {
            return apiError('Invalid request format', 400, result.error.format());
        }

        const { channel, input, context: aiContext, limits, twoPass, maxTokens } = result.data;
        const requestId = crypto.randomUUID();
        const supabase = await createClient(); // Use createClient (cached per request)

        try {
            // 2. Enrich Context (if applicable)
            let richContext = { ...aiContext };

            // Only fetch rich context for relevant channels to save perf
            if (channel.startsWith('coach') || channel.startsWith('brain_dump')) {
                const { ContextService } = await import('@/lib/context-service');
                const userContext = await ContextService.getContext(context.userId!);
                richContext = { ...richContext, ...userContext };
            }

            // 3. Persist User Message (Coach Only)
            // Determine thread_id from input context or create new?
            // For now, minimal persistence: if valid thread_id provided in context, use it.
            // If not, we might need to create one, or just store without thread if schema allows?
            // Schema requires thread_id.
            // Client should send thread_id. If missing, we create a new thread.
            let threadId = aiContext.thread_id;

            if (channel.startsWith('coach')) {
                if (!threadId) {
                    const { MemoryService } = await import('@/lib/services/memory-service');
                    const thread = await MemoryService.createThread(context.userId!, input.slice(0, 30) + '...');
                    threadId = thread?.id;
                }

                if (threadId) {
                    const { MemoryService } = await import('@/lib/services/memory-service');
                    await MemoryService.addCoachMessage(
                        context.userId!,
                        threadId,
                        'user',
                        input,
                        true // Trigger Fact Extraction
                    );
                }
                if (threadId) {
                    const { MemoryService } = await import('@/lib/services/memory-service');
                    await MemoryService.addCoachMessage(
                        context.userId!,
                        threadId,
                        'user',
                        input,
                        true // Trigger Fact Extraction
                    );
                }
            }

            // [NEW] Branch for Expert Strategy
            if (channel === 'goals.expert_strategy' as any) {
                const { runExpertStrategy } = await import('@/lib/ai/goals-strategy');
                const strategy = await runExpertStrategy(input, aiContext as any, context.userId!);
                return apiSuccess(strategy);
            }

            // 4. Execute AI Pipeline
            const response = await runAI({
                channel,
                input,
                context: richContext,
                limits,
                userId: context.userId,
                twoPass,
                maxTokens,
                requestId,
            });

            // 5. Persist AI Response (Coach Only)
            if (channel.startsWith('coach') && threadId) {
                const { MemoryService } = await import('@/lib/services/memory-service');
                await MemoryService.addCoachMessage(
                    context.userId!,
                    threadId,
                    'assistant',
                    JSON.stringify(response)
                );
            }

            // 6. Persist Brain Dump (Brain Dump Only)
            if (channel === 'brain_dump') {
                // Extract analysis from ops
                let extractedJson = null;
                const analysisOp = response.options?.[0]?.patch?.ops.find((op: any) => op.op === 'analyze_content');
                if (analysisOp && 'analysis' in analysisOp) {
                    extractedJson = analysisOp.analysis;
                }

                await supabase.from('brain_dump_entries').insert({
                    user_id: context.userId!,
                    raw_text: input,
                    extracted_json: extractedJson || {}
                });
            }

            // 7. Return Standardized Success w/ ThreadID if created
            return apiSuccess({
                ...response,
                thread_id: threadId // Return thread_id so client can continue conversation
            });

        } catch (error: any) {
            console.error('[AI Gateway Error]', error);

            // 4. Handle Execution Failures
            // Differentiate between validation errors and system errors
            if (error.message.includes('schema validation')) {
                return apiError('AI response validation failed', 502, {
                    message: 'The AI model produced invalid output.',
                    original_error: error.message
                });
            }

            return apiError('AI execution failed', 500, {
                message: error.message || 'Internal Server Error'
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai', // Use standard 'ai' limit
        auditAction: 'ai_execute',
    }
);
