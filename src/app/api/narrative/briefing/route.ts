import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { groqChat } from '@/lib/ai/groq-client';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { date } = (body as { date?: string }) || {};
        const targetDate = date || new Date().toISOString().split('T')[0];

        // 1. Gather Context
        const [
            { data: profile },
            { data: userState },
            { data: blocks },
            { data: goals }
        ] = await Promise.all([
            supabase.from('profiles').select('full_name, bio_data').eq('id', userId).single(),
            supabase.from('user_states').select('*').eq('user_id', userId).maybeSingle(),
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .eq('date', targetDate)
                .order('start_time'),
            supabase.from('goals').select('title, status').eq('user_id', userId).limit(3)
        ]);

        if (!profile) return apiError('Profile not found', 404);

        // Extract first name from full_name
        const firstName = (profile.full_name || 'User').split(' ')[0];
        const aiProfile = (profile as any).bio_data?.ai_profile || null;

        // 2. Generate briefing via Groq (fast, low-load)
        try {
            const scheduleText = blocks?.map((b: any) => `${b.start_time}-${b.end_time}: ${b.title} (${b.block_type})`).join('\n') || 'No blocks scheduled';
            const goalsText = goals?.map((g: any) => g.title).join(', ') || 'None';

            const result = await groqChat({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `You are the AI briefing system for PlannrAI. Generate a short, punchy morning command briefing for ${firstName}. Be warm but direct. Max 2 sentences. Return JSON: {"briefing": "string", "tone": "focused|energized|calm|intense", "priorities": ["string"]}`
                    },
                    {
                        role: 'user',
                        content: `Date: ${targetDate}\nEnergy: ${userState?.energy_level || 3}/5\nMood: ${userState?.emotional_state || 'neutral'}\nArchetype: ${aiProfile?.archetype || 'unknown'}\nChronotype: ${aiProfile?.chronotype || 'unknown'}\n\nSchedule:\n${scheduleText}\n\nGoals: ${goalsText}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 200,
                userId
            });

            const parsed = JSON.parse(result);
            return apiSuccess({
                briefing: parsed.briefing || `Good morning, ${firstName}. Systems are online.`,
                tone: parsed.tone || 'focused',
                priorities: parsed.priorities || []
            });

        } catch (error: any) {
            console.error("Narrative Generation Failed:", error);
            // Fallback if AI fails
            return apiSuccess({
                briefing: `Good morning, ${firstName}. Systems are online. You have ${blocks?.length || 0} blocks scheduled today. Stay focused.`,
                tone: 'focused',
                priorities: []
            });
        }
    },
    { requireAuth: true, auditAction: 'narrative_briefing' }
);
