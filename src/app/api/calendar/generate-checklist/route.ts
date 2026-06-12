import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { block_id, title, block_type, goal_title, duration_minutes } = (body || {}) as {
            block_id?: string;
            title: string;
            block_type?: string;
            goal_title?: string;
            duration_minutes?: number;
        };

        if (!title) {
            return apiError('Block title is required', 400);
        }

        const duration = duration_minutes || 60;
        const type = block_type || 'flex';

        // Rate Limit Check
        const { requireRateLimit } = await import('@/lib/rate-limit');
        const rateLimitCheck = await requireRateLimit(`generate-checklist:${userId}`, 15, 300);
        if (typeof rateLimitCheck !== 'boolean') return rateLimitCheck;

        const systemPrompt = `You are PlannrAI's action planner. Generate a checklist of 3-5 specific, actionable sub-tasks for a schedule block. Each item should be concrete and completable within the block duration. Return valid JSON only.`;

        const userPrompt = `Generate a checklist for this schedule block:

BLOCK: "${title}"
TYPE: ${type}
DURATION: ${duration} minutes
${goal_title ? `LINKED GOAL: "${goal_title}"` : ''}

Return JSON:
{
  "checklist": [
    {"text": "Specific action step 1"},
    {"text": "Specific action step 2"},
    {"text": "Specific action step 3"}
  ]
}

Make each step concrete and relevant to the block. For example:
- "Morning Routine" → "Stretch for 5 minutes", "Meditate for 10 minutes", "Plan top 3 priorities"
- "Deep Work: Piano" → "Warm up with scales (10 min)", "Practice difficult passage (20 min)", "Sight-read new piece (15 min)"`;

        const response = await callAI<{ checklist: { text: string }[] }>({
            prompt: userPrompt,
            systemPrompt,
            model: 'fast',
            temperature: 0.7,
            maxTokens: 500,
            requireJSON: true,
            timeout: 10000,
        });

        if (!response.success || !response.data?.checklist?.length) {
            // Graceful fallback
            return apiSuccess({
                checklist: [
                    { text: `Start ${title}` },
                    { text: `Work through main tasks` },
                    { text: `Review progress and wrap up` },
                ],
            });
        }

        const checklist = response.data.checklist.slice(0, 6).map(item => ({
            text: typeof item.text === 'string' ? item.text : String(item),
            completed: false,
        }));

        // If block_id provided, also save to DB
        if (block_id) {
            await supabase
                .from('schedule_blocks')
                .update({ checklist })
                .eq('id', block_id)
                .eq('user_id', userId);
        }

        return apiSuccess({ checklist });
    },
    { requireAuth: true, rateLimit: 'aiCoach' }
);
