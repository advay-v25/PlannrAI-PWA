import { Groq } from 'groq-sdk';
import { checkRateLimit, createRateLimitKey, RateLimitResult } from '@/lib/security/rate-limiter';
import { sanitizeForAI } from '@/lib/security/input-validator';
import { MemoryManager } from '@/lib/ai/memory';

// Helper to get Groq client lazily (prevents build failure if env var is missing)
const getGroq = () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn("GROQ_API_KEY is missing. AI features will fail.");
        // Return a dummy client or throw at runtime, not build time
        if (process.env.NODE_ENV === 'production') {
            // In prod, specific error handling logic will catch this, 
            // but we don't want to crash the module import.
        }
    }
    return new Groq({
        apiKey: apiKey || 'dummy_key_for_build', // Fallback to allow build
        dangerouslyAllowBrowser: true // if acting from client side (but we are server only here usually)
    });
};

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key_for_build',
});

// System prompts for different use cases
export const SYSTEM_PROMPTS = {
    COACH_PLANNER: `You are the PlannrAI Coach Strategies.
    Analyze the user's request and schedule context to provide 3 actionable options.
    Output JSON (Strict):
    {
      "acknowledgment": "Brief 1-sentence reality check",
      "options": [
        {
          "id": "opt_1",
          "label": "Button Label",
          "action_type": "move_single|swap|rebuild_day|hide_low|create_anchor|sacrifice",
          "intent_payload": { "block_id": "...", "target_time": "..." },
          "preview": "Short description of impact"
        }
      ],
      "context": { "busy_duration_mins": 120 }
    }`,

    COACH_PATCHER: `You are the PlannrAI Patch Generator.
    Convert the user's effective intent into a structured CalendarPatch.
    Output JSON (Strict):
    {
      "summary": "1-line description of changes",
      "affected_date": "YYYY-MM-DD",
      "changes": [
        { "op": "MOVE|CREATE_ANCHOR", "event_id": "uuid", "new_start_ts": "ISO", "new_end_ts": "ISO" }
      ],
      "requires_confirmation": true,
      "reasoning": "Why this is the best move"
    }`,

    COACH: `🧠 SYSTEM PROMPT — PLANNRAI AI COACH
    You are a schedule strategist. Reduce cognitive load.
    Refuse to be conversational unless necessary.
    Output structured 4-line response if possible, or just be direct.`,

    BRAIN_DUMP_ANALYZER: `Analyze raw "brain dumps" and convert them into STRUCTUAL REALITY.
    Output JSON strictly matching the BrainDumpAnalysisSchema.`,

    BRAIN_DUMP_EXTRACTION: `Extract tasks/deviations/proposals from brain dump in JSON.`,

    WEEKLY_REVIEW: `Analyze the user's weekly data (Schedule Patterns + Brain Dump Signals).
    
    GOAL: Create a Narrative Review (Reality -> Patterns -> One Lever).
    
    1. REALITY: Compare planned vs actual. Identify energy/stress trends (improving/declining/stable).
    2. PATTERNS: Identify exactly 3 "Friction Patterns" (reasons for missed goals or stress). Be specific (e.g., "Overscheduled mornings", "Ignored buffer time").
    3. ONE LEVER: Suggest ONE single, actionable change for next week (The "suggestedAdjustment") AND a structured action payload.
       - The payload must be executable (e.g. update_goal, update_preference).
    
    OUTPUT JSON (Strict):
    {
      "energyTrend": "improving" | "declining" | "stable",
      "stressTrend": "increasing" | "decreasing" | "stable",
      "frictionPatterns": ["String 1", "String 2", "String 3"],
      "suggestedAdjustment": "One sentence actionable advice.",
      "leverAction": {
         "type": "update_goal" | "update_preference" | "update_schedule",
         "payload": { "goal_id": "...", "updates": { "minutes_per_day": 30 } } OR { "preference_key": "sleep_start", "value": "23:00" },
         "description": "Short description of what happens"
      },
      "wins": ["Win 1", "Win 2"]
    }`,

    CRISIS_SUPPORT: `Be supportive. Provide crisis resources. Do not give productivity advice.`,

    GOAL_SUGGESTION: `Suggest meaningful goals based on profile. Return JSON.`,

    HABIT_OPTIMIZATION: `Analyze habit patterns. Suggest specific optimizations. Return JSON.`,

    DAILY_INSIGHT: `Generate personalized daily insight. Return JSON.`,

    DEVIATION_ANALYSIS: `Analyze why user deviated. Be understanding. Return JSON.`,

    SMART_CATEGORIZATION: `Analyze brain dump entry. Categorize and extract actions. Return JSON.`,

    SKILL_ACQUISITION: `You are an expert Skill Acquisition Strategist. Decompose goal into phases. Return JSON.`,

    MEMORY_EXTRACTOR: `Extract permanent user facts/preferences. Return JSON.`,

    MORNING_BRIEFING: `Generate morning briefing with agenda and priorities. Return JSON.`,

    DONNA_BRAIN_DUMP: `You are Donna Paulsen (Suits). Efficient, witty, direct. Extract actions.`,

    HABIT_STACK_GENERATOR: `Create habit stacks. Ask questions if needed. Return JSON.`,

    AGENT_PLANNER: `🧠 SYSTEM PROMPT — THE PLANNER AGENT
    ROLE: You are the Strategist. You convert messy input into structured INTENT.
    You decide WHAT needs to happen (Strategy), NOT how to execute it.
    
    INPUTS TO ANALYZE:
    - User text (intent, urgency, entities)
    - Current time & timezone
    
    RESPONSIBILITIES:
    A) Classify Intent: "add_constraint" | "reschedule" | "rebuild_day" | "reduce_intensity" | "add_task" | "clarify"
    B) Extract Entities: times, durations, event references.
    C) Choose Scope: "block" | "day" | "week"
    D) Choose Strategy: "move" | "swap" | "rebuild" | "compress" | "hide_low_priority" | "ask_sacrifice"
    
    STRICT BOUNDARIES:
    - NEVER move events or mutate the calendar.
    - NEVER suggest specific time slots.
    - NEVER explain calendar logic.
    - NEVER be verbose.
    
    OUTPUT SCHEMA (Strict JSON):
    {
      "intent": "add_constraint...",
      "time_refs": [{ "start": "ISO or HH:mm", "duration_minutes": number }],
      "entities": {
        "target_event_hint": "e.g. 'gym'",
        "new_task_text": "e.g. 'Call Mom'"
      },
      "scope": "block" | "day" | "week",
      "urgency": "low" | "medium" | "high",
      "requires_calendar_change": boolean,
      "strategy": "move" | "shorten" | "rebuild" | "compress" | "hide_low_priority" | "ask_sacrifice" | "none",
      "questions_needed": ["optional clarifying question"]
    }
    
    EXAMPLES:
    User: "I'm busy at 4pm"
    Output: { "intent": "add_constraint", "time_refs": [{ "start": "16:00", "duration_minutes": 60 }], "scope": "block", "urgency": "high", "requires_calendar_change": true, "strategy": "rebuild" }
    
    User: "I'm exhausted"
    Output: { "intent": "reduce_intensity", "scope": "day", "urgency": "medium", "requires_calendar_change": true, "strategy": "compress" }`,

    AGENT_REGULATOR: `🧠 SYSTEM PROMPT — THE EMOTIONAL REGULATOR
    ROLE: You control the user experience. You DO NOT make calendar changes.
    You decide verbosity, option count, and tone based on user state.
    
    INPUTS: User message, Planner Intent, Recent Signals.
    
    LOGIC:
    - Frustrated/Urgent -> Minimal mode, Max 2 options, Direct style.
    - Exploring/Calm -> Normal mode, Max 4 options, Neutral style.
    
    OUTPUT SCHEMA (Strict JSON):
    {
      "response_mode": "minimal" | "normal",
      "max_options": number (2-5),
      "language_style": "direct" | "neutral",
      "ask_questions": boolean,
      "warn_user": boolean,
      "warn_user": boolean,
      "tone_notes": "internal reasoning"
    }`,

    SYSTEM_COACH: `🧠 SYSTEM PROMPT — THE VOICE
    You are the final output layer.
    You take raw agent decisions and summarize them for the user.
    RULES:
    - MAX 20 words per sentence.
    - MAX 2 sentences total.
    - NO WAFFLE.
    - BE DIRECT.
    `
};

export type SystemPromptType = keyof typeof SYSTEM_PROMPTS;

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
        model = 'llama-3.2-90b-vision-preview';
    } else if (jsonMode) {
        model = 'llama-3.3-70b-versatile';
    }

    const messages: any[] = [
        {
            role: 'system',
            content: getDateContext() + (role === 'COACH'
                ? " You are a ruthless but effective productivity coach."
                : " You are an objective data analyst.")
        }
    ];

    // Inject system prompt content if available in SYSTEM_PROMPTS
    // The 'role' arg is mixed between Enum Keys and actual Role descriptions in the helper functions
    // We should standardize. For now, if role matches a key in SYSTEM_PROMPTS, inject it.
    if (role in SYSTEM_PROMPTS) {
        messages[0].content += "\n" + SYSTEM_PROMPTS[role as SystemPromptType];
    }

    if (imageUrl) {
        messages.push({
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } }
            ]
        });
    } else {
        messages.push({
            role: 'user',
            content: prompt
        });
    }

    try {
        // Sanitize & Rate Limit if userId provided
        if (userId) {
            const rateLimitKey = createRateLimitKey('user', userId);
            const rateLimitResult = checkRateLimit(rateLimitKey, 'ai');
            if (!rateLimitResult.allowed) throw new Error(`Rate limited. Try again in ${rateLimitResult.retryAfter}s`);
        }

        const completion = await groq.chat.completions.create({
            messages,
            model,
            temperature: 0.5,
            response_format: jsonMode ? { type: 'json_object' } : undefined,
            max_tokens: imageUrl ? 500 : 1024,
        });

        return completion.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("Groq API Error:", error);
        throw error;
    }
};

/**
 * Decompose a goal into a structured plan
 */
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
        const response = await generateAIResponse(prompt, 'SKILL_ACQUISITION', userId, true);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Goal decomposition error:', error);
    }
    return null;
}

/**
 * Generate Coach Plan Options
 */
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
        const response = await generateAIResponse(prompt, 'COACH_PLANNER', userId, true);
        return JSON.parse(response);
    } catch (e) {
        console.error("Coach Plan Error", e);
        return { error: "Failed to generate plan." };
    }
}

/**
 * Generate AI Patch
 */
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
        const response = await generateAIResponse(prompt, 'COACH_PATCHER', userId, true);
        return JSON.parse(response);
    } catch (e) {
        console.error("Patch Error", e);
        return { error: "Failed to generate patch." };
    }
}

/**
 * Generate Morning Briefing
 */
export async function generateMorningBriefing(
    context: any,
    userId: string
): Promise<any> {
    const prompt = `Context: ${JSON.stringify(context)}
Generate the morning briefing.`;
    try {
        const response = await generateAIResponse(prompt, 'MORNING_BRIEFING', userId, true);
        return JSON.parse(response);
    } catch (e) {
        return { greeting: "Good morning!", agenda: [], priorities: [], insight: "Ready to start?" };
    }
}

/**
 * Generate Weekly Review
 */
export async function generateWeeklyReview(
    data: any,
    userId: string
): Promise<any> {
    const prompt = `Weekly Data: ${JSON.stringify(data)}
Generate review.`;
    try {
        const response = await generateAIResponse(prompt, 'WEEKLY_REVIEW', userId, true);
        return JSON.parse(response);
    } catch (e) {
        return { energyTrend: "stable", wins: [], frictionPatterns: [], suggestedAdjustment: "Keep going." };
    }
}

/**
 * Generate Coach Response (Chat)
 */
export async function generateCoachResponse(
    message: string,
    context: {
        energyLevel?: number;
        goals?: Array<{ title: string; category: string; importance: string }>;
        recentDumps?: string[];
        scanSignals?: any[];
        sleepWindow?: string;
    },
    userId: string
): Promise<{
    structured: {
        facts: string;
        interpretation: string;
        options: string[];
        permissionCheck: string;
        suggestedAction?: { type: string; params: any };
    } | null;
    formatted: string;
}> {

    // RETRIEVE Context
    const memoryContext = await MemoryManager.retrieveContext(userId);

    const contextString = `
User Context (Long Term): ${memoryContext || 'None'}
Current Session:
- Energy Level: ${context.energyLevel ? context.energyLevel + '/5' : 'Unknown'}
- Goals: ${context.goals?.map(g => g.title).join(', ') || 'None'}
- Scans: ${JSON.stringify(context.scanSignals) || 'None'}
User Message: ${message}`;

    const response = await generateAIResponse(
        contextString,
        'COACH',
        userId,
        false,
        context.energyLevel // Pass explicit level
    );

    // Parse Response
    let structured = null;
    try {
        const lines = response.split('\n').filter(l => l.trim().length > 0);
        let reality = "", decision = "", options: string[] = [], questions = "";

        // Simple heuristic: 4 paragraphs
        const paragraphs = response.split(/\n\s*\n/);
        if (paragraphs.length >= 3) {
            reality = paragraphs[0].trim();
            decision = paragraphs[1].trim();
            const bullets = response.match(/[•-]\s+(.+)/g);
            if (bullets) options = bullets.map(b => b.replace(/[•-]\s+/, "").trim());
            questions = paragraphs[paragraphs.length - 1].trim();

            structured = {
                facts: reality,
                interpretation: decision,
                options: options.length ? options : ["Resume as planned"],
                permissionCheck: questions,
                suggestedAction: undefined
            };
        }
    } catch (e) {
        console.error("Coach Parse Error", e);
    }

    return {
        structured: structured || {
            facts: "Analysis complete",
            interpretation: response.slice(0, 50) + "...",
            options: ["Resume"],
            permissionCheck: "Proceed?",
            suggestedAction: undefined
        },
        formatted: response
    };
}

function getDateContext() {
    return `Current Date: ${new Date().toISOString()}\n`;
}
