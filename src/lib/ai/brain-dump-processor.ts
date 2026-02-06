import { generateAIResponse } from '@/lib/ai/groq-client';
import { BrainDumpAnalysisSchema, BrainDumpAnalysis } from '@/lib/validation/brain-dump-contract';
import { format } from 'date-fns';

export async function processBrainDumpWithSignals(
    text: string,
    userId: string,
    userTimezone: string = 'UTC'
): Promise<BrainDumpAnalysis> {
    const dateStr = format(new Date(), 'yyyy-MM-dd');

    // We pass context in the user prompt since the System Prompt is static
    const detailedUserPrompt = `
  Reference Date: ${dateStr}
  Current Timezone: ${userTimezone}
  
  User Input: "${text}"
  `;

    try {
        // Use the now-registered system prompt
        const rawResponse = await generateAIResponse(detailedUserPrompt, 'BRAIN_DUMP_ANALYZER', userId, true);

        // Parse
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");

        const data = JSON.parse(jsonMatch[0]);

        // Validate against Zod
        const validated = BrainDumpAnalysisSchema.parse(data);
        return validated;

    } catch (error) {
        console.error("Brain Dump Processing Error:", error);
        // Fallback safe object
        return {
            summary: "Could not process signals fully.",
            sentiment: "neutral",
            signals: [],
            recommended_actions: []
        };
    }
}
