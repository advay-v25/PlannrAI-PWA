import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI, ExecuteRequestSchema } from '@/lib/ai/ai-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = secureApiRoute(
    async (context, body) => {
        // 1. Validate Request
        const result = ExecuteRequestSchema.safeParse(body);
        if (!result.success) {
            return apiError('Invalid request format', 400, 'VALIDATION_ERROR', result.error.format());
        }

        // 2. Execute AI Service
        const resultData = await executeAI(context.userId, result.data);

        // 3. Return Result
        return apiSuccess(resultData);
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_execute',
    }
);
