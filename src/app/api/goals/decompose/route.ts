
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
// Rebuild trigger 1
import { executeAI } from '@/lib/ai/ai-service';
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
            // Execute AI with the goal decomposition channel
            // logic is handled inside executeAI via the registry
            const aiResponse = await executeAI(userId, {
                channel: 'goal_decomposition',
                input: `Title: ${goal_title}\nDescription: ${goal_description || 'None'}\nTimeline: ${timeline || 'Auto-detect'}`,
                context: {}
            });

            if (!aiResponse) {
                return apiError('Failed to generate plan', 500);
            }

            return apiSuccess(aiResponse);
        } catch (e) {
            console.error('Goal Decomposition Error:', e);
            return apiError('Internal error', 500);
        }
    },
    { requireAuth: true, rateLimit: 'user' }
);
