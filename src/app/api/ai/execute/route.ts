import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { runAI } from '@/lib/ai/run-ai';
import { z } from 'zod';
import { ChannelEnum } from '@/lib/ai/schemas';

// Request Schema
const ExecuteRequestSchema = z.object({
    channel: ChannelEnum,
    input: z.string().min(1).max(2000), // Reasonable limit for user input
    context: z.record(z.string(), z.any()).optional().default({}),
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

        const { channel, input, context: aiContext, limits } = result.data;

        try {
            // 2. Execute AI Pipeline
            // This handles prompt building, Groq call, and response validation
            const response = await runAI({
                channel,
                input,
                context: aiContext,
                limits,
                userId: context.userId,
            });

            // 3. Return Standardized Success
            return apiSuccess(response);

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
