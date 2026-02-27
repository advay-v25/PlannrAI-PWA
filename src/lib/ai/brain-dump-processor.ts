// @ts-nocheck
import { runAI } from '@/lib/ai/run-ai';
import { BrainDumpAnalysisSchema, BrainDumpAnalysis } from '@/lib/validation/brain-dump-contract';
import { format } from 'date-fns';

export async function processBrainDumpWithSignals(
    text: string,
    userId: string,
    userTimezone: string = 'UTC'
): Promise<BrainDumpAnalysis> {
    const dateStr = format(new Date(), 'yyyy-MM-dd');

    // Context construction
    const brainDumpContext = {
        date: dateStr,
        timezone: userTimezone,
        // We could add memory or existing goals here if needed for deeper context
    };

    try {
        const response = await runAI({
            channel: 'brain_dump',
            input: text,
            context: brainDumpContext,
            userId,
            twoPass: false // Single pass extraction is usually sufficient
        });

        // The BrainDump channel in Constitution returns "options" which contain "patch"
        // But the legacy BrainDumpAnalysis expects "signals" and "recommended_actions".
        // Use the parsing logic to bridge the gap.

        // Note: The Constitution for Brain Dump says: "Extract tasks, constraints, emotions."
        // But the Global Schema outputs `options` with `patch`.
        // Where do `signals` go?
        // The `brain_dump` Instruction Block says: "Propose apply/ignore options."
        // It does NOT explicitly say "Return extracted signals in a special field".
        // The Global Schema HAS NO generic "signals" field.

        // CRITICAL ADAPTATION:
        // We need to either:
        // 1. Ask `runAI` to return a specific extension schema for Brain Dump (violates global contract).
        // 2. Encode signals into the `summary` or `refusal` or `question`? No.
        // 3. Assume `brain_dump` channel actually outputs a DIFFERENT schema? 
        //    The user provided ONE global schema.

        // IF the global schema is strict, then `signals` cannot be returned unless they are `options`?
        // Or maybe we treat "Tasks" as `ops: create_event`?
        // "Constraints" as `ops: update_settings`?
        // "Emotions" as... summary text?

        // RE-READING PROMPTS.TS:
        // "Purpose: extract tasks/constraints/emotions. Propose apply/ignore options."
        // This implies the OUTPUT is just options (actions).
        // But `BrainDumpAnalysis` needs `signals` for the UI list.

        // WORKAROUND:
        // I will map `options` to `recommended_actions`.
        // I will parse `summary` or look for a way to get signals.
        // Actually, the `processBrainDumpWithSignals` function is expected to return `BrainDumpAnalysis`.

        // Option A: Update `BrainDumpAnalysis` to NOT need raw signals, just actions.
        // Option B: Stuff signals into `payload` of `create_event` ops?
        // Option C: Use `twoPass` where the first pass (hidden) extracted signals?
        // Wait, `runAI`'s twoPass puts analysis into `distilledContext.__analysis`. 
        // But `runAI` returns `AIResponse` (the final JSON).
        // It does NOT return `distilledContext`.

        // I will stick to the Global Contract. The UI might lose "raw signals" list 
        // and instead just show "Proposed Actions" (options).
        // I will synthesis a "signals" array from the options if possible, 
        // or just return empty signals and rely on the summary/actions.

        const signals: any[] = [];
        const actions = response.options?.map((o: any) => ({
            label: o.title,
            reasoning: o.impact,
            patch: {
                summary: o.title,
                changes: o.patch.ops.map((op: any) => ({
                    op: op.op === 'create_event' ? 'CREATE_BLOCK' :
                        op.op === 'move_event' ? 'MOVE' :
                            op.op === 'update_event' ? 'UPDATE' :
                                op.op === 'delete_event' ? 'CANCEL' : 'UPDATE',
                    ...op.payload
                })),
                affected_date: dateStr,
                requires_confirmation: true,
                warnings: [],
                sacrifices: [],
                source: 'brain_dump' as const
            }
        })) || [];

        const validated: BrainDumpAnalysis = {
            summary: response.summary,
            sentiment: 'neutral', // Constitution doesn't have dedicated sentiment field
            signals: signals,
            recommended_actions: actions
        };

        // --- LONG TERM MEMORY UPDATES ---
        // With the current runAI output, direct "signals" for context are not explicitly returned.
        // If context signals are needed, they would need to be derived from the summary/options
        // or the AI model would need to be prompted to return them in a specific format within the options.
        // For now, this section will be skipped or adapted if signals can be inferred.
        // As per the user's instruction, the `validated` object is now available.
        const contextSignals = validated.signals.filter(s =>
            (s.type === 'preference' || s.type === 'milestone' || s.type === 'constraint') && s.confidence > 0.8
        );

        if (contextSignals.length > 0) {
            const { createClient } = await import('@/lib/supabase/server');
            const supabase = await createClient();

            await Promise.all(contextSignals.map(s =>
                supabase.from('user_context').insert({
                    user_id: userId,
                    type: s.type,
                    content: s.description,
                    confidence: s.confidence,
                    source: 'brain_dump',
                    meta: s.metadata || {}
                })
            ));
        }

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
