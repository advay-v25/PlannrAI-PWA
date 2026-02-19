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
    HABIT_OPTIMIZATION: `Channel: habit_optimization. Purpose: analyze completion rates and suggest improvements.`,
    GOAL_SUGGESTION: `Channel: goal_suggestion. Purpose: suggest balanced goals based on user profile.`,
    DONNA_BRAIN_DUMP: `Channel: brain_dump. Context: You are Donna, a warm and sharp supportive companion.`,
    AGENT_PLANNER: `Channel: planner. Purpose: decompose goals and schedule tasks.`,
    AGENT_REGULATOR: `Channel: regulator. Purpose: monitor energy and workload, suggest adjustments.`,
    SMART_CATEGORIZATION: `Channel: categorization. Purpose: tag and categorize brain dumps.`,
    THINKING_ENGINE: `Channel: thinking_engine. Purpose: proactive synthesis. Analyze user context and generate interventions. Return JSON with "interventions" array, each having type, message, confidence (0-1), and optional payload.`,
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
    signal?: AbortSignal;
}): Promise<string> {
    const { model, messages, userId, signal } = params;

    // Sanitize & Rate Limit if userId provided
    if (userId) {
        const rateLimitKey = createRateLimitKey('user', userId);
        const rateLimitResult = checkRateLimit(rateLimitKey, 'ai');
        if (!rateLimitResult.allowed) throw new Error(`Rate limited. Try again in ${rateLimitResult.retryAfter}s`);
    }

    try {
        const apiKey = params.apiKey || process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error("GROQ_API_KEY is missing");

        const requestBody = {
            model,
            messages,
            temperature: params.temperature ?? 0.1,
            top_p: params.top_p ?? 0.9,
            max_tokens: params.max_tokens ?? 1000,
            response_format: { type: 'json_object' }
        };

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new GroqError(`Groq API Error: ${response.status}`, {
                body: errorText,
                request: JSON.stringify(requestBody).slice(0, 1000) // Log first 1000 chars of request to avoid huge logs
            });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (typeof content !== "string") {
            throw new GroqError("Groq response missing message content", { body: data });
        }
        return content;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Groq request timed out');
        }
        // If it's already a GroqError (e.g. 401, 500), rethrow it specifically or preserve message
        if (error instanceof GroqError) {
            throw error;
        }

        console.error("Groq Chat Error:", error);
        // Include original error in the main message for visibility
        throw new GroqError(`Groq chat completion failed: ${error.message}`, {
            originalError: error.message,
            request: (error as any).meta?.request
        });
    }
}
