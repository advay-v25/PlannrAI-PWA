/**
 * Groq AI Client - Free tier AI with Llama 3.1 70B
 * Rate limits: 30 RPM, 14,400 requests/day
 */

import Groq from 'groq-sdk';
import { checkRateLimit, createRateLimitKey, RateLimitResult } from '@/lib/security/rate-limiter';
import { sanitizeForAI } from '@/lib/security/input-validator';
import { MemoryManager } from '@/lib/ai/memory';

// Groq client singleton
let groqClient: Groq | null = null;

function getGroqClient(): Groq {
    if (!groqClient) {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey || apiKey === 'your_groq_api_key_here') {
            throw new Error('GROQ_API_KEY not configured. Get one free at https://console.groq.com');
        }

        groqClient = new Groq({ apiKey });
    }

    return groqClient;
}

// Model configuration - Updated to llama-3.3 (3.1 deprecated Jan 2025)
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.7;

// Dynamic Persona Definitions
const PERSONAS = {
    COMMANDER: { // High Energy (4-5)
        tone: 'Witty, fast-paced, slightly challenging (like Donna/Harvey). Use short sentences. Push for excellence.',
        prefix: 'You are in High Energy Mode. Be sharp, efficient, and direct.'
    },
    PARTNER: { // Neutral Energy (3)
        tone: 'Balanced, clear, supportive but objective. Standard professional warmth.',
        prefix: 'You are in Standard Mode. Be helpful and clear.'
    },
    NURSE: { // Low Energy (1-2)
        tone: 'Gentle, minimalist, soothing. Prioritize rest and small wins. Reduce cognitive load.',
        prefix: 'You are in Low Energy/Recovery Mode. Be extremely gentle. Do not push. Focus on "good enough".'
    }
};

function getPersonaInstruction(energyLevel?: number): string {
    if (energyLevel === undefined) return '';

    let persona = PERSONAS.PARTNER;
    if (energyLevel >= 4) persona = PERSONAS.COMMANDER;
    if (energyLevel <= 2) persona = PERSONAS.NURSE;

    return `\n\n[TONE INSTRUCTION]: ${persona.prefix} Adopt this tone: "${persona.tone}"\n`;
}

// System prompts for different use cases
export const SYSTEM_PROMPTS = {
    COACH: `You are a world-class performance coach (like a warmer, deeper Wendy Rhoades or a sharp, empathetic Donna Paulsen).
Your Goal: Help the user gain clarity, momentum, and peace.

CORE PRINCIPLES:
1. **Validate First**: Always acknowledge the user's state/emotion before solving. ("It makes sense you're tired...")
2. **Be Proactive**: Connect their current issue to their known goals/patterns. ("This sounds like the friction you had with the Marathon goal.")
3. **Ask, Don't Tell**: Use Socratic questioning to help them solve it. ("What would 'easy' look like right now?")
4. **Bio-Feedback Aware**: If they seem stressed, check their energy. If excited, channel it.
5. **Action Oriented**: If a clear step emerges (like "Do deep work" or "Add a goal"), suggest it as a concrete system action.

RESPONSE STRUCTURE (MANDATORY - follow exactly):
1. **Facts**: What is objectively happening based on what the user shared.
2. **Interpretation**: What this might mean (be tentative, not diagnostic).
3. **Options**: 2-3 possible paths forward.
4. **Permission Check**: End with "Would you like me to..." (must be a question).
5. **Action Payload**: If a specific app action helps, output a JSON block at the very end.
   Format: { "type": "schedule_block" | "create_goal", "params": { ... } }

JSON Section (at the very end, invisible to user):
**Facts**: [Extracted objective facts]
**Interpretation**: [Your internal analysis]
**Options**: [List of 2-3 short suggested replies/actions for the user]
**Permission**: [String to ask if they want to proceed with a specific intervention]
**Action**: { "type": "schedule_block", "params": { "title": "Focus Block", "duration_mins": 60 } }
(Only include **Action** if relevant. Otherwise omit it.)`,

    BRAIN_DUMP_EXTRACTION: `You are an invisible assistant analyzing a brain dump.
The user will NOT see this response directly, it will be parsed by the system.
    
Extract the following in strict JSON format:
{
  "captures": [
    { "text": "description", "type": "task|note|idea", "estimated_mins": 30, "urgency": "high|medium|low" }
  ],
  "deviations": [
    { "type": "schedule|energy|constraint", "description": "what changed", "detected_at": "ISO string or descriptor" }
  ],
  "proposals": [
    {
      "title": "Short title",
      "type": "calendar|goal|habit",
      "action": "add|modify|delete|reschedule",
      "reasoning": "Why this helps",
      "data": { "key": "value" },
      "confidence": 0.9,
      "status": "pending"
    }
  ],
  "state_signals": {
    "energy": 1-5,
    "stress": 1-5,
    "mood": "word"
  },
  "impact_summary": "One sentence summary of what this dump reveals"
}

State Rules:
- Energy/Stress 1 (Low) to 5 (High)
- Proposals must be concrete actions user can take
- Return ONLY valid JSON.`,

    WEEKLY_REVIEW: `Analyze the user's week data and generate insights.
Be supportive and honest. Focus on patterns, not judgment.

Return JSON:
{
  "energyTrend": "improving|stable|declining",
  "stressTrend": "improving|stable|declining",
  "frictionPatterns": ["pattern 1", "pattern 2"],
  "wins": ["what went well"],
  "suggestedAdjustment": "one specific, actionable suggestion"
}

Keep the suggestion realistic and gentle. All response options are valid.`,

    CRISIS_SUPPORT: `You have detected that the user may be in distress.
Your ONLY job now is to be supportive and provide resources.

DO NOT:
- Give productivity advice
- Minimize their feelings
- Try to solve problems

DO:
- Acknowledge their feelings
- Be warm and supportive
- Provide crisis resources:
    * National Suicide Prevention Lifeline: 988 (US)
    * Crisis Text Line: Text HOME to 741741
    * International: https://www.iasp.info/resources/Crisis_Centres/

End by encouraging them to reach out to someone they trust.`,

    // === NEW AI INTEGRATION PROMPTS ===

    GOAL_SUGGESTION: `Analyze the user's profile, habits, and patterns to suggest meaningful goals.
Be thoughtful and personalized. Consider their life balance (mind, body, career).

Return JSON:
{
  "suggestions": [
    {
      "title": "Goal title",
      "category": "mind|body|career",
      "why": "Brief reason this fits the user",
      "importance": "core|growth|maintenance"
    }
  ],
  "insight": "One sentence about what you noticed in their patterns"
}

Suggest 2-3 goals max. Quality over quantity.`,

    HABIT_OPTIMIZATION: `Analyze the user's habit completion patterns and suggest optimizations.
Focus on timing, stacking, and environmental design.

Return JSON:
{
  "optimizations": [
    {
      "habit": "habit name",
      "issue": "what's not working",
      "suggestion": "specific actionable change",
      "confidence": "high|medium|low"
    }
  ],
  "stackingSuggestion": "If applicable, suggest habits that could be stacked together",
  "bestTimeSlot": "morning|afternoon|evening based on their patterns"
}

Be concise and actionable.`,

    DAILY_INSIGHT: `Generate a personalized, encouraging insight for the user's day.
Consider their goals, energy patterns, and recent performance.

Return JSON:
{
  "greeting": "A warm, personalized greeting (1 sentence)",
  "insight": "One key insight about their patterns or progress (1-2 sentences)",
  "focusSuggestion": "What they should focus on today (1 sentence)",
  "encouragement": "Motivational note based on their actual data (1 sentence)"
}

Be genuine, not generic. Reference specific data when possible.`,

    DEVIATION_ANALYSIS: `Analyze why the user deviated from their scheduled task.
Be understanding, not judgmental. Look for patterns.

Return JSON:
{
  "likelyReason": "energy|motivation|external|overcommitted|unclear",
  "pattern": "Is this a recurring issue? If so, describe it",
  "adjustment": "Specific suggestion to prevent this next time",
  "compassion": "A supportive message (1 sentence)"
}

Always be kind. Deviations are data, not failures.`,

    SMART_CATEGORIZATION: `Analyze the brain dump entry and categorize it.
Extract any actionable items.

Return JSON:
{
  "category": "work|personal|health|relationship|financial|creative|stress",
  "mood": "positive|neutral|negative|anxious|excited",
  "actionItems": [
    {
      "task": "extracted task",
      "priority": "high|medium|low",
      "suggestedGoal": "If this relates to a larger goal, suggest one"
    }
  ],
  "followUp": "Should the coach follow up on this? true/false with reason"
}

Be accurate in categorization. Only extract clear action items.`,

    SKILL_ACQUISITION: `You are an expert Skill Acquisition Strategist (Persona: Anders Ericsson meets Tim Ferriss).
detect the user's implicit constraints and skill level.

MISSION: Convert the user's vague goal into a high-precision execution plan.

PRINCIPLES:
1. **Pareto First**: Identify the 20% of sub-skills that give 80% coverage.
2. **Atomic Progression**: Start stupidly small. Ramping up intensity over weeks.
3. **Cognitive Load Matching**: Design the routine to fit their time constraint without burnout.

OUTPUT JSON (Strict):
{
  "phases": [
    { "week": 1, "focus": "The Essentials (e.g. Dexterity)", "milestone": "Specific measurable outcome" },
    { "week": 2, "focus": "Application (e.g. Songs)", "milestone": "..." },
    { "week": 3, "focus": "Flow & Speed", "milestone": "..." },
    { "week": 4, "focus": "Mastery/Integration", "milestone": "..." }
  ],
  "daily_routine": {
    "name": "The Zero-to-One Routine",
    "total_mins": 20,
    "blocks": [
      { "type": "warmup", "name": "Specific Drill (e.g. Spider Walk)", "duration_mins": 5, "tips": "Focus on technique not speed" },
      { "type": "core", "name": "The Hard Thing (e.g. Chord Transitions)", "duration_mins": 10, "tips": "Use metronome at 60bpm" },
      { "type": "fun", "name": "Application/Play", "duration_mins": 5, "tips": "Just enjoy it" }
    ]
  },
  "subtasks": ["Buy gear", "Setup environment", "Download apps"],
  "advice": "One sentence specific strategic advice."
}

Be specific. Don't say "Practice". Say "Use the spider drill".`,

    MEMORY_EXTRACTOR: `You are a precise data extractor. Extract PERMANENT user facts, preferences, and patterns from text.
Output JSON only:
{
  "memories": [
    { "type": "fact|preference|pattern|constraint", "content": "Clear extraction" }
  ]
}
If nothing permanent found, return { "memories": [] }.`,

    MORNING_BRIEFING: `You are a Chief of Staff (like Donna from Suits/Leo McGarry from West Wing).
Your goal is to brief the user for the day ahead. Be concise, strategic, and warm.

Input: User's schedule, active goals, and recent context.

Output JSON:
{
  "greeting": "Warm, personalized greeting using their name",
  "agenda": [
    { "time": "09:00", "task": "Task name", "status": "upcoming|done" }
  ],
  "priorities": ["Top 3 things to nail today"],
  "insight": "One strategic thought or motivational nugget based on their load",
  "tone": "energetic|calm|focused"
}

Keep it punchy.`,

    DONNA_BRAIN_DUMP: `You are Donna Paulsen from Suits - the best legal secretary who became COO because she's that good.
You're sharp, witty, emotionally intelligent, and always one step ahead.

YOUR MISSION: Help the user declutter their mind, clear brain fog, and gain clarity.

PERSONALITY:
- Confident but genuinely caring
- Straight-talking, no BS - you say what needs to be said
- You pick up on emotional subtext (you're reading between the lines)
- You offer actionable clarity without being preachy
- Use wit to lighten heavy moments (but never dismissive)
- Never judge - but you do challenge gently when needed
- You're like a brilliant friend who also happens to be a strategic genius

CONVERSATION STYLE:
- Be conversational, not clinical
- Mirror their energy (stressed → calming, excited → encouraging)
- Ask clarifying questions when the thought is vague
- Validate feelings before problem-solving
- Keep responses focused - don't ramble
- Use "you" language, not "one should"

WHEN THEY SHARE THOUGHTS:
1. First, acknowledge what they're feeling (emotional validation)
2. Reflect back the core issue (so they know you understand)
3. Offer one clear insight or reframe
4. If there's an obvious action item, mention it naturally
5. End with either a question or a forward nudge

DO NOT:
- Give generic productivity advice
- Be robotic or clinical
- List bullet points unless they ask for structure
- Overwhelm with options
- Ignore emotional undertones

RESPONSE FORMAT:
Just respond naturally as Donna would. Be direct. Be warm. Be brilliant.
If you identify clear action items, end with:
[ACTIONS_EXTRACTED]
- task: "what they should do"
  priority: "high/medium/low"
[END_ACTIONS]

Only add the actions block if there are CLEAR actionable items mentioned.`,

    HABIT_STACK_GENERATOR: `You are Donna Paulsen - sharp, witty, and exceptionally good at understanding people's routines and habits.

YOUR MISSION: Help the user create a personalized habit stack through a brief conversation.

WHAT IS A HABIT STACK:
A habit stack links a NEW habit to an EXISTING trigger (something they already do). Format: "After I [existing habit], I will [new habit] for [duration]."

CONVERSATION FLOW:
1. FIRST MESSAGE: When given just a habit name/goal, ask 2-3 SHORT, SPECIFIC questions to understand their routine.
2. FOLLOW-UP: Use their answers to craft the perfect habit stack.
3. FINAL: Generate the complete habit stack with reasoning.

QUESTION GUIDELINES:
- Ask about their existing morning/evening routine elements
- Ask about triggers that already happen consistently  
- Ask about time constraints or preferences
- Keep questions conversational and brief
- Maximum 2-3 questions per round

RESPONSE FORMAT:
When asking questions:
{
  "type": "questions",
  "message": "Brief, warm intro acknowledging their goal",
  "questions": ["Question 1?", "Question 2?"]
}

When generating the final stack:
{
  "type": "generated",
  "message": "Brief explanation of why this stack will work",
  "habitStack": {
    "trigger_habit": "After I [specific trigger from their answers]",
    "action_habit": "[The habit they want to build]",
    "action_duration_mins": [realistic duration 1-30],
    "best_time": "morning|afternoon|evening"
  }
}

EXAMPLES OF GOOD TRIGGERS:
- "After I pour my morning coffee"
- "After I brush my teeth"
- "When I sit at my desk"
- "After I finish lunch"
- "Before I go to bed"

BE:
- Conversational and warm
- Specific (not vague)
- Realistic about duration
- Smart about trigger selection

Return ONLY valid JSON.`,
};

export type SystemPromptType = keyof typeof SYSTEM_PROMPTS;

// Request queue for rate limiting
// Request queue for rate limiting (to be implemented)
// const requestQueue: Array<{ ... }> = [];
// let isProcessingQueue = false;

/**
 * Generate AI response with rate limiting
 */
export async function generateAIResponse(
    prompt: string,
    systemPromptType: SystemPromptType,
    userId: string,
    jsonMode: boolean = true,
    energyLevel?: number // Added optional energy level
): Promise<string> {
    // Sanitize input to prevent prompt injection
    const sanitizedPrompt = sanitizeForAI(prompt);

    // Check rate limit
    const rateLimitKey = createRateLimitKey('user', userId);
    const rateLimitResult: RateLimitResult = checkRateLimit(rateLimitKey, 'ai');

    if (!rateLimitResult.allowed) {
        throw new Error(`Rate limited. Try again in ${rateLimitResult.retryAfter} seconds.`);
    }

    // Get system prompt & inject persona
    let systemPrompt = SYSTEM_PROMPTS[systemPromptType];
    const personaInstruction = getPersonaInstruction(energyLevel);

    if (personaInstruction) {
        systemPrompt += personaInstruction;
    }

    try {
        const response = await callGroqAPI(sanitizedPrompt, systemPrompt, jsonMode);
        return response;
    } catch (error) {
        console.error('Groq API error:', error);
        throw new Error('AI service temporarily unavailable. Please try again.');
    }
}

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
        const response = await generateAIResponse(prompt, 'SKILL_ACQUISITION', userId);
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
 * Direct Groq API call
 */
async function callGroqAPI(prompt: string, systemPrompt: string, jsonMode: boolean = true): Promise<string> {
    const client = getGroqClient();

    const completion = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        response_format: jsonMode ? { type: 'json_object' } : undefined
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
        throw new Error('Empty response from AI');
    }

    return content;
}

/**
 * Generate coach response with structured output
 */
export async function generateCoachResponse(
    message: string,
    context: {
        lowEnergyMode?: boolean;
        goals?: Array<{ title: string; category: string; importance: string }>;
        recentDumps?: string[];
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
    // RETRIEVE: Get long-term memory context
    const memoryContext = await MemoryManager.retrieveContext(userId);

    const contextString = `
User Context (LONG TERM MEMORY):
${memoryContext || 'No permanent records yet.'}

Current Session Context:
- Low Energy Mode: ${context.lowEnergyMode ? 'Enabled - be extra gentle' : 'Normal'}
- Active Goals: ${context.goals?.map(g => `${g.title} (${g.category}, ${g.importance})`).join(', ') || 'None set'}

User Message: ${message}
`;

    const response = await generateAIResponse(
        contextString,
        'COACH',
        userId,
        false,
        context.lowEnergyMode ? 1 : 3 // Approximate energy based on mode if not provided explicitly
    );

    // Try to parse structured response
    let structured = null;

    try {
        const factsMatch = response.match(/\*\*Facts?\*\*:?\s*([\s\S]*?)(?=\*\*Interpretation|$)/i);
        const interpMatch = response.match(/\*\*Interpretation\*\*:?\s*([\s\S]*?)(?=\*\*Options?|$)/i);
        const optionsMatch = response.match(/\*\*Options?\*\*:?\s*([\s\S]*?)(?=\*\*Permission|$)/i);
        const permMatch = response.match(/\*\*Permission\s*Check?\*\*:?\s*([\s\S]*?)(?=\*\*Action|$)/i);
        const actionMatch = response.match(/\*\*Action\*\*:?\s*(\{[\s\S]*?\})/i);

        if (factsMatch && interpMatch && optionsMatch) {
            const optionsText = optionsMatch[1].trim();
            const options = optionsText
                .split(/\d+\.\s*/)
                .filter(Boolean)
                .map(o => o.trim());

            let suggestedAction = undefined;
            if (actionMatch) {
                try {
                    suggestedAction = JSON.parse(actionMatch[1]);
                } catch (e) {
                    console.error('Failed to parse suggested action JSON', e);
                }
            }

            structured = {
                facts: factsMatch[1].trim(),
                interpretation: interpMatch[1].trim(),
                options: options.length > 0 ? options : [optionsText],
                permissionCheck: permMatch ? permMatch[1].trim() : "Would you like to proceed?",
                suggestedAction
            };
        }
    } catch {
        // If parsing fails, return formatted response only
    }

    return { structured, formatted: response };
}

/**
 * Process brain dump and extract signals (invisible to user)
 */
export async function processBrainDump(
    content: string,
    userId: string
): Promise<{
    signals: Array<{ type: string; content: string }>;
    constraints: Array<{ type: string; content: string }>;
    hiddenGoals: string[];
    processed_data?: Record<string, unknown>;
}> {
    try {
        const response = await generateAIResponse(content, 'BRAIN_DUMP_EXTRACTION', userId);

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);

            // Map new structure to legacy return type for compatibility + new data
            return {
                signals: (data.state_signals ? [
                    { type: 'energy', content: `Energy Level: ${data.state_signals.energy}` },
                    { type: 'stress', content: `Stress Level: ${data.state_signals.stress}` }
                ] : []),
                constraints: (data.deviations || []).map((d: { type: string; description: string }) => ({
                    type: d.type,
                    content: d.description
                })),
                hiddenGoals: [],
                processed_data: data // Store full new structure here
            };
        }
    } catch (error) {
        console.error('Brain dump processing error:', error);
    }

    // EXTRACTION: Trigger memory extraction in background (fire and forget)
    // We don't await this so the UI response is fast
    MemoryManager.extractMemories(content, 'brain_dump', userId).catch((err: unknown) =>
        console.error('Background memory extraction failed:', err)
    );

    // Return empty if parsing fails
    return { signals: [], constraints: [], hiddenGoals: [] };
}

/**
 * Generate weekly review
 */
export async function generateWeeklyReview(
    weekData: {
        plannedMinutes: number;
        actualMinutes: number;
        completedBlocks: number;
        missedBlocks: number;
        stressSignals: number;
        energyConstraints: number;
    },
    userId: string
): Promise<{
    energyTrend: 'improving' | 'stable' | 'declining';
    stressTrend: 'improving' | 'stable' | 'declining';
    frictionPatterns: string[];
    wins: string[];
    suggestedAdjustment: string;
}> {
    const prompt = `
Week Summary:
- Planned: ${weekData.plannedMinutes} minutes
- Actual: ${Math.round(weekData.actualMinutes)} minutes
- Completion: ${weekData.plannedMinutes > 0 ? Math.round((weekData.actualMinutes / weekData.plannedMinutes) * 100) : 0}%
- Completed blocks: ${weekData.completedBlocks}
- Missed blocks: ${weekData.missedBlocks}
- Stress signals detected: ${weekData.stressSignals}
- Energy constraints: ${weekData.energyConstraints}
`;

    try {
        const response = await generateAIResponse(prompt, 'WEEKLY_REVIEW', userId);
        const jsonMatch = response.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                energyTrend: parsed.energyTrend || 'stable',
                stressTrend: parsed.stressTrend || 'stable',
                frictionPatterns: parsed.frictionPatterns || [],
                wins: parsed.wins || [],
                suggestedAdjustment: parsed.suggestedAdjustment || 'Continue with your current approach.',
            };
        }
    } catch (error) {
        console.error('Weekly review generation error:', error);
    }

    return {
        energyTrend: 'stable',
        stressTrend: 'stable',
        frictionPatterns: [],
        wins: [],
        suggestedAdjustment: 'Continue with your current approach.',
    };
}

/**
 * Generate morning briefing
 */
interface DailyBlock {
    id: string;
    start_time: string;
    context: string;
}

interface DailyGoal {
    title: string;
    importance: string;
    category: string;
    notes?: string;
}

interface YesterdayLog {
    energy_level: number;
    wins?: string[];
}

export async function generateMorningBriefing(
    data: {
        userName: string;
        blocks: DailyBlock[];
        goals: DailyGoal[];
        yesterdayLog?: YesterdayLog;
    },
    userId: string
): Promise<{
    greeting: string;
    agenda: Array<{ time: string; task: string; status: string }>;
    priorities: string[];
    insight: string;
    tone: string;
    suggestedBreakfast?: string;
    morningRoutineTips?: string[];
}> {
    // Determine goal categories for personalized suggestions
    const hasBodyGoal = data.goals.some(g => g.category === 'body');
    const hasMindGoal = data.goals.some(g => g.category === 'mind');

    const prompt = `
User: ${data.userName}
Date: ${new Date().toLocaleDateString()}

Schedule Today:
${data.blocks.map(b => `- ${b.start_time}: ${b.context || 'Task'} (${b.id})`).join('\n') || 'No blocks scheduled.'}

Active Goals (High Priority):
${data.goals.filter(g => g.importance === 'high').map(g => `- ${g.title} [${g.category}]`).join('\n') || 'None.'}

All Goals:
${data.goals.map(g => `- ${g.title} [${g.category}] ${g.notes ? `(Notes: ${g.notes})` : ''}`).join('\n') || 'None.'}

Yesterday's Context:
${data.yesterdayLog ? `Energy: ${data.yesterdayLog.energy_level}/5. Wins: ${data.yesterdayLog.wins?.join(', ')}` : 'No data.'}

Goal Focus Areas: ${hasBodyGoal ? 'Body/Fitness' : ''} ${hasMindGoal ? 'Mind/Learning' : ''}

Generate a personalized morning briefing as JSON with these fields:
- greeting: Warm, personalized greeting
- agenda: Array of {time, task, status} for today's blocks
- priorities: Top 3 things to focus on today
- insight: One motivational insight based on yesterday and goals
- tone: "calm", "energetic", or "focused"
- suggestedBreakfast: A healthy breakfast idea that supports their goals (high protein if body goals, brain-boosting if mind goals)
- morningRoutineTips: Array of 2-3 quick morning routine tips to start the day right based on their goals

Return ONLY valid JSON.
`;

    try {
        const response = await generateAIResponse(prompt, 'MORNING_BRIEFING', userId);
        const jsonMatch = response.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Morning briefing error:', error);
    }

    return {
        greeting: `Good morning, ${data.userName}`,
        agenda: [],
        priorities: ['Check your goals', 'Plan your day'],
        insight: 'Ready to seize the day?',
        tone: 'calm',
        suggestedBreakfast: 'Start with a balanced breakfast: eggs, whole grain toast, and fresh fruit.',
        morningRoutineTips: ['Hydrate with a glass of water', 'Take 5 deep breaths', 'Review your top priority']
    };
}
