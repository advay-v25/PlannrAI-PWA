import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';

export const POST = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        const { date } = await context.request.json().catch(() => ({ date: new Date().toISOString().split('T')[0] }));

        // 1. Gather Context
        const [
            { data: profile },
            { data: userState },
            { data: blocks },
            { data: goals }
        ] = await Promise.all([
            supabase.from('profiles').select('first_name').eq('id', userId).single(),
            supabase.from('user_states').select('*').eq('user_id', userId).single(),
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .eq('date', date)
                .order('start_time'),
            supabase.from('goals').select('title, status').eq('user_id', userId).limit(3)
        ]);

        if (!profile) return apiError('Profile not found', 404);

        // 2. Construct Prompt Payload
        const promptPayload = {
            user: {
                name: profile.first_name || 'User',
                energy: userState?.energy_level || 3,
                mood: userState?.emotional_state || 'neutral'
            },
            schedule: {
                count: blocks?.length || 0,
                blocks: blocks?.map(b => `${b.start_time}-${b.end_time}: ${b.title} (${b.block_type})`).join('\n')
            },
            goals: goals?.map(g => g.title).join(', ')
        };

        // 3. Call AI Gateway
        try {
            const result = await executeAI(userId, {
                channel: 'daily_briefing',
                input: "Generate Command Briefing",
                context: promptPayload
            });

            return apiSuccess(result);

        } catch (error: any) {
            console.error("Narrative Generation Failed:", error);
            // Fallback if AI fails
            return apiSuccess({
                briefing: `Good morning, ${profile.first_name}. Systems are online. You have ${blocks?.length || 0} blocks scheduled today. Stay focused.`,
                tone: 'focused'
            });
        }
    },
    { requireAuth: true, rateLimit: 'ai_generation' }
);
