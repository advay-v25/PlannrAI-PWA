import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/security/api-protection';
import { decomposeGoal } from '@/lib/ai/groq-client';
import { z } from 'zod';

const requestSchema = z.object({
    goal: z.string().min(3),
    minutes: z.number().min(5).max(180),
    level: z.string().optional(),
    goalId: z.string().optional(), // If provided, we save the plan to this goal
});

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError('Unauthorized', 401);
        }

        const body = await req.json();
        const validated = requestSchema.safeParse(body);

        if (!validated.success) {
            return apiError('Invalid request data', 400);
        }

        const { goal, minutes, level, goalId } = validated.data;

        // Call the AI
        const plan = await decomposeGoal(goal, { timeMin: minutes, level }, user.id);

        if (!plan) {
            return apiError('Failed to generate plan', 500);
        }

        // If goalId provided, save to DB
        if (goalId) {
            const { error } = await supabase
                .from('goals')
                .update({ ai_plan: plan })
                .eq('id', goalId)
                .eq('user_id', user.id);

            if (error) {
                console.error('Failed to save AI plan:', error);
                // We typically still return the plan to the user even if save failed
            }
        }

        return apiSuccess({ plan });

    } catch (error) {
        console.error('Goal decomposition error:', error);
        return apiError('Internal server error', 500);
    }
}
