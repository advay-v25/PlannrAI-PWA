import { callAI } from '@/lib/ai/unified-client';

export enum CoachIntent {
    // ===== SCHEDULING INTENTS =====
    BUSY_AT_TIME = 'busy_at_time',           // "I'm busy at 4pm"
    MOVE_BLOCK = 'move_block',               // "Move my gym to evening"
    ADD_TASK = 'add_task',                   // "Remind me to buy milk"
    COMPLETE_TASK = 'complete_task',         // "Mark buy milk as done"
    DELETE_TASK = 'delete_task',             // "Remove buy milk from my list"
    DELETE_BLOCK = 'delete_block',           // "Cancel my reading session"
    RESCHEDULE_DAY = 'reschedule_day',       // "Reorganize today"
    RESCHEDULE_WEEK = 'reschedule_week',     // "Replan my week"

    // ===== ENERGY/STATE INTENTS =====
    ENERGY_LOW = 'energy_low',               // "I'm exhausted"
    ENERGY_HIGH = 'energy_high',             // "I'm feeling great"
    OVERWHELMED = 'overwhelmed',             // "I can't handle this"
    BORED = 'bored',                         // "I have nothing to do"

    // ===== GOAL INTENTS =====
    ADJUST_GOAL = 'adjust_goal',             // "Reduce my reading goal"
    PAUSE_GOAL = 'pause_goal',               // "Pause gym for this week"
    GOAL_PROGRESS = 'goal_progress',         // "How am I doing on my goals?"

    // ===== INFORMATION INTENTS =====
    WHAT_NEXT = 'what_next',                 // "What should I do now?"
    EXPLAIN_SCHEDULE = 'explain_schedule',   // "Why is my schedule so intense?"
    PROGRESS_CHECK = 'progress_check',       // "How's my week going?"

    // ===== STRATEGIC INTENTS =====
    DEEP_WORK_OPTIMIZE = 'deep_work_optimize', // "Protect my focus today"
    ENERGY_OFFSET = 'energy_offset',       // "I'm tired, move deep work to tomorrow"
    MINIMAL_OS = 'minimal_os',             // "Clear everything but the essentials"

    // ===== CLARIFICATION/META INTENTS =====
    CLARIFICATION_NEEDED = 'clarification_needed', // Ambiguous input
    UNDO_LAST = 'undo_last',                 // "Undo that change"
    GENERAL_CHAT = 'general_chat',           // Off-topic / venting
    OUT_OF_SCOPE = 'out_of_scope',          // Not Coach's domain
}

export interface IntentClassification {
    primary_intent: CoachIntent;
    secondary_intent?: CoachIntent | null;  // For multi-intent messages
    confidence: number;               // 0.0 to 1.0
    entities: {
        time?: string;                  // "4pm", "16:00", "tomorrow at 2"
        date?: string;                  // "tomorrow", "monday", "2024-01-15"
        duration?: string;              // "30 min", "1 hour"
        block_reference?: string;       // "gym", "reading", "work"
        intensity?: string;             // "lighter", "harder", "normal"
        pillar?: 'mind' | 'body' | 'craft';
        goal_reference?: string;        // "reading goal", "gym sessions"
        task_reference?: string;        // "buy milk", "email John"
    };
    extracted_constraint?: {
        type: 'busy' | 'available' | 'preferred';
        start_time: string;
        end_time: string;
        date: string;
    };
    requires_clarification: boolean;
    clarification_question?: string | null;
}

export const INTENT_EXAMPLES = {
    [CoachIntent.BUSY_AT_TIME]: [
        "I'm busy at 4pm",
        "I have a meeting tomorrow at 2pm",
        "Blocked from 3-5pm today",
        "Can't do anything between 10am and noon",
        "Doctor appointment Friday at 9am",
    ],

    [CoachIntent.MOVE_BLOCK]: [
        "Move my gym to evening",
        "Reschedule reading to tomorrow",
        "Can we do deep work in the morning instead?",
        "Push my workout to 6pm",
        "Shift everything 2 hours later",
    ],

    [CoachIntent.ADD_TASK]: [
        "Add grocery shopping to my list",
        "Remind me to email John",
        "I need to buy milk",
        "Add a task to pay bills",
        "Put finish report on my todo list",
    ],

    [CoachIntent.COMPLETE_TASK]: [
        "Mark buy milk as done",
        "I finished the report task",
        "Check off grocery shopping",
        "Set email John to complete",
    ],

    [CoachIntent.DELETE_TASK]: [
        "Remove buy milk from my list",
        "Delete the pay bills task",
        "I don't need to do grocery shopping anymore",
    ],

    [CoachIntent.DELETE_BLOCK]: [
        "Cancel my gym today",
        "Remove reading session",
        "I can't do the workout tomorrow",
        "Delete all my Friday blocks",
        "Skip today's deep work",
    ],

    [CoachIntent.RESCHEDULE_DAY]: [
        "Reorganize today",
        "Replan my afternoon",
        "Fix today's schedule",
        "Optimize today",
        "I need a different plan for today",
    ],

    [CoachIntent.RESCHEDULE_WEEK]: [
        "Replan my week",
        "Reorganize this week",
        "Can you fix my week?",
        "I need a new weekly schedule",
        "Start over with this week",
    ],

    [CoachIntent.ENERGY_LOW]: [
        "I'm exhausted",
        "Too tired to do this",
        "I'm burned out",
        "No energy today",
        "I can't handle this schedule",
    ],

    [CoachIntent.ENERGY_HIGH]: [
        "I'm feeling great!",
        "I have so much energy",
        "I'm pumped today",
        "Let's add more work",
        "I can handle more",
    ],

    [CoachIntent.OVERWHELMED]: [
        "I'm overwhelmed",
        "This is too much",
        "I can't do all this",
        "Too many things to do",
        "I'm drowning in tasks",
    ],

    [CoachIntent.BORED]: [
        "I'm bored",
        "I have nothing to do",
        "I need more challenges",
        "This is too easy",
        "I have too much free time",
    ],

    [CoachIntent.ADJUST_GOAL]: [
        "Reduce my reading goal",
        "I need less gym time",
        "Can we make the craft goal bigger?",
        "Change my weekly target",
        "I want to do more Mind work",
    ],

    [CoachIntent.PAUSE_GOAL]: [
        "Pause gym for this week",
        "Stop scheduling reading",
        "I can't work on craft right now",
        "Put this goal on hold",
        "Disable body goals temporarily",
    ],

    [CoachIntent.GOAL_PROGRESS]: [
        "How am I doing on my goals?",
        "Am I on track?",
        "Show me my progress",
        "How's my week looking?",
        "Did I hit my targets?",
    ],

    [CoachIntent.WHAT_NEXT]: [
        "What should I do now?",
        "What's next?",
        "What am I supposed to be doing?",
        "What's on my schedule?",
        "Tell me what to focus on",
    ],

    [CoachIntent.EXPLAIN_SCHEDULE]: [
        "Why is my schedule so intense?",
        "Why do I have so much work today?",
        "Explain my week",
        "Why is Friday so light?",
        "How did you plan this?",
    ],

    [CoachIntent.PROGRESS_CHECK]: [
        "How's my week going?",
        "Am I ahead or behind?",
        "What's my completion rate?",
        "How many blocks did I finish?",
        "Show me my stats",
    ],

    [CoachIntent.UNDO_LAST]: [
        "Undo that",
        "Go back",
        "Cancel that change",
        "Revert",
        "I changed my mind",
    ],

    [CoachIntent.GENERAL_CHAT]: [
        "I hate Mondays",
        "This sucks",
        "I'm so stressed",
        "Everything is going wrong",
        "I feel terrible",
    ],

    [CoachIntent.DEEP_WORK_OPTIMIZE]: [
        "Protect my focus today",
        "Make sure I have deep work during my peak energy",
        "Strategic focus for this morning",
        "Clear distractions for the next 3 hours",
        "Arrange my week for Craft pillar priority",
    ],

    [CoachIntent.ENERGY_OFFSET]: [
        "I'm slumped, move my hard tasks later",
        "Shift focus work to my peak energy phase",
        "Too tired for deep work, give me something light",
        "Move my meeting because I'm drained",
    ],

    [CoachIntent.MINIMAL_OS]: [
        "Clear everything but the essentials",
        "Wipe my day except for fixed meetings",
        "I'm overwhelmed, just show me the must-dos",
        "Minimalist schedule for today",
    ],

    [CoachIntent.OUT_OF_SCOPE]: [
        "What's the weather?",
        "Tell me a joke",
        "How do I fix my car?",
        "What should I eat for dinner?",
        "Can you help with my taxes?",
    ],
};

export function buildIntentClassificationPrompt(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userContext: {
        current_time: string;
        today_blocks: any[];
        goals: any[];
        recent_energy?: string;
    }
): string {
    return `
You are PlannrAI's intent classifier. Analyze the user's message and classify their intent.

CONVERSATION HISTORY (last 3 messages):
${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\\n')}

CURRENT USER MESSAGE:
"${userMessage}"

USER CONTEXT:
- Current time: ${userContext.current_time || 'unknown'}
- Today's remaining blocks: ${userContext.today_blocks?.length || 0}
- Active goals: ${userContext.goals?.map(g => g.title).join(', ') || 'none'}
- Recent energy: ${userContext.recent_energy || 'unknown'}

INTENT CATEGORIES:
${Object.values(CoachIntent).map(intent => `- ${intent}`).join('\n')}

EXAMPLES:
${Object.entries(INTENT_EXAMPLES).slice(0, 10).map(([intent, examples]) =>
        `${intent}: ${examples.slice(0, 2).join(', ')}`
    ).join('\n')}

CLASSIFICATION RULES:
1. Choose the PRIMARY intent that best matches.
2. STRATEGIC BIAS: If the user mentions "focus", "peak", "energy", or "strategy", prioritize DEEP_WORK_OPTIMIZE or ENERGY_OFFSET.
3. If message contains 2 clear intents, identify SECONDARY intent.
4. If message is ambiguous, set primary_intent to "clarification_needed".
5. Extract entities: times, dates, durations, block/goal references.
6. Identify if the request asks for "Silent Intelligence" (proactive management) vs simple manual commands.

SPECIAL CASES:
- If "Protect my focus" -> DEEP_WORK_OPTIMIZE
- If "Too tired for X" -> ENERGY_OFFSET
- If "I'm busy at [time]" → BUSY_AT_TIME + extract constraint
- If "Move X to Y" → MOVE_BLOCK + extract entities
- If "Mark X as done" (referring to a task) → COMPLETE_TASK
- If "Add X" (without a specific time duration) → ADD_TASK (to-do list)
- If "Schedule X" (with a time duration) → MOVE_BLOCK or create a new block.
- If emotional venting without action request → GENERAL_CHAT

OUTPUT (valid JSON only):
{
  "primary_intent": "busy_at_time",
  "secondary_intent": null,
  "confidence": 0.95,
  "entities": {
    "time": "4pm",
    "date": "today"
  },
  "extracted_constraint": {
    "type": "busy",
    "start_time": "16:00",
    "end_time": "17:00",
    "date": "2024-01-15"
  },
  "requires_clarification": false,
  "clarification_question": null
}

If clarification needed:
{
  "primary_intent": "clarification_needed",
  "confidence": 0.4,
  "entities": {},
  "requires_clarification": true,
  "clarification_question": "I'm not sure what you want to move. Could you be more specific?"
}
`;
}

// Quick pattern matching for obvious cases
function quickIntentMatch(message: string): IntentClassification | null {
    const lower = message.toLowerCase();

    // Busy at time pattern
    const busyMatch = lower.match(/busy.*(at|from|between).*(\d{1,2}(:\d{2})?\s*(am|pm)?)/i);
    if (busyMatch) {
        return {
            primary_intent: CoachIntent.BUSY_AT_TIME,
            confidence: 0.95,
            entities: { time: busyMatch[2] },
            requires_clarification: false,
        };
    }

    // Exhausted/tired
    if (/(exhausted|tired|burned out|drained|no energy)/i.test(lower)) {
        return {
            primary_intent: CoachIntent.ENERGY_LOW,
            confidence: 0.9,
            entities: {},
            requires_clarification: false,
        };
    }

    // Overwhelmed
    if (/(overwhelmed|too much|can't handle|drowning)/i.test(lower)) {
        return {
            primary_intent: CoachIntent.OVERWHELMED,
            confidence: 0.9,
            entities: {},
            requires_clarification: false,
        };
    }

    // Bored
    if (/(bored|nothing to do|too much free time|too easy)/i.test(lower)) {
        return {
            primary_intent: CoachIntent.BORED,
            confidence: 0.95,
            entities: {},
            requires_clarification: false,
        };
    }

    // What next
    if (/(what.*next|what.*should.*do|what.*now)/i.test(lower)) {
        return {
            primary_intent: CoachIntent.WHAT_NEXT,
            confidence: 0.9,
            entities: {},
            requires_clarification: false,
        };
    }

    // Undo
    if (/(undo|go back|revert|cancel that|changed.*mind)/i.test(lower)) {
        return {
            primary_intent: CoachIntent.UNDO_LAST,
            confidence: 0.95,
            entities: {},
            requires_clarification: false,
        };
    }

    return null;
}

export async function classifyIntent(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userContext: any
): Promise<IntentClassification> {

    // Quick pattern matching for obvious cases (fast path)
    const quickMatch = quickIntentMatch(userMessage);
    if (quickMatch && quickMatch.confidence >= 0.9) {
        return quickMatch;
    }

    // AI classification for complex cases
    const prompt = buildIntentClassificationPrompt(
        userMessage,
        conversationHistory,
        userContext
    );

    const response = await callAI<IntentClassification>({
        prompt,
        systemPrompt: 'You are an intent classifier. Always return valid JSON matching the IntentClassification schema.',
        model: 'fast', // Use Groq for speed
        temperature: 0.3, // Low temperature for consistent classification
        maxTokens: 500,
        requireJSON: true,
        timeout: 5000, // 5 second timeout
    });

    if (!response.success || !response.data) {
        // Fallback: treat as clarification needed
        return {
            primary_intent: CoachIntent.CLARIFICATION_NEEDED,
            confidence: 0,
            entities: {},
            requires_clarification: true,
            clarification_question: "I didn't quite understand that. Could you rephrase?",
        };
    }

    return response.data;
}
