import { BaseAgent } from '../core/base-agent';
import { AgentContext, PlannerOutput, PlannerOutputSchema } from '../core/types';
import { generateAIResponse } from '@/lib/ai/groq-client';

export class PlannerAgent extends BaseAgent<string, PlannerOutput> {
    name = "Planner Agent";

    async run(userMessage: string, context: AgentContext): Promise<PlannerOutput> {
        this.log("Analyzing intent...", { userMessage });

        const prompt = `
        User Message: "${userMessage}"
        Current Time: ${context.now.toISOString()}
        Timezone: ${context.timezone}

        Analyze the user's intent. 
        - If they mention a time, create a constraint.
        - If they express fatigue, note it.
        - Decide the high-level strategy (reschedule, etc).
        
        Return STRICT JSON matching PlannerOutputSchema.
        `;

        try {
            const response = await generateAIResponse(prompt, 'AGENT_PLANNER', context.userId, true);
            const json = JSON.parse(response);

            // Validate with Zod
            const validation = PlannerOutputSchema.safeParse(json);
            if (!validation.success) {
                console.error("Planner Validation Failed", validation.error);
                throw new Error("Invalid Planner Output");
            }

            return validation.data;
        } catch (e) {
            this.log("Error", e);
            // Fallback safe response
            return {
                intent: 'unknown',
                urgency: 'low',
                scope: 'day',
                requires_calendar_change: false,
                strategy: 'none'
            };
        }
    }
}
