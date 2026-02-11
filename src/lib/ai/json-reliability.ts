
import { groqChat } from './groq-client';
import { z } from 'zod';

export class JSONReliability {
    /**
     * Parse JSON from text, handling markdown fences.
     */
    static parse(text: string): any {
        try {
            const trimmed = text.trim();
            // Remove markdown code fences if present
            const noFences = trimmed
                .replace(/^```(json)?/i, "")
                .replace(/```$/i, "")
                .trim();
            return JSON.parse(noFences);
        } catch (e) {
            throw new Error(`Invalid JSON format: ${(e as Error).message}`);
        }
    }

    /**
     * Attempt to repair broken JSON using a focused LLM call.
     */
    static async repair(brokenText: string, errorMessage: string, model: string = 'llama-3.3-70b-versatile'): Promise<any> {
        console.warn('[JSONReliability] Repairing JSON...');

        const repairPrompt = `
You are a JSON repair bot.
The following text was meant to be JSON but failed to parse.
Error: ${errorMessage}

Text to fix:
${brokenText}

Instructions:
1. Fix syntax errors (missing brackets, quotes, commas).
2. Remove any conversational text/commentary.
3. Return STRICT VALID JSON ONLY. No markdown.
`.trim();

        try {
            const fixedText = await groqChat({
                model,
                messages: [
                    { role: 'system', content: 'You output only valid JSON.' },
                    { role: 'user', content: repairPrompt }
                ],
                temperature: 0,
                max_tokens: 4000
            });

            return this.parse(fixedText);
        } catch (e) {
            throw new Error(`JSON Repair failed: ${(e as Error).message}`);
        }
    }

    /**
     * validate or repair logic
     */
    static async validateOrRepair<T>(
        text: string,
        schema: z.ZodSchema<T>,
        model: string = 'llama-3.3-70b-versatile'
    ): Promise<T> {
        let json: any;

        // 1. Initial Parse
        try {
            json = this.parse(text);
        } catch (parseError) {
            // 2. Parse failed -> Try repair
            json = await this.repair(text, (parseError as Error).message, model);
        }

        // 3. Schema Validation
        const result = schema.safeParse(json);
        if (result.success) {
            return result.data;
        }

        // 4. Validation failed -> Try repair (schema fix)
        // We can re-use the repair mechanism but with schema instructions?
        // For now, let's just throw, or maybe do a "schema repair" pass?
        // The user requirement said: "If parse fails: run a “repair” prompt (one pass) that returns valid JSON only."
        // It didn't explicitly say "repair validation errors", but implied "model output breaks JSON".
        // Let's stick to parsing repair for now to keep it fast, but we can enhance error message.

        throw new Error(`Schema validation failed: ${JSON.stringify(result.error.format())}`);
    }
}
