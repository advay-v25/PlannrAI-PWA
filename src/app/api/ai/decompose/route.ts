
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { generateAIResponse } from '@/lib/ai/groq-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['goal_id']);
        if (!validation.valid) return apiError('Missing goal_id');

        const { goal_id, constraint_level } = body as { goal_id: string, constraint_level?: string };

        const supabase = await createClient();

        // 1. Fetch Goal & User Context
        const { data: goal } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goal_id)
            .single();

        if (!goal) return apiError('Goal not found');

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', context.userId)
            .single();

        // 2. Build Expert Prompt
        const prompt = `
I am your Apprentice. I have a goal: "${goal.title}" (${goal.category}).
My skill level is: ${constraint_level || 'Beginner'}.
My available time is: ${goal.minutes_per_day} mins per day.
My user context: 
- Energy: ${profile?.energy_level || 3}/5
- Sleep: ${profile?.sleep_end} to ${profile?.sleep_start}

Act as an Expert Coach. Decompose this goal into a high-precision execution plan.
Return strict JSON:
{
  "strategy_one_liner": "The core philosophy (e.g. 'Volume before Intensity')",
  "routine": {
    "frequency": "daily|weekly",
    "duration_mins": ${goal.minutes_per_day},
    "steps": ["Step 1", "Step 2"],
    "notes": "Specific advice on how to execute the routine"
  },
  "milestones": [
    { "week": 1, "focus": "Theme", "action_item": "One-off task to complete" },
    { "week": 4, "focus": "Theme", "action_item": "Major checkpoint" }
  ],
  "checklist": [
    { "text": "Pre-flight check 1" },
    { "text": "Pre-flight check 2" }
  ]
}
`;

        // 3. Generate Plan
        try {
            const response = await generateAIResponse(prompt, 'SKILL_ACQUISITION', context.userId);
            const plan = JSON.parse(response);

            // 4. Save to Database
            await supabase
                .from('goals')
                .update({ ai_strategy: plan })
                .eq('id', goal_id);

            return apiSuccess({ plan });

        } catch (error) {
            console.error('AI Decomposition Failed:', error);
            return apiError('Failed to generate plan', 500);
        }
    },
    { requireAuth: true, auditAction: 'decompose_goal' }
);
