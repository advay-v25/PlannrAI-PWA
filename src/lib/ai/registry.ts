import { z } from 'zod';
import { PatchSchema, OnboardingArchitectSchema, DayOptimizationSchema, RoutineGenerationSchema, CalendarPlanWeekSchema, ConflictResolutionSchema } from './schemas';

// --- Shared Types ---
export type AIContext = Record<string, any>;
export type AILimits = {
  max_options?: number;
  low_energy?: boolean;
  overwhelmed?: boolean;
};

// --- Per-Channel Output Schemas (Locally Defined) ---

// 1. Coach — Super Intelligence Performance Coach
export const CoachOutputSchema = z.object({
  mode: z.enum(['execute', 'propose', 'ask', 'refuse']),
  thinking: z.array(z.string().max(100)).max(4).optional().describe('Reasoning chain — show your work'),
  summary: z.string().max(300),
  message: z.string().optional(),
  context_used: z.array(z.string().max(40)).max(4).optional().describe('What data points you actually used'),
  options: z.array(z.object({
    id: z.string(),
    title: z.string().max(40),
    impact: z.string().max(80),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    time_impact_mins: z.number().optional().describe('Net minutes freed or used'),
    patch: PatchSchema
  })).max(3).optional(),
  question: z.object({
    prompt: z.string().max(160),
    type: z.enum(['text', 'confirm', 'choice']),
    choices: z.array(z.string()).max(5).optional()
  }).optional(),
  refusal: z.object({
    reason: z.string().max(160),
    next_best: z.string().max(100).optional()
  }).optional(),
  suggested_actions: z.array(z.string().max(50)).max(3).optional().describe('Context-aware follow-up actions the user can take')
});

// 2. Brain Dump
export const BrainDumpOutputSchema = z.object({
  extracted: z.object({
    summary: z.string().max(200).optional(),
    items: z.array(z.object({
      title: z.string(),
      kind: z.enum(['task', 'commitment', 'note', 'worry', 'idea', 'habit', 'constraint']),
      est_min: z.number().optional(),
      due_date: z.string().optional(),
      urgency: z.number().min(1).max(5).optional(),
      importance: z.number().min(1).max(5).optional(),
      pillar: z.string().optional()
    })).optional().default([]),
    constraints: z.array(z.object({
      type: z.enum(['time_block', 'deadline', 'unavailable', 'health', 'travel']),
      description: z.string(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      date: z.string().optional()
    })).optional().default([]),
    signals: z.object({
      energy: z.number().min(1).max(5).optional(),
      sentiment: z.number().min(-1).max(1).optional(),
      overwhelm: z.number().min(0).max(1).optional(),
      motivation: z.number().min(0).max(1).optional(),
      stress: z.number().min(0).max(1).optional(),
      health_flag: z.string().optional()
    })
  }),
  mode: z.enum(['execute', 'propose', 'ask']),
  summary: z.string().max(120),
  options: z.array(z.object({
    id: z.string(),
    title: z.string().max(40),
    impact: z.string().max(80),
    patch: PatchSchema
  })).min(1).max(3),
  question: z.object({
    prompt: z.string().max(160),
    type: z.enum(['text', 'confirm', 'choice']),
    choices: z.array(z.string()).max(5).optional()
  }).optional()
});

// 3. Onboarding Plan
export const OnboardingPlanOutputSchema = z.object({
  patch: PatchSchema,
  summary: z.object({
    bullets: z.array(z.string()).max(5)
  }),
  warnings: z.array(z.string()).max(5)
});

// 4. Habit Stack (Simplified — no patch ops, API handles DB persistence)
export const HabitStackOutputSchema = z.object({
  stacks: z.array(z.object({
    name: z.string(),
    steps: z.array(z.object({
      title: z.string(),
      minutes: z.number()
    })),
    schedule_hint: z.object({
      time_of_day: z.enum(['morning', 'afternoon', 'evening'])
    }).optional()
  })),
  donna_note: z.string().max(200).optional()
});

// 5. Goal Strategy (Flat — no PatchSchema)
export const GoalStrategyOutputSchema = z.object({
  strategy_one_liner: z.string().max(120).describe('One sentence summarising the strategy'),
  routine: z.object({
    frequency: z.enum(['daily', 'weekly', '3x_week', '5x_week']),
    duration_mins: z.number().min(5).max(180),
    steps: z.array(z.string().max(80)).min(1).max(6).describe('Ordered action steps'),
    best_time: z.enum(['morning', 'afternoon', 'evening', 'anytime']).optional(),
    notes: z.string().max(200).optional()
  }),
  milestones: z.array(z.string().max(100)).min(2).max(5).describe('Clear checkpoints'),
  checklist: z.array(z.object({ text: z.string().max(100) })).min(1).max(8).describe('Actionable checklist items'),
  donna_note: z.string().max(200).optional().describe('Encouraging note to the user')
});

// 6. Weekly Review
export const WeeklyReviewOutputSchema = z.object({
  reality: z.string().max(300).describe('Narrative summary of what actually happened this week (max 300 chars)'),
  patterns: z.array(z.object({
    title: z.string().max(60),
    evidence: z.string().max(120)
  })).length(3).describe('Exactly 3 behavioral patterns with supporting data'),
  lever: z.object({
    label: z.string().max(80).describe('Short action label (max 80 chars)'),
    patch: PatchSchema
  }).describe('One executable lever that changes the system'),
  note: z.string().max(160).describe('Encouraging closing remark (max 160 chars)')
});

// 7. Goal Decomposition
export const GoalDecompositionSchema = z.object({
  channel: z.literal('goal_decomposition').optional(),
  mode: z.literal('propose').optional(),
  plan: z.object({
    analysis: z.object({
      complexity: z.enum(['low', 'medium', 'high']),
      time_horizon: z.string(),
      resources: z.array(z.string()),
      obstacles: z.array(z.string())
    }),
    milestones: z.array(z.object({
      title: z.string(),
      description: z.string(),
      deadline_offset_days: z.number(),
      tasks: z.array(z.object({
        title: z.string(),
        estimated_minutes: z.number(),
        is_recurring: z.boolean().optional(),
        recurrence: z.string().optional()
      }))
    }))
  }),
  summary: z.string().optional()
});

// 8. Daily Briefing
export const DailyBriefingOutputSchema = z.object({
  briefing: z.string().max(500).describe('Morning briefing message for the user'),
  tone: z.enum(['focused', 'energized', 'gentle', 'urgent']).describe('Tone of the briefing'),
  priorities: z.array(z.string().max(80)).max(3).optional().describe('Top 3 priorities for the day')
});

// 9. Onboarding Insight (micro-AI per step)
export const OnboardingInsightOutputSchema = z.object({
  insight: z.string().max(200).describe('Personalized observation based on the step data'),
  archetype_signal: z.string().max(60).describe('Short badge label e.g. Night Owl Detected, High Performer'),
  donna_note: z.string().max(150).describe('Internal AI observation to build the personality profile'),
  profile_update: z.object({
    chronotype: z.enum(['early_bird', 'night_owl', 'balanced']).optional(),
    productivity_archetype: z.string().max(40).optional(),
    energy_pattern: z.string().max(40).optional(),
    risk_flag: z.string().max(60).optional()
  }).optional()
});

// --- Registry Definition ---

export interface ChannelDef<T = any> {
  schema: z.ZodSchema<T>;
  systemPrompt: (context: AIContext, limits?: AILimits) => string;
  userPrompt: (input: string, context?: AIContext) => string;
  config: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
  minOptions?: number;
  fallback: (input: string, context?: AIContext) => T;
}

const BASE_RULES = `
Rules:
- Output STRICT JSON only. No markdown, no commentary.
- Use only provided context. Do not hallucinate.
`.trim();

export const ChannelRegistry: Record<string, ChannelDef> = {
  coach: {
    schema: CoachOutputSchema,
    config: {
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      maxTokens: 1500
    },
    minOptions: 1,
    fallback: () => ({
      mode: 'propose' as const,
      summary: "Temporary issue. Here are safe options.",
      message: "Temporary issue. Here are safe options.",
      options: [
        {
          id: 'fallback_1',
          title: 'Rebalance Today',
          impact: 'Optimize schedule flow',
          patch: { ops: [], undoable: false, reason: "Fallback optimization" }
        },
        {
          id: 'fallback_2',
          title: 'Push Non-Urgent',
          impact: 'Clear space for now',
          patch: { ops: [], reason: "Fallback clear" }
        }
      ]
    }),
    systemPrompt: (ctx, limits) => {
      const isLowEnergy = limits?.low_energy || ctx.userState?.is_low_energy;
      const isOverwhelmed = limits?.overwhelmed || ctx.userState?.is_overwhelmed;
      const maxOpts = isLowEnergy || isOverwhelmed ? 2 : limits?.max_options ?? 3;

      return `You are DONNA — the user's Chief of Staff and Performance Coach.
You are NOT a generic AI assistant. You are a super-intelligence with FULL ACCESS to this user's life data.
You have their schedule, goals, energy patterns, habits, and behavioral history.
You think like a world-class executive coach + scheduling genius.

PERSONALITY:
- Direct, sharp, no-nonsense. Never sycophantic. Never say "Great question!"
- Pattern-aware: reference specific data points ("You skipped your craft block 3 times this week")
- Proactive: surface problems before asked. Notice gaps. Spot overload.
- Opinionated: recommend the BEST option clearly. Don't hedge.
- Human: brief warmth when earned. "That streak is real. Protect it."
- Quantified: always cite numbers. "That frees 45 min" not "that frees some time."

${BASE_RULES}

CONTEXT (This is YOUR advantage over a normal LLM — USE IT):
Current Time: ${ctx.now}
Schedule (today + upcoming): ${JSON.stringify(ctx.schedule || [])}
Anchors (LOCKED — never move/delete): ${JSON.stringify(ctx.anchors || [])}
Goals: ${JSON.stringify(ctx.goals || [])}
User State: ${JSON.stringify(ctx.userState || {})}
Capacity: ${JSON.stringify(ctx.capacity || {})}
Recent Logs: ${JSON.stringify((ctx.recentLogs || []).slice(0, 2))}
Chat History: ${JSON.stringify((ctx.chatHistory || []).slice(-6))}
${ctx.recentDumps?.length ? `Recent Brain Dumps: ${JSON.stringify(ctx.recentDumps.slice(0, 2))}` : ''}

THINKING (Required):
Before responding, analyze in 2-4 steps. Show your reasoning in the "thinking" array.
Example: ["Checking today's blocks: 6 planned, 2 done", "Energy is low (2/5) — heavy afternoon ahead", "Gap at 14:00-15:30 could be used", "Recommending: lighten PM, move craft to gap"]

CONTEXT_USED (Required):
List 2-4 specific data points you actually used from the context.
Example: ["3 blocks done out of 7 today", "Energy level: 2/5", "Goal 'Learn Piano' has 0 hours this week"]

PROACTIVE INTELLIGENCE:
If the user sends a greeting ("hey", "hi", "what's up", "morning") or their message is vague:
- DON'T just say hello back. Analyze their current state and surface the most important insight.
- Check: Are they behind on any goals? Is today overloaded? Did they miss blocks yesterday? Is there a scheduling conflict?
- Lead with the most actionable observation.

MODES:
- "propose": Default. Return 2-${maxOpts} options with patches. ALWAYS recommend one clearly in summary.
- "execute": Only if user explicitly says "just do it" or similar. Return 1 option, auto-applied.
- "ask": Only if critical info is missing and you CANNOT act without it. Return 1 question, no options.
- "refuse": Only if request is impossible/dangerous. Explain why briefly.

BEHAVIOR RULES:
1. THINK FIRST. Always fill the "thinking" array with your step-by-step reasoning.
2. CITE DATA. Always fill "context_used" with specific data points you referenced.
3. QUANTIFY IMPACT. Every option should have effort level and time_impact_mins when applicable.
4. NEVER override anchors. They are LOCKED.
5. NEVER create overload. Check capacity. Respect sleep/meals/buffers.
6. Every option MUST have a real patch with ops.
7. Use REAL event IDs from context. Never invent fake IDs.
8. End with "suggested_actions" — 2-3 context-aware follow-up actions the user might want next.
${isOverwhelmed || isLowEnergy ? `9. USER IS ${isOverwhelmed ? 'OVERWHELMED' : 'LOW ENERGY'}: Max 2 simple options. Prefer "cut and protect" over "add and optimize". Simpler language.` : ''}

SUGGESTED_ACTIONS:
Generate 2-3 short, context-aware action labels for quick-action chips.
These should be SPECIFIC to the user's current state, not generic.
BAD: "Plan my day", "I'm tired" (too generic)
GOOD: "Move piano practice to evening", "Clear afternoon for deep work", "Check habit streak"

OUTPUT FORMAT (Strict JSON):
{
  "mode": "propose|execute|ask|refuse",
  "thinking": ["step 1", "step 2", "step 3"],
  "summary": "<= 200 chars — direct, actionable, cite numbers",
  "context_used": ["data point 1", "data point 2"],
  "options": [{
    "id": "opt_1",
    "title": "<= 40 chars",
    "impact": "<= 80 chars with numbers",
    "effort": "low|medium|high",
    "time_impact_mins": 45,
    "patch": {
      "ops": [{ "op": "move_event", "event_id": "uuid", "to_start": "HH:MM", "to_end": "HH:MM", "date": "YYYY-MM-DD" }],
      "undoable": true,
      "reason": "short reason"
    }
  }],
  "question": { "prompt": "string", "type": "text|confirm|choice", "choices": ["A", "B"] },
  "refusal": { "reason": "string", "next_best": "string" },
  "suggested_actions": ["specific action 1", "specific action 2"]
}

If mode="propose" or mode="execute", options is REQUIRED.
If mode="ask", question is REQUIRED, options should be omitted.
If mode="refuse", refusal is REQUIRED, options should be omitted.`.trim();
    },
    userPrompt: (input) => input
  },

  brain_dump: {
    schema: BrainDumpOutputSchema,
    config: {
      model: 'llama-3.1-8b-instant', // Lower latency is better here
      temperature: 0.2, // Need structured precision
      maxTokens: 1000
    },
    fallback: (input: string) => ({
      mode: 'propose' as const,
      summary: "Extracted what I could. Choose an action.",
      extracted: {
        summary: "Partial extraction — AI temporarily limited.",
        items: [{ kind: 'note' as const, title: (input || '').slice(0, 50) }],
        constraints: [],
        signals: { overwhelm: 0, sentiment: 0, energy: 3 }
      },
      options: [
        {
          id: 'fallback_1',
          title: 'Save to Inbox',
          impact: 'Items saved for manual review',
          patch: { ops: [], reason: "Fallback save" }
        }
      ]
    }),
    systemPrompt: (ctx) => {
      const isLowEnergy = ctx.userState?.is_low_energy;
      const isOverwhelmed = ctx.userState?.is_overwhelmed;

      return `You are PlannrAI's Chaos Intake Engine.
Your job: convert messy thoughts into STRUCTURED SIGNALS + EXECUTABLE SCHEDULE CHANGES.
You are NOT a chatbot. You are NOT a journal. Every dump MUST produce TANGIBLE OUTCOMES.

${BASE_RULES}

CONTEXT:
Current Time: ${ctx.now}
Schedule (today + upcoming): ${JSON.stringify(ctx.schedule || [])}
Anchors (LOCKED): ${JSON.stringify(ctx.anchors || [])}
Goals: ${JSON.stringify(ctx.goals || [])}
User State: ${JSON.stringify(ctx.userState || {})}
Capacity: ${JSON.stringify(ctx.capacity || {})}
Preferences: ${JSON.stringify(ctx.preferences || {})}
${ctx.recentDumps?.length ? `Recent Dumps: ${JSON.stringify(ctx.recentDumps.slice(0, 2))}` : ''}

EXTRACTION RULES:
A) TASKS: "Buy milk", "Submit assignment" → kind=task, estimate duration, assign urgency/importance (1-5)
B) COMMITMENTS: "I have a meeting at 4" → kind=commitment, extract time → also add to constraints
C) CONSTRAINTS: "busy at 2pm", "can't today", "traveling" → constraints array with type/time
D) SIGNALS: "I'm exhausted" → energy=1. "overwhelmed" → overwhelm=0.9. "fired up" → motivation=0.9
E) HEALTH: "I'm sick", "headache" → health_flag="sick", energy=1-2
F) WORRIES: "stressed about deadline" → kind=worry, stress=0.8
G) NOTES/IDEAS: Everything else → kind=note or kind=idea

OPTION RULES:
- ALWAYS produce 2-3 options with REAL patches that change the schedule.
- Options must use actual event IDs from the schedule context.
- If user reports fatigue/sickness: options MUST reduce intensity (fewer blocks, more buffers, move hard tasks).
- If user adds a NEW must-do: propose placement windows that avoid conflicts with anchors.
- If user reports missed items: propose makeup session or redistribution.
${isOverwhelmed || isLowEnergy ? '- USER IS STRESSED/LOW ENERGY: Max 2 options. Prefer cutting tasks over adding. Protect recovery.' : ''}

ASK RULE:
- You may ask ONE clarifying question ONLY if critical info blocks action (e.g., "Is the meeting today or tomorrow?").
- Otherwise, make your best guess and propose options.

OUTPUT FORMAT (Strict JSON, No Markdown):
{
  "mode": "propose|ask",
  "summary": "<= 120 chars impact summary",
  "extracted": {
    "summary": "<= 200 chars",
    "items": [
      { "kind": "task|commitment|note|worry|idea|habit|constraint", "title": "string", "est_min": 30, "due_date": "today|tomorrow|YYYY-MM-DD", "urgency": 1-5, "importance": 1-5, "pillar": "string" }
    ],
    "constraints": [
      { "type": "time_block|deadline|unavailable|health|travel", "description": "string", "start_time": "HH:MM", "end_time": "HH:MM", "date": "YYYY-MM-DD" }
    ],
    "signals": { "energy": 1-5, "sentiment": -1 to 1, "overwhelm": 0-1, "motivation": 0-1, "stress": 0-1, "health_flag": "string or null" }
  },
  "options": [{
    "id": "opt_1",
    "title": "<= 40 chars",
    "impact": "<= 80 chars",
    "patch": { "ops": [{ "op": "create_event", "payload": { "title": "...", "start_time": "HH:MM", "end_time": "HH:MM", "date": "YYYY-MM-DD", "block_type": "task" } }], "undoable": true, "reason": "string" }
  }],
  "question": { "prompt": "string", "type": "text|confirm|choice", "choices": ["A","B"] }
}

If mode="propose", options is REQUIRED.
If mode="ask", question is REQUIRED, options can be omitted.`.trim();
    },
    userPrompt: (input: string) => `Brain dump:\n${input}`
  },

  onboarding_plan: {
    schema: OnboardingPlanOutputSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.2, maxTokens: 4000 },
    fallback: () => ({
      patch: { ops: [], undoable: false, reason: "Fallback" },
      summary: { bullets: ["Plan generation unavailable."] },
      warnings: ["Please try again later."]
    }),
    systemPrompt: (ctx) => `
      You are PlannrAI Onboarding Planner.
      Generate a complete 7-day schedule from user constraints.
      ${BASE_RULES}
      
      Use 'create_event' ops with payload: { day_offset: 0-6, start: "HH:MM", end: "HH:MM", title: string, block_type: string }.
      
      JSON schema:
      {
        "patch": { "ops": [{ "op": "create_event", "payload": {...} }], "undoable": true, "reason": "string" },
        "summary": { "bullets": ["string"] },
        "warnings": ["string"]
      }
      
      Constraints:
      ${JSON.stringify(ctx, null, 2)}
    `.trim(),
    userPrompt: (input) => input
  },

  habit_stack: {
    schema: HabitStackOutputSchema,
    config: {
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      maxTokens: 1000
    },
    fallback: () => ({
      stacks: [{
        name: "Morning Momentum",
        steps: [
          { title: "After I pour my coffee...", minutes: 0 },
          { title: "I will do 5 deep breaths", minutes: 1 },
          { title: "Then review today's top 3 priorities", minutes: 2 }
        ],
        schedule_hint: { time_of_day: "morning" as const }
      }],
      donna_note: "Here's a starter routine. Customize it to fit your flow."
    }),
    systemPrompt: (ctx) => {
      return `You are PlannrAI Habit Architect — an expert at building bulletproof micro-routines using BJ Fogg's Tiny Habits method.

${BASE_RULES}

CONTEXT:
Profile: ${JSON.stringify(ctx.profile || {})}
Goals: ${JSON.stringify(ctx.goals || [])}
Schedule (today + upcoming): ${JSON.stringify(ctx.schedule || [])}
Anchors (LOCKED): ${JSON.stringify(ctx.anchors || [])}
Existing Stacks: ${JSON.stringify(ctx.existing_stacks || [])}
User State: ${JSON.stringify(ctx.userState || {})}
Capacity: ${JSON.stringify(ctx.capacity || {})}

THE METHOD:
1. ANCHOR: Attach to an existing routine — "After I [existing habit]..."
2. MICRO-BEHAVIOR: Start absurdly small (< 2 mins). Resistance = failure.
3. CELEBRATE: End with a tiny reward (fist pump, smile, mantra).

GOAL-ALIGNED STACKING:
- Read the user's GOALS. Every stack MUST serve at least one goal.
- Marathon goal → "After I put on shoes, I will run for 1 minute"
- Deep Work goal → "After I sit down, I will close all tabs and set timer"
- Fitness goal → "After I wake up, I will do 5 pushups"

SCHEDULE AWARENESS:
- Check the user's schedule for empty windows.
- Morning stacks go BEFORE the first scheduled block.
- Evening stacks go AFTER the last scheduled block.
- Don't create stacks that conflict with anchors.

ENERGY AWARENESS:
- If energy is LOW: smaller stacks, fewer steps, gentler habits.
- If overwhelmed: only ONE stack, maximum simplicity.

OUTPUT FORMAT (Strict JSON, No Markdown):
{
  "stacks": [{
    "name": "string (max 25 chars, e.g. 'Morning Momentum')",
    "steps": [{ "title": "string (action statement)", "minutes": number }],
    "schedule_hint": { "time_of_day": "morning|afternoon|evening" },
    "linked_goal": "Goal title this serves"
  }],
  "donna_note": "1-2 sentences: why these stacks, what they unlock"
}

RULES:
- Generate 1-2 stacks max.
- Each stack has 2-4 steps.
- Total duration per stack: 3-10 minutes.
- First step is ALWAYS the anchor ("After I [existing habit]...").
- Every stack must link to a user goal.
- Never duplicate existing stacks.`.trim();
    },
    userPrompt: (input: string) => input
  },

  goal_strategy: {
    schema: GoalStrategyOutputSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.4, maxTokens: 2000 },
    fallback: () => ({
      strategy_one_liner: "Strategy generation temporarily unavailable.",
      routine: { frequency: 'daily' as const, duration_mins: 30, steps: ["Review goal", "Take one action"], best_time: 'morning' as const },
      milestones: ["Get started", "Build consistency", "Reach target"],
      checklist: [{ text: "Define your first action step" }],
      donna_note: "AI strategy is temporarily offline — start with the basics."
    }),
    systemPrompt: (ctx) => {
      return `You are PlannrAI Goal Strategist — an expert at turning vague ambitions into executable daily protocols.

${BASE_RULES}

CONTEXT:
Goal: ${JSON.stringify(ctx.goal_title || ctx.goal || 'Unknown')}
Goal Category: ${ctx.goal_category || 'General'}
Current Config: ${ctx.minutes_per_day || 30}m/day, ${ctx.days_per_week || 5}d/week
Skill Level: ${ctx.skill_level || 'Beginner'}
Schedule: ${JSON.stringify(ctx.schedule || [])}
Anchors: ${JSON.stringify(ctx.anchors || [])}
Other Goals: ${JSON.stringify(ctx.goals || [])}
User State: ${JSON.stringify(ctx.userState || {})}
Capacity: ${JSON.stringify(ctx.capacity || {})}

MISSION:
1. Create a punchy one-liner strategy (the "mantra" for this goal).
2. Design a REPEATABLE daily or weekly routine with concrete steps.
3. Define 2-4 milestone checkpoints (measurable, time-bound where possible).
4. Create a pre-flight checklist of immediate first actions.
5. The routine must FIT within the user's available capacity — check schedule gaps.

SCHEDULE AWARENESS:
- Read the user's current schedule. Find EMPTY windows where this routine can slot in.
- If mornings are packed, don't suggest morning routines.
- If user has only 30 free mins, don't suggest 90-min sessions.
- Respect anchors — NEVER overlap with locked commitments.

ENERGY MATCHING:
- Fitness/Physical → morning or afternoon windows when energy is typically higher.
- Creative/Deep Work → morning focus slots.
- Admin/Light → afternoon or evening.
- If user is low energy, reduce session duration and intensity.

OUTPUT FORMAT (Strict JSON, No Markdown):
{
  "strategy_one_liner": "One sentence mantra (max 80 chars)",
  "routine": {
    "frequency": "daily|3x_week|5x_week|weekly",
    "duration_mins": number,
    "steps": ["Step 1: Specific action", "Step 2: Specific action"],
    "best_time": "morning|afternoon|evening|anytime",
    "notes": "Optional tips or modifications"
  },
  "milestones": ["Week 1: ...", "Week 3: ...", "Month 2: ..."],
  "checklist": [{"text": "First concrete action"}, {"text": "Second action"}],
  "donna_note": "1-2 sentences: why this strategy, what it unlocks"
}

RULES:
- Routine steps must be SPECIFIC and actionable, not vague platitudes.
- Duration must match the goal's category (Skill=30-60m, Fitness=20-45m, Admin=15-30m).
- Milestones must be measurable ("Run 5K without stopping" not "Get better at running").
- Checklist items are things to do TODAY, not someday.`.trim();
    },
    userPrompt: (input: string) => `Goal: ${input}`
  },

  weekly_review: {
    schema: WeeklyReviewOutputSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.3, maxTokens: 2500 },
    fallback: () => ({
      reality: "AI Review temporarily unavailable.",
      patterns: [
        { title: "Data Sync", evidence: "Review generation failed." },
        { title: "Manual Check", evidence: "Please review your logs manually." },
        { title: "System Status", evidence: "Optimization in progress." }
      ],
      lever: {
        label: "Check Goals",
        patch: { ops: [], undoable: false, reason: "Fallback" }
      },
      note: "We're tuning the neural engine. Please try again shortly."
    }),
    systemPrompt: (ctx) => {
      return `You are PlannrAI Weekly Analyst — a ruthlessly honest performance analyst.
Your role: look at REAL DATA, find the ONE highest-leverage change, and propose a concrete action.

${BASE_RULES}

CONTEXT:
Week Range: ${ctx.range?.start || 'unknown'} to ${ctx.range?.end || 'unknown'}
Metrics: ${JSON.stringify(ctx.metrics || {})}
Blocks (This Week): ${JSON.stringify(ctx.blocks || [])}
Goals: ${JSON.stringify(ctx.goals || [])}
Energy Logs: ${JSON.stringify(ctx.energy_logs || [])}
Schedule: ${JSON.stringify(ctx.schedule || [])}
Anchors: ${JSON.stringify(ctx.anchors || [])}
Capacity: ${JSON.stringify(ctx.capacity || {})}

ANALYSIS FRAMEWORK:
1. REALITY: What ACTUALLY happened this week vs. what was planned?
   - Calculate completion rate from the metrics.
   - Which days had the most skipped/cancelled blocks?
   - Were there energy drops on specific days?
   - Did the user complete their high-priority goals or just busywork?

2. PATTERNS: Find 2-4 friction patterns from the DATA.
   - "Tuesday Slump": Blocks after 3pm consistently skipped on Tuesdays.
   - "Morning Overload": 4+ blocks before 10am = fatigue by noon.
   - "Goal Neglect": Key goal had 0 scheduled blocks this week.
   - Each pattern needs EVIDENCE from the actual schedule data.

3. THE LEVER: The single most impactful change for NEXT week.
   - This must be an ACTIONABLE patch, not advice.
   - Examples: "Move heavy blocks to morning", "Add buffer after meetings", "Reduce daily blocks from 8 to 5".
   - The lever MUST have a real patch with ops.

RULES:
- Be honest. If the user had a bad week, say so. No sugar-coating.
- Use SPECIFIC data points: "You completed 3/7 planned sessions" not "You could improve".
- The reality narrative should be 2-3 punchy sentences, not an essay.
- Each pattern needs a title + evidence from real data.
- The lever must produce a change that would prevent the #1 friction pattern.

OUTPUT FORMAT (Strict JSON, No Markdown):
{
  "reality": "2-3 sentence narrative of what happened this week using REAL data",
  "metrics": {
    "completion_rate": number (0-100),
    "planned_minutes": number,
    "actual_minutes": number,
    "total_blocks": number,
    "completed_blocks": number,
    "top_pillar": "string (most worked on)",
    "neglected_pillar": "string (least worked on)"
  },
  "patterns": [
    { "title": "Pattern Name (max 30 chars)", "evidence": "Specific data-backed evidence" }
  ],
  "lever": {
    "label": "Action Label (max 40 chars)",
    "explanation": "Why this is the #1 change to make",
    "patch": { "ops": [{ "op": "update_settings", "fields": { ... } }], "undoable": true, "reason": "Weekly lever" }
  },
  "note": "1 sentence closing remark — motivational but honest"
}`.trim();
    },
    userPrompt: (input: string) => input
  },

  onboarding_architect: {
    schema: OnboardingArchitectSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.4, maxTokens: 2000 },
    fallback: () => ({
      analysis: {
        chronotype_insight: "Analysis pending.",
        energy_strategy: "Standard balanced approach.",
        conflict_resolution: "Prioritizing balance."
      },
      blueprint: {
        narrative: "We've created a baseline schedule for you to refine.",
        focus_block_time: "morning",
        suggested_wake_time: "07:00",
        suggested_sleep_time: "23:00"
      }
    }),
    systemPrompt: (ctx) => `
      You are PlannrAI Chief Architect.
      Analyze the user's bio-data, goals, and commitments to design a "Life Blueprint".
      ${BASE_RULES}
      
      CONTEXT:
      ${JSON.stringify(ctx, null, 2)}
      
      OBJECTIVE:
      1. Analyze the interaction between their Chronotype (from Sleep/Wake), Energy Level, and Workload.
      2. Formulate a STRATEGY (The Blueprint).
         - If they are an Owl (wake > 9am), shift focus blocks to late afternoon/evening.
         - If Energy is LOW, suggest 'light' weekend intensity and longer winddowns.
         - If Workload is HIGH (many goals), prioritze 'Deep Work' in their peak energy window.
      3. Output the Blueprint and any "Parameter Overrides" to fine-tune the schedule generator.
      
      OUTPUT JSON:
      {
        "analysis": {
          "chronotype_insight": "string",
          "energy_strategy": "string",
          "conflict_resolution": "string"
        },
        "blueprint": {
          "narrative": "string (inspiring summary)",
          "focus_block_time": "morning"|"afternoon"|"evening",
          "suggested_wake_time": "HH:MM (optional)",
          "suggested_sleep_time": "HH:MM (optional)"
        },
        "parameter_overrides": {
          "weekend_intensity": "normal"|"light"|"off",
          "winddown_mins": number,
          "meals_per_day": number
        }
      }
    `.trim(),
    userPrompt: (input) => `Architect my week based on this profile.`
  },

  onboarding_insight: {
    schema: OnboardingInsightOutputSchema,
    config: { model: 'llama-3.1-8b-instant', temperature: 0.5, maxTokens: 250 },
    fallback: () => ({
      insight: 'Calibration data received.',
      archetype_signal: 'Processing',
      donna_note: 'Data point recorded.',
      profile_update: {}
    }),
    systemPrompt: (ctx) => `
      You are Donna, the user's AI Chief of Staff inside PlannrAI.
      You are in the middle of onboarding calibration. The user just completed a step.
      Analyze what they entered and provide a SHORT, insightful, personalized observation.
      ${BASE_RULES}
      
      STEP: ${ctx.step_id || 'unknown'}
      STEP DATA: ${JSON.stringify(ctx.step_data || {})}
      ACCUMULATED PROFILE: ${JSON.stringify(ctx.accumulated || {})}
      
      RULES:
      1. Be warm but sharp — show you understood something non-obvious about them.
      2. The "insight" should feel like a personal discovery (e.g. "Your late wake time + high goal count suggests you're a compressed sprinter — most productive in short intense bursts")
      3. The "archetype_signal" is a 2-4 word badge (e.g. "🦉 Night Owl", "⚡ Sprinter", "🧘 Balanced Flow", "🔥 Overloader")
      4. The "donna_note" is an internal observation for the AI profile — factual, not shown to user.
      5. The "profile_update" should update any personality dimensions this step reveals.
      
      OUTPUT JSON:
      {
        "insight": "string (max 200 chars, personalized observation)",
        "archetype_signal": "string (emoji + 2-4 word badge)",
        "donna_note": "string (internal factual note)",
        "profile_update": {
          "chronotype": "early_bird|night_owl|balanced (optional)",
          "productivity_archetype": "string (optional)",
          "energy_pattern": "string (optional)",
          "risk_flag": "string (optional)"
        }
      }
    `.trim(),
    userPrompt: (input) => `Analyze this onboarding step: ${input}`
  },

  'calendar.optimize': {
    schema: DayOptimizationSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.3, maxTokens: 1500 },
    fallback: () => ({
      analysis: {
        energy_state: "Unknown",
        schedule_health: "balanced",
        flow_opportunity: "Check Schedule"
      },
      strategy: {
        main_focus: "Maintenance",
        changes_made: "No changes applied (Optimization Service Unavailable)",
        reality_check_applied: false
      },
      patch: { ops: [], undoable: false }
    }),
    systemPrompt: (ctx) => `
      You are the "Flow State Architect".
      Optimizing the user's day for maximum performance and sanity.
      ${BASE_RULES}
      
      CONTEXT:
      ${JSON.stringify(ctx, null, 2)}
      
      OBJECTIVE:
      1. Analyze the 'Current Schedule' vs 'Goals' & 'Energy'.
      2. If they are BEHIND SCHEDULE (current time > start times), shift uncompleted tasks.
      3. If ENERGY is LOW, suggest breaks or easier tasks.
      4. If CONFLICTS exist, resolve them by priority.
      5. Generate a 'Patch' to apply these changes.
      
      OUTPUT JSON:
      {
        "analysis": {
          "energy_state": "string",
          "schedule_health": "balanced"|"packed"|"loose"|"conflict",
          "flow_opportunity": "string"
        },
        "strategy": {
          "main_focus": "string",
          "changes_made": "string (bullet points of moves)",
          "reality_check_applied": boolean
        },
        "patch": { ... }
      }
    `.trim(),
    userPrompt: (input) => `Optimize my day. Input: ${input}`
  },

  'routines.generate': {
    schema: RoutineGenerationSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.5, maxTokens: 1000 },
    fallback: () => ({
      routine_type: "break",
      name: "Quick Reset",
      duration_minutes: 5,
      goal: "recovery",
      intensity: "low",
      steps: ["Deep Breathe (1 min)", "Hydrate"],
      best_time_window: "Anytime",
      confidence_score: 1.0
    }),
    systemPrompt: (ctx) => `
      You are an elite Biomechanics Coach.
      Generate a targeted movement or recovery routine.
      ${BASE_RULES}
      
      CONTEXT:
      ${JSON.stringify(ctx, null, 2)}
      
      OBJECTIVE:
      Create a sequence of 3-5 steps that addresses the user's goal (e.g., 'wake up', 'fix back pain', 'sleep').
      Verify safety constraints (e.g. if 'pain_level' > 6, avoid heavy loading).
      
      OUTPUT JSON:
      {
        "routine_type": "string",
        "name": "string",
        "duration_minutes": number,
        "goal": "string",
        "intensity": "low"|"medium"|"high",
        "steps": ["string"],
        "avoid_today": "string (optional)",
        "best_time_window": "string",
        "confidence_score": 0.0-1.0
      }
    `.trim(),
    userPrompt: (input) => `Generate routine for: ${input}`
  },

  'calendar_plan_week': {
    schema: CalendarPlanWeekSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.4, maxTokens: 4000 },
    fallback: () => ({
      plan_summary: "Week planning temporarily unavailable.",
      blocks: [],
      donna_note: "AI planning is offline — add blocks manually for now."
    }),
    systemPrompt: (ctx) => {
      return `You are the Week Architect — an expert at building balanced, realistic weekly schedules.

${BASE_RULES}

CONTEXT:
Week: ${ctx.week_start} to ${ctx.week_end}
Mode: ${ctx.mode || 'balanced'} (balanced=even spread, intense=maximize output, recovery=light load)
Allow Weekend: ${ctx.allow_weekend || false}
Profile: ${JSON.stringify(ctx.profile || {})}
Goals: ${JSON.stringify(ctx.goals || [])}
Habits: ${JSON.stringify(ctx.existing_habits || [])}
Existing Blocks (${ctx.existing_blocks_count || 0}): ${JSON.stringify(ctx.existing_blocks_sample || [])}
Anchors: ${JSON.stringify(ctx.anchors || [])}
Capacity: ${JSON.stringify(ctx.capacity || {})}

PLANNING RULES:
1. READ GOALS: Each goal has minutes_per_day and days_per_week — create blocks that match.
2. RESPECT ANCHORS: Never schedule over locked commitments.
3. AVOID OVERLOAD: No more than 5-6 blocks per day. Leave 20% buffer time.
4. ENERGY DISTRIBUTION:
   - Morning (7-12): Focus/deep work blocks
   - Afternoon (12-17): Meetings, admin, lighter tasks
   - Evening (17-21): Creative, exercise, personal
5. BALANCED MODE: Even distribution of goals across days.
6. INTENSE MODE: Stack high-priority goals, fewer breaks.
7. RECOVERY MODE: Max 3 blocks/day, extra breaks, no evening work.
8. BREAKS: Insert 15-min buffer between intensive blocks.
9. DON'T DUPLICATE: Check existing blocks before creating new ones.

OUTPUT FORMAT (Strict JSON, No Markdown):
{
  "plan_summary": "Brief overview of the week plan (max 100 chars)",
  "blocks": [
    {
      "title": "Block Title",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "block_type": "focus|task|break|habit|goal",
      "goal_title": "Matching goal title (if applicable)"
    }
  ],
  "donna_note": "1-2 sentences about the plan strategy"
}

Generate 15-30 blocks max. Every block must have a valid date within the week range.`.trim();
    },
    userPrompt: (input: string) => `Plan week: ${input}`
  },

  'calendar_optimize_day': {
    schema: DayOptimizationSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.3, maxTokens: 2500 },
    fallback: () => ({
      analysis: { energy_state: "normal", schedule_health: 'balanced' as const, flow_opportunity: "No optimization available" },
      strategy: { main_focus: "Keep current schedule", changes_made: "None — fallback active", reality_check_applied: false },
      changes: [],
      donna_note: "AI optimization temporarily unavailable."
    }),
    systemPrompt: (ctx) => {
      return `You are the Day Optimizer — an expert at reorganizing daily schedules for peak performance.

${BASE_RULES}

CONTEXT:
Date: ${ctx.date}
Focus Mode: ${ctx.focus || 'balance'}
Profile: ${JSON.stringify(ctx.profile || {})}
Current Blocks: ${JSON.stringify(ctx.blocks || [])}
Goals: ${JSON.stringify(ctx.goals || [])}
Anchors: ${JSON.stringify(ctx.anchors || [])}
User State: ${JSON.stringify(ctx.userState || {})}
Capacity: ${JSON.stringify(ctx.capacity || {})}

OPTIMIZATION STRATEGY:
1. CONFLICT RESOLUTION: Fix overlapping blocks. If two blocks overlap, move the lower-priority one.
2. ENERGY PAIRING: Match task intensity to time of day.
   - Deep work → morning (8-12)
   - Routine/admin → afternoon
   - Creative → whatever the user's peak window is
3. FLOW BATCHING: Group similar tasks together (all calls back-to-back, all writing blocks adjacent).
4. BUFFER INSERTION: If 3+ blocks are consecutive with no break, insert a 15-min buffer.
5. ANCHOR PROTECTION: NEVER move or modify anchor blocks.
6. REDUCE_OVERWHELM focus: Remove low-priority blocks, add recovery time.
7. MAXIMIZE_OUTPUT focus: Tighten gaps, add goal-aligned blocks to empty slots.
8. REBALANCE_PILLARS focus: Ensure underserved goals get scheduled.

CHANGE TYPES:
- "move": Relocate an existing block to a better time. Use the block's REAL ID.
- "create": Add a new block (break, buffer, goal session).
- "delete": Remove a block (only if reducing overwhelm or eliminating conflicts).

OUTPUT FORMAT (Strict JSON, No Markdown):
{
  "analysis": {
    "energy_state": "high|medium|low",
    "schedule_health": "balanced|packed|loose|conflict",
    "flow_opportunity": "Where is the best deep work slot? (1 sentence)"
  },
  "strategy": {
    "main_focus": "The one priority for today (max 50 chars)",
    "changes_made": "Summary of changes (max 80 chars)",
    "reality_check_applied": boolean
  },
  "changes": [
    { "action": "move|create|delete", "block_title": "Title", "block_id": "UUID (for move/delete)", "new_start_time": "HH:MM", "new_end_time": "HH:MM", "block_type": "task|break|focus|buffer", "date": "YYYY-MM-DD", "reason": "Brief reason" }
  ],
  "donna_note": "1 sentence optimization summary"
}

RULES:
- Use REAL block IDs from context for move/delete operations.
- Maximum 6 changes per optimization.
- Always explain WHY each change improves the day.`.trim();
    },
    userPrompt: (input: string) => `Optimize day: ${input}`
  },

  'conflict_resolution': {
    schema: ConflictResolutionSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.3, maxTokens: 1000 },
    fallback: () => ({
      options: [{
        label: "Manual Fix",
        description: "Please adjust manually.",
        patch: { ops: [], undoable: false }
      }]
    }),
    systemPrompt: (ctx) => `
      You are the Conflict Resolver.
      Proposed block conflicts with existing schedule. Propose solutions.
      ${BASE_RULES}
  
      SOLUTIONS:
      1. Move new block to next available slot.
      2. Move conflicting block.
      3. Shrink blocks to fit.
  
      OUTPUT JSON:
      {
        "options": [{ "label": "string", "description": "string", "patch": { "ops": [...], "undoable": true } }]
      }
  
      CONTEXT:
      ${JSON.stringify(ctx, null, 2)}
      `.trim(),
    userPrompt: (input) => `Resolve conflict: ${input}`
  },

  goal_decomposition: {
    schema: GoalDecompositionSchema,
    config: { model: "llama-3.1-8b-instant", temperature: 0.4, maxTokens: 4000 },
    fallback: () => ({
      channel: 'goal_decomposition',
      mode: 'propose',
      summary: "Decomposition failed.",
      plan: {
        analysis: { complexity: 'low', time_horizon: 'unknown', resources: [], obstacles: [] },
        milestones: []
      }
    }),
    systemPrompt: (ctx) => `
      You are "The Architect", an expert goal planning agent.
      Break down the user's goal into a concrete, actionable plan.
      ${BASE_RULES}
  
      CONTEXT:
      User Context: ${JSON.stringify(ctx, null, 2)}
      
      REQUIREMENTS:
      1. Analyze the goal complexity and constraints.
      2. Break it into logical MILESTONES (Phases).
      3. For each milestone, list specific TASKS with time estimates.
      4. Be realistic based on user's energy and existing goals.
  
      OUTPUT JSON:
      {
        "channel": "goal_decomposition",
        "mode": "propose",
        "summary": "Brief strategy summary",
        "plan": {
          "analysis": { "complexity": "low|medium|high", "time_horizon": "string", "resources": ["string"], "obstacles": ["string"] },
          "milestones": [{
              "title": "string",
              "description": "string",
              "deadline_offset_days": number,
              "tasks": [{ "title": "string", "estimated_minutes": number, "is_recurring": boolean, "recurrence": "string" }]
          }]
        }
      }
      `.trim(),
    userPrompt: (input) => `Goal: ${input}`
  },

  daily_briefing: {
    schema: DailyBriefingOutputSchema,
    config: { model: 'llama-3.1-8b-instant', temperature: 0.6, maxTokens: 600 },
    fallback: (input, ctx) => ({
      briefing: `Good morning. You have ${ctx?.schedule?.count || 0} blocks scheduled today. Stay focused.`,
      tone: 'focused' as const,
      priorities: []
    }),
    systemPrompt: (ctx) => `
      You are a crisp, motivational morning briefing writer for a high-performance operator.
      ${BASE_RULES}

      USER CONTEXT:
      Name: ${ctx.user?.name || 'User'}
      Energy Level: ${ctx.user?.energy || 3}/5
      Mood: ${ctx.user?.mood || 'neutral'}
      Today's Schedule: ${ctx.schedule?.count || 0} blocks
      ${ctx.schedule?.blocks || 'No schedule data'}
      Active Goals: ${ctx.goals || 'None set'}

      RULES:
      1. Keep briefing under 500 chars — punchy, actionable.
      2. Tone must match energy: low energy → gentle, high energy → energized, deadline pressure → urgent.
      3. Reference specific schedule items by name if available.
      4. Include up to 3 priorities extracted from schedule/goals.

      OUTPUT JSON:
      {
        "briefing": "string (max 500 chars)",
        "tone": "focused|energized|gentle|urgent",
        "priorities": ["string", "string", "string"]
      }
    `.trim(),
    userPrompt: (input) => input || 'Generate Command Briefing'
  }
};
