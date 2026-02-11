import { GoogleGenerativeAI } from '@google/generative-ai';
import { BrainDumpContext } from './brain-dump-context';
import { PatchGenerator, PatchOp } from '../coach/patch-generator';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_KEY!);

// ── Types ────────────────────────────────────────────────────────────

export interface BrainDumpAnalysis {
    extracted: {
        tasks?: Array<{ title: string; estimated_minutes: number; deadline?: string }>;
        constraints?: Array<{ type: string; date?: string; start?: string; end?: string; notes?: string }>;
        signals: {
            energy_delta?: number; // -2 to 2
            overwhelm?: number;    // 0 to 1
            sentiment?: number;    // -1 to 1
        };
    };
    options: Array<{
        label: string;
        tradeoff?: string;
        patch_pattern: 'add_task' | 'insert_commitment' | 'reduce_load' | 'recovery_day' | 'none';
        args?: any;
    }>;
    note: string;
}

const BRAIN_DUMP_SYSTEM_PROMPT = `
ROLE: Reality Intake Engine.
GOAL: Transform raw brain dump into structured data and executable schedule patches.
TONE: Clinical, objective, tactical.

INPUT:
- User text
- Context (Schedule, Goals, State)

OUTPUT RULES:
1. EXTRACT: Identify new tasks, constraints (appointments), and emotional signals.
2. TRANSLATE:
   - "Deeply exhausted" -> Suggest 'recovery_day' or 'reduce_load'.
   - "Appointment at 4pm" -> Suggest 'insert_commitment'.
   - "Do X tomorrow" -> Suggest 'add_task'.
3. OPTIONS: Max 3 executable options. Each MUST have a patch_pattern.
4. NOTE: Short acknowledgment (max 160 chars). No therapy.

SCHEMA (Strict JSON):
{
  "extracted": {
    "tasks": [{"title":string,"estimated_minutes":number}],
    "constraints": [{"type":"appointment"|"fatigue","start?":string,"end?":string}],
    "signals": {"energy_delta":-2..2,"overwhelm":0..1,"sentiment":-1..1}
  },
  "options": [
    {
      "label": "Action label",
      "tradeoff": "Why/Cost",
      "patch_pattern": "add_task" | "insert_commitment" | "reduce_load" | "recovery_day" | "none",
      "args": { ... } 
    }
  ],
  "note": "Short ack (max 160 chars)"
}
`;

export const BrainDumpService = {
    async process(text: string, ctx: BrainDumpContext): Promise<{ analysis: BrainDumpAnalysis; patches: any[] }> {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash-latest',
            generationConfig: { responseMimeType: 'application/json' },
            systemInstruction: BRAIN_DUMP_SYSTEM_PROMPT
        });

        const prompt = `
CONTEXT:
Now: ${ctx.now} (Today: ${ctx.now.split('T')[0]})
Timezone: ${ctx.timezone}
State: ${JSON.stringify(ctx.emotional_state)}
Schedule: ${ctx.schedule.slice(0, 10).map(b => `${b.start_time}: ${b.title}`).join(', ')}

USER INPUT: "${text}"
`;

        const result = await model.generateContent(prompt);
        const analysis: BrainDumpAnalysis = JSON.parse(result.response.text());

        // Hydrate patches using PatchGenerator and wrap in CalendarPatch schema
        const patches = await Promise.all(analysis.options.map(async (opt) => {
            if (opt.patch_pattern === 'none') return null;

            let changes: PatchOp[] = [];

            try {
                switch (opt.patch_pattern) {
                    case 'add_task':
                        changes = await PatchGenerator.handleAdd(
                            ctx,
                            opt.args?.title || "New Task",
                            opt.args?.estimated_minutes || 30,
                            opt.args?.start
                        );
                        break;
                    case 'insert_commitment':
                        if (opt.args?.start && opt.args?.end) {
                            changes = await PatchGenerator.handleCommitment(
                                ctx,
                                opt.args.title || "Appointment",
                                opt.args.start,
                                opt.args.end
                            );
                        }
                        break;
                    case 'reduce_load':
                        changes = await PatchGenerator.handleFatigue(ctx);
                        break;
                    case 'recovery_day':
                        changes = await PatchGenerator.handleRecovery(ctx);
                        break;
                }
            } catch (e) {
                console.error("Patch generation failed", e);
            }

            if (changes.length === 0) return null;

            // Wrap in Standard CalendarPatch
            return {
                id: opt.label.replace(/\s+/g, '_').toLowerCase(),
                title: opt.label,
                impact: opt.tradeoff,
                patch: {
                    summary: opt.label,
                    affected_date: ctx.now.split('T')[0],
                    changes,
                    source: 'brain_dump'
                }
            };
        }));

        return {
            analysis,
            patches: patches.filter(p => p !== null)
        };
    }
};
