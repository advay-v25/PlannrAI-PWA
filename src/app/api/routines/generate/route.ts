import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

interface RoutineOutput {
    routine_type: string;
    name: string;
    duration_minutes: number;
    goal: string;
    intensity: string;
    steps: string[];
    avoid_today?: string;
    best_time_window: string;
    confidence_score: number;
    questions: any[];
}

const ROUTINE_PROMPT = `You are PlannrAI's biomechanics engine. 
Generate a safe, effective 5-15 minute routine.
Goal: {GOAL}
Type: {TYPE}
Context: {CONTEXT}
Scan Signals: {SIGNALS}

Strict Output Contract (JSON):
{
    "routine_type": "{TYPE}",
    "name": "Brief Title",
    "duration_minutes": number,
    "goal": "mobility|activation|recovery|downshift",
    "intensity": "low|medium",
    "steps": ["Step 1", "Step 2", ...],
    "avoid_today": "One warning sentence if needed",
    "best_time_window": "When to do this",
    "confidence_score": 0.0-1.0
}
`;

export const POST = secureApiRoute(
    async (context, body) => {
        const { routine_type, time_available, pain_level } = body as {
            routine_type: 'morning' | 'night' | 'workout';
            time_available?: number;
            pain_level?: number;
        };

        const supabase = await createClient();

        // AI Logic
        let routine: RoutineOutput;

        try {
            const { groqChat } = await import('@/lib/ai/groq-client');
            const { ChannelRegistry } = await import('@/lib/ai/registry');
            const { JSONReliability } = await import('@/lib/ai/json-reliability');

            const channelDef = ChannelRegistry['routines.generate'];
            const inputs = `Type: ${routine_type}, Goal: ${routine_type === 'morning' ? 'activation' : 'recovery'}, Pain: ${pain_level || 0}/10`;
            const aiContext = {
                routine_type,
                time_available,
                pain_level
            };

            const systemMsg = channelDef.systemPrompt(aiContext);
            const userMsg = channelDef.userPrompt(inputs);

            const rawText = await groqChat({
                model: channelDef.config.model,
                messages: [
                    { role: 'system', content: systemMsg },
                    { role: 'user', content: userMsg }
                ],
                temperature: channelDef.config.temperature,
                max_tokens: channelDef.config.maxTokens,
                userId: context.userId
            });

            if (!rawText) throw new Error("AI returned empty response");

            const data = await JSONReliability.validateOrRepair(
                rawText,
                channelDef.schema,
                channelDef.config.model,
                "JSON matching routine schema"
            );

            routine = {
                ...data,
                questions: []
            } as RoutineOutput;

        } catch (err: any) {
            console.error("Routine AI Failed:", err);
            // Fallback to simple logic if AI fails
            routine = {
                routine_type,
                name: 'Fallback Routine',
                duration_minutes: time_available || 10,
                goal: 'mobility',
                intensity: 'low',
                steps: ["Deep Breathing - 2 mins", "Forward Fold - 2 mins", "Stretch - 5 mins"],
                best_time_window: 'Anytime',
                confidence_score: 0.5,
                questions: []
            };
        }

        // Store Recommendation
        const { data: rec, error } = await supabase
            .from('routine_recommendations')
            .insert({
                user_id: context.userId,
                routine_type,
                source: 'context',
                routine,
                accepted: false
            })
            .select()
            .single();

        if (error) return apiError('Failed to save routine', 500);

        return apiSuccess(rec);
    },
    { requireAuth: true, auditAction: 'generate_routine' }
);
