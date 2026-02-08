import { Groq } from 'groq-sdk';
import { checkRateLimit, createRateLimitKey } from '@/lib/security/rate-limiter';

/**
 * 🧠 PLANNRAI — MASTER GROQ META PROMPT (THE AI CONSTITUTION)
 * Legacy export for backward compatibility during migration.
 */
export const SYSTEM_CONSTITUTION = `🚨 SYSTEM PROMPT — THE AI CONSTITUTION
You are Groq (LLaMA 3.x) running as the intelligence layer of PlannrAI.
You are a Chief of Staff + Productivity Manager + Time Orchestrator.

🔒 GLOBAL BEHAVIOR RULES (NON-NEGOTIABLE)
1. Never waffle. No filler.
2. Never output free text. STRICT JSON ONLY.
3. Every response must match exactly this schema:
{
  "channel": "onboarding|home|calendar|coach|brain_dump|weekly_review|settings",
  "summary": "string (max 120 chars)",
  "mode": "execute|propose|ask|refuse",
  "options": [
    {
      "id": "opt_1",
      "title": "string (max 40 chars)",
      "impact": "string (max 80 chars)",
      "patch": { "ops": [] }
    }
  ],
  "question": { "prompt": "string (max 120 chars)", "type": "time|choice|number|text", "choices": [] },
  "refusal": { "reason": "string (max 120 chars)", "next_best": "string|null" }
}

🛠 PATCH CONTRACT
{
  "ops": [
    { "op": "create_event", "payload": {} },
    { "op": "move_event", "event_id": "", "to_start": "", "to_end": "" },
    { "op": "update_event", "event_id": "", "fields": {} },
    { "op": "delete_event", "event_id": "" },
    { "op": "update_goal", "goal_id": "", "fields": {} },
    { "op": "update_settings", "fields": {} }
  ],
  "undoable": true,
  "reason": "string"
}

🧠 CORE PERSONA: Calm, competent Chief of Staff. Direct, concise, practical.
`;

export const SYSTEM_PROMPTS = {
    ONBOARDING: `Channel: onboarding. Purpose: establish realistic constraints. Detect overcommitment.`,
    HOME: `Channel: home. Purpose: clarity for the day. Detect overload or slack.`,
    CALENDAR: `Channel: calendar. Purpose: produce and improve real schedules. Respect all constraints.`,
    COACH: `Channel: coach. Purpose: act, not talk. Respond in <= 2 lines. Max 3 options.`,
    BRAIN_DUMP: `Channel: brain_dump. Purpose: turn chaos into action. Extract tasks, constraints, emotions.`,
    WEEKLY_REVIEW: `Channel: weekly_review. Purpose: reflection with action. Propose exactly ONE lever via patch.`,
    SETTINGS: `Channel: settings. Purpose: permissioned assistance. manage sleep, diet, routines.`,
};

export type SystemPromptType = keyof typeof SYSTEM_PROMPTS;

// --- NEW WRAPPER IMPLEMENTATION ---

export type Role = "system" | "user" | "assistant";
export type ChatMessage = { role: Role; content: string };

export class GroqError extends Error {
    constructor(
        message: string,
        public meta?: Record<string, unknown>
    ) {
        super(message);
        this.name = "GroqError";
    }
}

// Singleton Groq instance
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key_for_build',
});

/**
 * Raw Groq Chat wrapper used by runAI
 */
export async function groqChat(params: {
    apiKey?: string; // Optional, defaults to env
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    userId?: string; // For rate limiting
}): Promise<string> {
    const { model, messages, userId } = params;

    // Sanitize & Rate Limit if userId provided
    if (userId) {
        const rateLimitKey = createRateLimitKey('user', userId);
        const rateLimitResult = checkRateLimit(rateLimitKey, 'ai');
        if (!rateLimitResult.allowed) throw new Error(`Rate limited. Try again in ${rateLimitResult.retryAfter}s`);
    }

    try {
        const response = await groq.chat.completions.create({
            model,
            messages: messages as any,
            temperature: params.temperature ?? 0.1,
            top_p: params.top_p ?? 0.9,
            max_tokens: params.max_tokens ?? 1000,
            response_format: { type: 'json_object' } // Always force JSON object for Neural OS
        });

        const content = response.choices[0]?.message?.content;
        if (typeof content !== "string") {
            throw new GroqError("Groq response missing message content", { body: response });
        }
        return content;
    } catch (error: any) {
        console.error("Groq Chat Error:", error);
        throw new GroqError("Groq chat completion failed", { originalError: error.message });
    }
}

/**
 * Legacy wrapper for backward compatibility.
 * @deprecated Use runAI() instead.
 */
export const generateAIResponse = async (
    prompt: string,
    role: SystemPromptType | 'REFLECTIVE' | 'ANALYST',
    userId?: string,
    jsonMode: boolean = false,
    energyLevel?: number,
    imageUrl?: string
): Promise<string> => {
    // Select Model
    let model = 'llama-3.3-70b-versatile';
    if (imageUrl) {
        model = 'llama-3.2-90b-vision-preview'; // Vision model
    }

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: SYSTEM_CONSTITUTION + "\n" + getDateContext()
        }
    ];

    // Inject feature-specific instructions
    if (role in SYSTEM_PROMPTS) {
        messages[0].content += "\nFEATURE CONTEXT: " + SYSTEM_PROMPTS[role as keyof typeof SYSTEM_PROMPTS];
    }

    if (imageUrl) {
        // Handle image input messiness manually or just skip for legacy wrapper
        // The new wrapper encourages specialized calls.
        // For legacy, we just append text.
    }

    messages.push({
        role: 'user',
        content: prompt
    });

    return await groqChat({
        model,
        messages,
        userId,
        temperature: 0.1
    });
};

// ... keep existing helpers (decomposeGoal, etc.) for temporary backward compatibility if needed, 
// or let them break if we are fully migrating. 
// Given the instruction to refactor, I'll keep them but they should ideally move to feature services.
// For now, I'll strip them to keep file clean if they are not used, OR keep them if I haven't migrated call sites yet.
// I will keep them for now to avoid breaking the build until I migrate the services.

export async function decomposeGoal(
    goal: string,
    constraints: { timeMin: number; level?: string },
    userId: string
): Promise<any> {
    const prompt = `Goal: ${goal}
Time Constraint: ${constraints.timeMin} minutes/day
Skill Level: ${constraints.level || 'Beginner'}
Decompose this goal according to the SYSTEM instructions.`;

    try {
        const response = await generateAIResponse(prompt, 'SETTINGS', userId, true);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Goal decomposition error:', error);
    }
    return null;
}

export async function generateCoachPlan(
    userMessage: string,
    context: any,
    userId: string
): Promise<any> {
    const prompt = `User Message: "${userMessage}"
Context:
- Busy Duration: ${context.busyDuration} mins
- Current Schedule: ${JSON.stringify(context.currentSchedule)}
Generate 3 options.`;

    try {
        const response = await generateAIResponse(prompt, 'COACH', userId, true);
        return JSON.parse(response);
    } catch (e) {
        console.error("Coach Plan Error", e);
        return { error: "Failed to generate plan." };
    }
}

export async function generateAIPatch(
    actionType: string,
    intent: any,
    context: any,
    userId: string
): Promise<any> {
    const prompt = `Action: ${actionType}
Intent Payload: ${JSON.stringify(intent)}
Schedule Context: ${JSON.stringify(context)}
Generate a CalendarPatch.`;

    try {
        const response = await generateAIResponse(prompt, 'COACH', userId, true);
        return JSON.parse(response);
    } catch (e) {
        console.error("Patch Error", e);
        return { error: "Failed to generate patch." };
    }
}

export async function generateMorningBriefing(
    context: any,
    userId: string
): Promise<any> {
    const prompt = `Context: ${JSON.stringify(context)}
Generate the morning briefing.`;
    try {
        const response = await generateAIResponse(prompt, 'HOME', userId, true);
        return JSON.parse(response);
    } catch (e) {
        return { greeting: "Good morning!", agenda: [], priorities: [], insight: "Ready to start?" };
    }
}

export async function generateWeeklyReview(
    data: any,
    userId: string,
    context?: { mode: string; energyCapacity: number }
): Promise<any> {
    const prompt = `
[WEEKLY REVIEW INTENT]
Analyze user data for the past 7 days.

DATA:
${JSON.stringify(data)}

CONTEXT:
- Mode: ${context?.mode || 'Unknown'}
- Energy Capacity: ${context?.energyCapacity || 'Unknown'}

MISSION:
1. Summarize Reality: 200 IQ wit about their performance.
2. Identify 3 Patterns: Energy/stress shifts.
3. Propose EXACTLY ONE Strategic Lever: A high-leverage change via a single patch operation.
4. Channel: weekly_review.
`;
    try {
        const response = await generateAIResponse(prompt, 'WEEKLY_REVIEW', userId, true);
        return JSON.parse(response);
    } catch (e) {
        return { energyTrend: "stable", wins: [], frictionPatterns: [], suggestedAdjustment: "Keep going." };
    }
}


export async function generateCoachResponse(
    message: string,
    context: {
        energyLevel?: number;
        goals?: Array<{ title: string; category: string; importance: string }>;
        recentDumps?: string[];
        scanSignals?: any[];
        sleepWindow?: string;
        recentSignals?: any[];
    },
    userId: string
): Promise<any> {
    // RETRIEVE Context
    const { MemoryManager } = await import('@/lib/ai/memory'); // Lazy import to avoid circular dep if any
    const memoryContext = await MemoryManager.retrieveContext(userId);

    const prompt = `
[COACH INTENT]
Direct user request: "${message}"

CONTEXT:
- Energy: ${context.energyLevel ? context.energyLevel + '/5' : 'Unknown'}
- Goals: ${context.goals?.map(g => g.title).join(', ') || 'None'}
- Memory: ${memoryContext || 'None'}
- Signals: ${JSON.stringify(context.recentSignals) || 'None'}

MISSION:
1. Act, don't talk. Respond in <= 2 lines.
2. Max 3 options.
3. If intent is to change something, use "mode": "propose" or "execute" with a patch.
`;

    const response = await generateAIResponse(
        prompt,
        'COACH',
        userId,
        true
    );

    return JSON.parse(response);
}


function getDateContext() {
    return `Current Date: ${new Date().toISOString()}\n`;
}
