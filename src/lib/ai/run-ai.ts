// src/lib/ai/run-ai.ts
import { AIResponseSchema, type AIResponse, ChannelEnum } from "./schemas";
import { AI_SYSTEM_PROMPT, buildFeatureUserPrompt } from "./prompts";
import { groqChat } from "./groq-client"; // Updated import path
import { z } from "zod";

function safeJsonParse(text: string): unknown {
    // Groq sometimes wraps JSON in ```; strip gently.
    const trimmed = text.trim();
    const noFences = trimmed
        .replace(/^```(json)?/i, "")
        .replace(/```$/i, "")
        .trim();
    return JSON.parse(noFences);
}

export async function runAI(args: {
    channel: z.infer<typeof ChannelEnum>;
    input: string;
    context: unknown;
    limits?: { low_energy?: boolean; overwhelmed?: boolean; max_options?: number };
    userId?: string; // For rate limiting
    model?: string; // Optional override
    twoPass?: boolean; // analyze->act
}): Promise<AIResponse> {
    const { channel, input, context, limits, userId, twoPass } = args;

    // Default to versatile model unless overridden
    const model = args.model || 'llama-3.3-70b-versatile';

    // Optional 2-pass: first call produces distilled constraints/facts (hidden), second call produces final JSON.
    let distilledContext = context;

    if (twoPass) {
        const analysisPrompt = `
You are a planner.
Extract only: constraints, conflicts, viable moves, and missing info needed.
Return STRICT JSON ONLY with keys: constraints[], conflicts[], viable_moves[], missing_info_question?.
Context:
${JSON.stringify(context, null, 2)}
User input:
${input}
`.trim();

        try {
            const analysisText = await groqChat({
                model,
                messages: [
                    { role: "system", content: "Output JSON only." },
                    { role: "user", content: analysisPrompt },
                ],
                temperature: 0.2,
                max_tokens: 500,
                userId // Rate limit the analysis pass too
            });

            const analysisJson = safeJsonParse(analysisText);
            // Feed as “distilled” block back into main context.
            distilledContext = { ...context as any, __analysis: analysisJson };
        } catch (e) {
            console.warn("Two-pass analysis failed, proceeding with raw context", e);
            // If analysis parse fails, continue with original context.
            distilledContext = context;
        }
    }

    const userPrompt = buildFeatureUserPrompt({
        channel,
        input,
        context: distilledContext,
        limits,
    });

    const baseMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
        const text = await groqChat({
            model,
            messages: baseMessages,
            temperature: 0.2, // Low temp for strict schema compliance
            max_tokens: 1000,
            userId
        });

        try {
            const parsed = safeJsonParse(text);
            const validated = AIResponseSchema.parse(parsed);
            return validated;
        } catch (err: any) {
            // Retry with strict corrective instruction (max 2 retries)
            if (attempt >= 2) {
                console.error("AI Schema Validation Failed Final Attempt:", text);
                throw new Error(`AI failed schema validation: ${err.message}`);
            }

            console.warn(`AI Schema Validation Failed (Attempt ${attempt + 1}):`, err.message);

            baseMessages.push({
                role: "assistant",
                content: text,
            });
            baseMessages.push({
                role: "user",
                content: `
Your last output was invalid or did not match the schema.

Fix it to match EXACTLY:
- Return JSON only.
- Keys: channel, summary, mode, options?, question?, refusal?
- options <= ${limits?.low_energy || limits?.overwhelmed ? 2 : 3}
- No extra keys. No commentary.

Return corrected JSON now.
`.trim(),
            });
        }
    }

    // Unreachable
    throw new Error("AI failed schema validation after retries");
}
