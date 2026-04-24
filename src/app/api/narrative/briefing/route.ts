import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { callAI } from '@/lib/ai/unified-client';

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

        // 2. Generate briefing via callAI (resilient)
        try {
            const scheduleText = blocks?.map((b: any) => `${b.start_time}-${b.end_time}: ${b.title} (${b.block_type})`).join('\n') || 'No blocks scheduled';
            const goalsText = goals?.map((g: any) => g.title).join(', ') || 'None';

            const response = await callAI<any>({
                model: 'fast',
                systemPrompt: `You are the AI briefing system for PlannrAI. Generate a short, punchy morning command briefing for ${firstName}. Be warm but direct. Max 2 sentences. Return JSON: {"briefing": "string", "tone": "focused|energized|calm|intense", "priorities": ["string"]}`,
                prompt: `Date: ${targetDate}\nEnergy: ${userState?.energy_level || 3}/5\nMood: ${userState?.emotional_state || 'neutral'}\nArchetype: ${aiProfile?.archetype || 'unknown'}\nChronotype: ${aiProfile?.chronotype || 'unknown'}\n\nSchedule:\n${scheduleText}\n\nGoals: ${goalsText}`,
                requireJSON: true,
                userId: userId
            });

            if (!response.success || !response.data) {
                throw new Error(response.error || "AI failed");
            }

            const parsed = response.data;
            return apiSuccess({
                briefing: parsed.briefing || `Good morning, ${firstName}. Systems are online.`,
                tone: parsed.tone || 'focused',
                priorities: parsed.priorities || [],
                provider: response.provider
            });

        } catch (error: any) {
            console.error("Narrative Generation Failed:", error);
            // Fallback if AI fails
            return apiSuccess({
                briefing: `Good morning, ${firstName}. Systems are online. You have ${blocks?.length || 0} blocks scheduled today. Stay focused.`,
                tone: 'focused',
                priorities: [],
                source: 'fallback'
            });
        }
    },
    { requireAuth: true, auditAction: 'narrative_briefing' }
);
