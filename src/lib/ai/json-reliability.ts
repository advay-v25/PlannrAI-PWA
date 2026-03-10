import { groqChat } from './groq-client';
import { z } from 'zod';

const MAX_REPAIR_INPUT_CHARS = 12_000; // hard cap
const REPAIR_TIMEOUT_MS = 8_000;       // short + safe

function stripFences(text: string) {
    const trimmed = (text || '').trim();
    return trimmed
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
}

function extractFirstJsonObject(text: string) {
    const s = stripFences(text);
    try { return JSON.parse(s); } catch { }
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error('No JSON object found');
}

export class JSONReliability {
    static parse(text: string): any {
        return extractFirstJsonObject(text);
    }

    static async repairToJsonOnly(
        brokenText: string,
        model: string,
        signal?: AbortSignal
    ): Promise<any> {
        const clipped = brokenText.slice(0, MAX_REPAIR_INPUT_CHARS);

        const repairPrompt = `
Fix the following text into STRICT VALID JSON ONLY.
Rules:
- Output JSON only. No markdown. No prose.
- Remove any commentary.
TEXT:
${clipped}
`.trim();

        const fixedText = await groqChat({
            model,
            messages: [
                { role: 'system', content: 'Return JSON only.' },
                { role: 'user', content: repairPrompt }
            ],
            temperature: 0,
            max_tokens: 900,
            signal
        });

        return this.parse(fixedText);
    }

    static async schemaRepair<T>(
        brokenText: string,
        schemaHint: string,
        model: string,
        signal?: AbortSignal
    ): Promise<any> {
        const clipped = brokenText.slice(0, MAX_REPAIR_INPUT_CHARS);

        const repairPrompt = `
You MUST output JSON matching this schema exactly:
${schemaHint}

Rules:
- JSON only
- No extra keys
- Provide required keys even if empty
TEXT:
${clipped}
`.trim();

        const fixedText = await groqChat({
            model,
            messages: [
                { role: 'system', content: 'Return JSON only.' },
                { role: 'user', content: repairPrompt }
            ],
            temperature: 0,
            max_tokens: 900,
            signal
        });

        return this.parse(fixedText);
    }

    static async validateOrRepair<T>(
        text: string,
        schema: z.ZodSchema<T>,
        model: string,
        schemaHint: string,
        signal?: AbortSignal
    ): Promise<T> {
        let json: any;

        // Parse attempt
        try {
            json = this.parse(text);
        } catch {
            // Parse repair (cheap)
            json = await this.repairToJsonOnly(text, model, signal);
        }

        // Validate
        const ok = schema.safeParse(json);
        if (ok.success) return ok.data;

        console.error('[Zod Validation Failed] Original LLM Payload Invalid:', JSON.stringify(ok.error?.issues, null, 2));

        // Schema repair pass (cheap)
        const repaired = await this.schemaRepair(text, schemaHint, model, signal);
        const ok2 = schema.safeParse(repaired);
        if (ok2.success) return ok2.data;

        throw new Error(`Schema validation failed after repair: ${JSON.stringify(ok2.error?.issues || [])}`);
    }
}
