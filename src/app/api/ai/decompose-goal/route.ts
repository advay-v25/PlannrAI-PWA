import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';
import { z } from 'zod';

export const maxDuration = 60;


const requestSchema = z.object({
    goal: z.string().min(3),
    minutes: z.number().min(5).max(180),
    level: z.string().optional(),
    goalId: z.string().optional(),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        const validated = requestSchema.safeParse(body);
        if (!validated.success) {
            return apiError('Invalid request data', 400);
        }

        const { goal, minutes, level, goalId } = validated.data;

        // Use unified AI pipeline
        const aiRes = await executeAI(userId, {
            channel: 'goal_decomposition',
            input: goal,
            context: {
                time_budget_minutes: minutes,
                level: level || 'beginner',
            }
        });

        // If goalId provided, save to DB
        if (goalId && aiRes?.plan) {
            const { error } = await supabase
                .from('goals')
                .update({ ai_plan: aiRes.plan })
                .eq('id', goalId)
                .eq('user_id', userId);

            if (error) {
                console.error('Failed to save AI plan:', error);
            }
        }

        return apiSuccess({ plan: aiRes?.plan || aiRes });
    },
    { requireAuth: true, auditAction: 'goal_decomposition' }
);
