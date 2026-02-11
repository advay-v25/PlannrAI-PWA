import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCoachContext, saveCoachMessage } from '@/lib/coach/coach-context';
import { PatchGenerator } from '@/lib/coach/patch-generator';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_KEY!);

const COACH_SYSTEM_INSTRUCTION = `
ROLE: Chief of Staff.
GOAL: Manage schedule with executable actions.
TONE: Concise, tactical, low-ego.
Forbidden: "I hope this helps", "Here are options", motivational fluff.

INPUT:
- User message
- Schedule (JSON) in context
- Thread history

OUTPUT:
Strict JSON adhering to this schema:
{
  "intent": "adjust_schedule" | "rebuild_day" | "rebuild_week" | "reduce_intensity" | "insert_commitment" | "none",
  "explanation": "one sentence diagnosis, max 160 chars",
  "options": [
    {
      "label": "Action label (max 60 chars)",
      "tradeoff": "Why this option? (max 100 chars)",
      "patch_pattern": "busy_slot" | "fatigue" | "add_task" | "custom",
      "args": { ... }
    }
  ]
}

RULES:
1. "I'm busy at 4pm" -> pattern="busy_slot"
2. "I'm exhausted" -> pattern="fatigue"
3. "Add Task X" -> pattern="add_task"
4. conversational -> intent="none", explanation="Ready. Share constraint."
5. Max 3 options.
`.trim();

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { message } = await request.json();

        // 1. Build Context
        const context = await buildCoachContext(user.id, supabase);

        // 2. Save User Message
        await saveCoachMessage(user.id, 'user', message, supabase);

        // 3. Call LLM
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash-latest',
            generationConfig: { responseMimeType: 'application/json' },
            systemInstruction: COACH_SYSTEM_INSTRUCTION
        });

        const prompt = `
CONTEXT:
${JSON.stringify({
            now: context.now,
            timezone: context.timezone,
            schedule_summary: context.schedule.map(b => `${b.start_time}: ${b.title} (${b.block_type})`).join('\n'),
            anchors: context.anchors.length,
            profile: context.profile
        })}

USER MESSAGE: "${message}"

Generate executable JSON options.
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        let aiJson;
        try {
            aiJson = JSON.parse(text);
        } catch (e) {
            console.error('JSON Parse Error', text);
            return NextResponse.json({ error: 'AI produced invalid JSON' }, { status: 500 });
        }

        // 4. Hydrate Patches (Server-side Logic)
        // The LLM gives us the *intent* and *args*, we generate the *actual ops* using deterministic code.
        // This is safer than asking LLM to generate raw JSON patches.

        const hydratedOptions = await Promise.all((aiJson.options || []).map(async (opt: any) => {
            let ops: any[] = [];

            if (opt.patch_pattern === 'busy_slot') {
                ops = await PatchGenerator.handleBusy(context, opt.args.start, opt.args.end);
            } else if (opt.patch_pattern === 'fatigue') {
                ops = await PatchGenerator.handleFatigue(context);
            } else if (opt.patch_pattern === 'add_task') {
                ops = await PatchGenerator.handleAdd(context, opt.args.title, opt.args.duration, opt.args.time);
            }

            return {
                ...opt,
                patch: {
                    reason: opt.tradeoff,
                    ops: ops
                }
            };
        }));

        // Filter out empty options (where heuristic failed)
        const finalOptions = hydratedOptions.filter(o => o.patch.ops.length > 0);

        const finalResponse = {
            intent: finalOptions.length > 0 ? aiJson.intent : 'none',
            explanation: finalOptions.length > 0 ? aiJson.explanation : (aiJson.intent !== 'none' ? "I couldn't find a valid schedule change for that request." : aiJson.explanation),
            options: finalOptions
        };

        // 5. Save Assistant Message
        await saveCoachMessage(user.id, 'assistant', null, supabase, finalResponse);

        return NextResponse.json(finalResponse);

    } catch (error: any) {
        console.error('Coach API Error:', error);
        return NextResponse.json({
            intent: 'none',
            explanation: 'System error. Please try again.',
            options: []
        }, { status: 500 });
    }
}
