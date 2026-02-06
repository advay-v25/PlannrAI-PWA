import { BaseAgent } from '../core/base-agent';
import { AgentContext, RegulatorOutput, RegulatorOutputSchema, PlannerOutput } from '../core/types';
import { generateAIResponse } from '@/lib/ai/groq-client';

export class RegulatorAgent extends BaseAgent<{ userMessage: string, plannerOutput: PlannerOutput }, RegulatorOutput> {
    name = "Emotional Regulator";

    async run(input: { userMessage: string, plannerOutput: PlannerOutput }, context: AgentContext): Promise<RegulatorOutput> {
        this.log("Regulating response...", { intent: input.plannerOutput.intent });

        const prompt = `
        User Message: "${input.userMessage}"
        User State: ${JSON.stringify(context.userState || "Unknown")}
        Planner Output: ${JSON.stringify(input.plannerOutput)}
        
        Analyze user state (especially 'emotional_state') and decide response parameters.
        
        Rules:
        - 'overwhelmed': Force 'minimal' mode (MAX 2 options). Use direct, calming language.
        - 'avoidant': Suggest "Smallest Step" (MAX 2 options). Do NOT challenge ambition.
        - 'burnt': Force 'minimal' + suggestion to rest.
        - 'motivated': Use 'normal' mode (max 3 options). Allow challenge.
        - 'focused': Protect focus. Minimize noise.
        - Default ('coasting'): Normal mode.

        Return STRICT JSON matching RegulatorOutputSchema.
        `;

        try {
            const response = await generateAIResponse(prompt, 'AGENT_REGULATOR', context.userId, true);
            const json = JSON.parse(response);

            // Validate
            const validation = RegulatorOutputSchema.safeParse(json);
            if (!validation.success) {
                console.error("Regulator Validation Failed", validation.error);
                throw new Error("Invalid Regulator Output");
            }

            return validation.data;
        } catch (e) {
            this.log("Error", e);
            // Safe Fallback
            return {
                response_mode: 'minimal',
                max_options: 3,
                language_style: 'neutral',
                ask_questions: false,
                warn_user: false,
                tone_notes: "Fallback due to error"
            };
        }
    }
}
