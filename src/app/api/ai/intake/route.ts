
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { ContextService } from '@/lib/ai/context-service';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { z } from 'zod';

const IntakeActionSchema = z.object({
    analysis: z.string(),
    updates: z.object({
        energy_level: z.number().optional(),
        mood: z.string().optional()
    }).optional(),
    suggested_actions: z.array(z.object({
        type: z.enum(['schedule_change', 'mode_change', 'log_entry']),
        description: z.string(),
        payload: z.any()
    }))
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId } = context;
        const { input } = body as { input: string };

        if (!input) return apiError("Input required", 400);

        // 1. Get Liquid Context
        const liquidContext = await ContextService.getLiquidContext(userId);

        // 2. AI Analysis
        const systemPrompt = `You are the PlannrAI Reality Intake System.
        User Input: "${input}"
        
        Current State:
        Energy: ${liquidContext.state.energy_level}/10
        Schedule Load: ${Math.round(liquidContext.schedule.stats.total_focus_time / 60)}h focus
        
        GOAL: Analyze the input and determine immediate system updates.
        
        RULES:
        - If user says "I'm tired", lower energy level.
        - If user mentions a new conflict ("Meeting at 3"), suggest a schedule change.
        - If purely reflective ("Had a great day"), just log it.
        
        OUTPUT JSON:
        {
            "analysis": "Short summary of what changed.",
            "updates": { "energy_level": 5 },
            "suggested_actions": [
                { "type": "mode_change", "description": "Switch to Recovery Mode", "payload": { "mode": "recovery" } }
            ]
        }`;

        try {
            const text = await groqChat({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: input }
                ],
                userId
            });

            const result = await JSONReliability.validateOrRepair(text, IntakeActionSchema, 'llama-3.3-70b-versatile', 'smart_intake');

            return apiSuccess({ success: true, ...result });

        } catch (e) {
            console.error("Intake failed", e);
            return apiError("AI Intake Failed", 500);
        }
    },
    { requireAuth: true }
);
