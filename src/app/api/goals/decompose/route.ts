import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';
import { z } from 'zod';

const RequestSchema = z.object({
    goal_title: z.string().min(3),
    goal_description: z.string().nullable().optional(),
    timeline: z.string().nullable().optional()
});

export const POST = secureApiRoute(
    async (context, body) => {
        const result = RequestSchema.safeParse(body);
        if (!result.success) {
            return apiError('Invalid request', 400);
        }

        const { goal_title, goal_description, timeline } = result.data;
        const { userId } = context;

        try {
            // Rate Limit Check
            const { requireRateLimit } = await import('@/lib/rate-limit');
            const rateLimitCheck = await requireRateLimit(`decompose:${userId}`, 5, 900);
            if (typeof rateLimitCheck !== 'boolean') return rateLimitCheck;

            const systemPrompt = `You are PlannrAI's Goal Architect. Your task is to break down a complex goal into logical, actionable sub-tasks and a clear roadmap.
            Respond ONLY with valid JSON.`;

            const prompt = `Decompose this goal:
            Title: ${goal_title}
            Description: ${goal_description || 'None'}
            Timeline: ${timeline || 'Auto-detect'}
            
            Output JSON format:
            {
              "summary": "Overall approach",
              "subtasks": [
                { "title": "Subtask 1", "description": "Why/How", "duration_est": "30m" }
              ],
              "milestones": ["Milestone 1", "Milestone 2"],
              "recommended_pillar": "mind|body|craft|soul"
            }`;

            const response = await callAI<any>({
                model: 'smart',
                systemPrompt,
                prompt,
                requireJSON: true,
                userId: userId
            });

            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to generate plan');
            }

            return apiSuccess({
                ...response.data,
                provider: response.provider
            });
        } catch (e: any) {
            console.error('Goal Decomposition Error:', e);
            return apiError(e.message || 'Internal error', 500);
        }
    },
    { requireAuth: true, rateLimit: 'aiCoach', auditAction: 'goal_decompose' }
);
