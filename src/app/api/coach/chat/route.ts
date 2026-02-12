import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCoachContext, saveCoachMessage } from '@/lib/coach/coach-context';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { CoachOutputSchema } from '@/lib/ai/registry';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_KEY!);

const BASE_RULES = `
Rules:
- Output STRICT JSON only. No markdown, no commentary.
- Use only provided context. Do not hallucinate.
`.trim();

const COACH_SYSTEM_INSTRUCTION = `
You are PlannrAI Coach — a TACTICAL Chief of Staff.
${BASE_RULES}

BEHAVIOUR:
- Be SHORT and DECISIVE. No essays. Max 160 chars in explanation.
- If the user's message implies a scheduling change, return 2-3 patch options.
- If the user just chats or asks a question with no schedule impact, return intent="none" and explain briefly.
- Every option MUST contain a valid patch with concrete ops referencing real event IDs from the schedule below.
- No patch = no option. Never return an option without a patch.

HARD CONSTRAINTS — VIOLATION = FAILURE:
1. NEVER move or delete blocks where is_locked=true.
2. NEVER move or delete anchor blocks (source="anchor" or has commitment_id).
3. NEVER schedule anything outside awake hours (assume 06:00-23:00 unless context says otherwise).
4. NEVER delete or move meal blocks (source="meal").
5. Respect buffer_minutes between blocks.
6. All times in ISO format matching schedule data.

PATCH OPS (use CoachV4 format):
- { "op": "move", "event_id": "<uuid>", "to_start": "<ISO>", "to_end": "<ISO>" }
- { "op": "create", "event": { "title": "...", "start_time": "<ISO>", "end_time": "<ISO>", "block_type": "...", "source": "coach" } }
- { "op": "update", "event_id": "<uuid>", "fields": { ... } }
- { "op": "delete", "event_id": "<uuid>" }

OUTPUT JSON (strict):
{
  "intent": "adjust_schedule"|"rebuild_day"|"rebuild_week"|"reduce_intensity"|"none",
  "explanation": "string (max 160 chars)",
  "options": [{
    "label": "string (max 60 chars)",
    "patch": { "ops": [...], "scope": "day"|"week", "reason": "string (max 100)" },
    "tradeoff": "string (max 120 chars, optional)"
  }]
}

If impossible: intent="none", options=[], explanation explains why.

STRATEGY FOR OPTIONS:
- Option 1: Minimal move (move one block to nearest free slot)
- Option 2: Rebalance today (reshuffle flexible blocks)
- Option 3: Rebalance week (spread load across days) — only if relevant
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
            profile: context.profile,
            facts: (context as any).facts || []
        }, null, 2)}

USER MESSAGE: "${message}"

Generate executable JSON options.
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Validate and Repair
        const aiJson = await JSONReliability.validateOrRepair(text, CoachOutputSchema, 'gemini-1.5-flash-latest');

        // 4. No Hydration needed - LLM generates full patches now.
        // Just standard validation or sanitization if needed.

        const finalResponse = {
            intent: aiJson.intent || 'none',
            explanation: aiJson.explanation || "I'm not sure what to do.",
            options: aiJson.options || []
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
