import { z } from 'zod';
import { PatchSchema } from './schemas';

// --- Shared Types ---
export type AIContext = Record<string, any>;
export type AILimits = {
  max_options?: number;
  low_energy?: boolean;
  overwhelmed?: boolean;
};

// --- Per-Channel Output Schemas ---
// --- Per-Channel Output Schemas ---
import { OnboardingArchitectSchema, DayOptimizationSchema, RoutineGenerationSchema } from './schemas';

// 1. Coach
export const CoachOutputSchema = z.object({
  intent: z.enum(['adjust_schedule', 'rebuild_day', 'rebuild_week', 'reduce_intensity', 'none']),
  explanation: z.string().max(200),
  options: z.array(z.object({
    label: z.string().max(60),
    patch: z.object({
      ops: z.array(z.any()).max(50),
      scope: z.enum(['day', 'week']).default('day'),
      reason: z.string().max(140).optional(),
    }),
    tradeoff: z.string().max(120).optional()
  })).max(3)
});

// 2. Brain Dump
export const BrainDumpOutputSchema = z.object({
  extracted: z.object({
    tasks: z.array(z.object({
      title: z.string(),
      estimated_minutes: z.number(),
      pillar: z.string().optional(),
      deadline: z.string().optional()
    })).optional(),
    constraints: z.array(z.object({
      type: z.enum(['time_block', 'appointment', 'fatigue', 'travel', 'other']),
      details: z.string(),
      start: z.string().optional(),
      end: z.string().optional(),
      date: z.string().optional(),
    })).optional(),
    signals: z.object({
      energy_delta: z.number().min(-2).max(2).optional(),
      sentiment: z.number().min(-1).max(1).optional(),
      overwhelm: z.number().min(0).max(1).optional()
    })
  }),
  options: z.array(z.object({
    label: z.string().max(60),
    patch: z.object({
      ops: z.array(z.any()).max(50),
      scope: z.enum(['day', 'week']).default('day'),
      reason: z.string().max(140).optional(),
    }),
    tradeoff: z.string().max(120).optional()
  })).max(3),
  note: z.string().max(200)
});

// 3. Onboarding Plan
export const OnboardingPlanOutputSchema = z.object({
  patch: PatchSchema,
  summary: z.object({
    bullets: z.array(z.string()).max(5)
  }),
  warnings: z.array(z.string()).max(5)
});

// 4. Habit Stack
export const HabitStackOutputSchema = z.object({
  stacks: z.array(z.object({
    name: z.string(),
    steps: z.array(z.object({
      title: z.string(),
      minutes: z.number(),
      trigger: z.string().optional(),
      note: z.string().optional()
    })),
    schedule_hint: z.object({
      time_of_day: z.enum(['morning', 'afternoon', 'evening'])
    }).optional()
  })),
  options: z.array(z.object({
    label: z.string(),
    patch: PatchSchema
  })).optional()
});

// 5. Goal Strategy
export const GoalStrategyOutputSchema = z.object({
  options: z.array(z.object({
    label: z.string(),
    patch: PatchSchema
  })).describe('Provide 1-2 strategy options. The patch must contain an update_goal op with the ai_strategy field populated.')
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
}

const BASE_RULES = `
Rules:
- Output STRICT JSON only. No markdown, no commentary.
- Use only provided context. Do not hallucinate.
`.trim();

export const ChannelRegistry: Record<string, ChannelDef> = {
  coach: {
    schema: CoachOutputSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 2000 },
    systemPrompt: (ctx, limits) => {
      const maxOpts = limits?.low_energy || limits?.overwhelmed ? 2 : limits?.max_options ?? 3;
      return `
You are PlannrAI's "OMNISCIENT PARTNER" — A Super-Intelligent Performance Coach.
${BASE_RULES}

CORE IDENTITY:
- You are NOT just a scheduler. You are a biological & strategic advisor.
- You know the user's chronotype, energy levels, goals, and habits.
- You speak with AUTHORITY, EMPATHY, and COMPRESSION.
- Your advice is always ACTIONABLE.

MODES:
1. **TACTICAL (Scheduling)**: User says "Move gym to 5pm".
   - detailed 'options' with patches.
   - Keep 'wisdom' brief (just confirmation).

2. **STRATEGIC (Consultation)**: User says "Why am I so tired?" or "Plan a 4-day work week".
   - Use 'wisdom' field to provide a markdown-formatted deep dive.
   - Analyze *cause & effect* (e.g. "You're tired because you scheduled Deep Work during your circadian dip").
   - Still provide 'options' if actionable changes result from the advice.

HARD CONSTRAINTS (For Patches):
1. NEVER move/delete locked blocks.
2. NEVER move/delete anchors (commitments).
3. Respect sleep/wake windows.
4. Meals are sacred.

PATCH OPS (CoachV4):
- create: { "op": "create", "event": { "title", "start_time", "end_time", "block_type": "task|habit|break", "source": "coach" } }
- move: { "op": "move", "event_id", "to_start", "to_end" }
- update: { "op": "update", "event_id", "fields": {} }
- delete: { "op": "delete", "event_id" }

OUTPUT JSON:
{
  "intent": "adjust_schedule"|"rebuild_day"|"consultation"|"reduce_intensity"|"none",
  "analysis": { "constraints_checked": ["string"], "reasoning": "string" },
  "wisdom": "markdown string (Advice/Answer)",
  "options": [{ "label": "string", "patch": {...}, "tradeoff": "string" }]
}

CONTEXT:
${JSON.stringify(ctx, null, 2)}
`.trim();
    },
    userPrompt: (input) => input
  },

  brain_dump: {
    schema: BrainDumpOutputSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.2, maxTokens: 2500 },
    systemPrompt: (ctx) => {
      return `
You are PlannrAI Interpretation Engine (Donna).
Analyze the user's "Brain Dump" to detect INTENT and EXTRACT items.
${BASE_RULES}

OBJECTIVE:
1. CLASSIFY INTENT:
   - 'execution': Explicit tasks/to-dos (e.g. "I need to call Mom").
   - 'planning': Scheduling/Time concerns (e.g. "When can I fit in gym?").
   - 'journaling': Venting/Emotions (e.g. "I'm so stressed").
   - 'ideation': Random thoughts/Ideas (e.g. "App idea: ...").

2. EXTRACT ITEMS:
   - Pull out tasks with estimates.
   - Pull out ideas.
   - Analyze emotional signals (sentiment, arousal).

3. STRATEGIZE:
   - specific 'recommended_action' based on intent.
   - If 'execution' -> suggest 'schedule_tasks'.
   - If 'planning' -> suggest 'plan_week'.
   - If 'journaling' -> suggest 'coaching_session' (if negative) or 'save_notes'.

4. PATCHING (Optional):
   - Only generate a 'patch' if the intent is CLEARLY 'planning' or 'execution' and the user asked for it. 
   - Otherwise, leave patch undefined and let the UI handle the "Triage".

OUTPUT JSON:
{
  "intent": "execution"|"planning"|"journaling"|"ideation",
  "confidence": 0.0-1.0,
  "extracted": {
    "tasks": [{ "title": "string", "estimated_minutes": number, "pillar?": "string", "deadline?": "string", "status": "new" }],
    "ideas": ["string"],
    "emotional_signals": { "sentiment": -1..1, "arousal": 0..1, "tags": ["string"] }
  },
  "strategy": {
    "summary": "string (what you found)",
    "recommended_action": "schedule_tasks"|"plan_week"|"coaching_session"|"save_notes"|"nothing",
    "reasoning": "string"
  },
  "patch": { ... } (optional)
}

CONTEXT:
${JSON.stringify(ctx, null, 2)}
`.trim();
    },
    userPrompt: (input) => `Brain dump input:\n${input}`
  },

  onboarding_plan: {
    schema: OnboardingPlanOutputSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.2, maxTokens: 4000 },
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
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 1500 },
    systemPrompt: (ctx) => `
You are PlannrAI Habit Designer.
Design habit stacks using BJ Fogg's Tiny Habits method AND propose concrete calendar placements.
${BASE_RULES}

BEHAVIOR:
- When the user wants to build a habit, design 1-2 powerful stacks.
- For every stack, ALWAYS provide at least 2 placement options in "options" array.
- Option 1: "Morning Ritual" - placement in the first available slot after wake_up.
- Option 2: "Evening Wind-down" - placement in the slot before sleep_start.
- If it's a weekend habit, include a "Weekend Morning" option.

PATCH OPS:
- Use "create_event" with payload: { title, start_time, end_time, block_type: "habit", is_locked: true, is_fixed: true, meta: { habit_stack_index: 0 } }
- Ensure start/end times matches context availability and respect existing anchors.

OUTPUT JSON:
{
  "stacks": [{
    "name": "string",
    "steps": [{ "title": "string", "minutes": number, "trigger?": "string", "note?": "string" }],
    "schedule_hint?": { "time_of_day": "morning"|"afternoon"|"evening" }
  }],
  "options": [{ 
    "label": "Morning Ritual / Evening Buffer / etc", 
    "patch": { "ops": [...], "undoable": true, "reason": "string" } 
  }]
}

Context (Profile, Schedule, Goals):
${JSON.stringify(ctx, null, 2)}
`.trim(),
    userPrompt: (input) => input
  },

  goal_strategy: {
    schema: GoalStrategyOutputSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 2000 },
    systemPrompt: (ctx) => `
You are PlannrAI Goal Strategist.
Decompose a goal into a high-precision execution plan.
${BASE_RULES}

JSON schema:
{
  "options": [{
    "label": "string",
    "patch": { 
      "ops": [{ 
        "op": "update_goal", 
        "goal_id": "...", 
        "fields": { 
          "ai_strategy": {
            "strategy_one_liner": "string",
            "routine": { "frequency": "string", "duration_mins": number, "steps": ["string"], "notes?": "string" },
            "milestones": ["string"],
            "checklist": [{"text": "string"}]
          } 
        } 
      }], 
      "undoable": true, 
      "reason": "string" 
    }
  }]
}

Context:
${JSON.stringify(ctx, null, 2)}
`.trim(),
    userPrompt: (input) => `Goal: ${input}`
  },

  weekly_review: {
    schema: WeeklyReviewOutputSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1500 },
    systemPrompt: (ctx) => `
You are PlannrAI Weekly Analyst. Analyze the user's week and produce a structured review.
${BASE_RULES}

BEHAVIOR:
- reality: 1-2 sentence narrative of facts. e.g. "You completed 65% of your planned Focus blocks, but struggled with morning consistency."
- patterns: Identify EXACTLY 3 recurring behaviors with evidence. e.g. "Late Night Drift: 4/7 nights you pushed sleep_start past midnight."
- lever: Exactly ONE high-impact change for NEXT week. It must be an executable patch.
  - Types: reduce goal minutes, shift preferred window, add buffer, set weekend_intensity, insert recovery block.
- note: Warm, encouraging, max 160 chars. No gamification or 'points'.

PATCH OPS (for lever):
- use "update_settings" for window/buffer/weekend_intensity.
- use "update_goal" for reducing minutes.
- use "create_event" for recovery blocks (day_offset 0-6).

OUTPUT JSON:
{
  "reality": "string",
  "patterns": [{"title": "string", "evidence": "string"}],
  "lever": { "label": "string", "patch": { "ops": [...], "undoable": true, "reason": "string" } },
  "note": "string"
}

Context (Profile, Goals, Last 7 Days Schedule):
${JSON.stringify(ctx, null, 2)}
`.trim(),
    userPrompt: (input) => input
  },

  onboarding_architect: {
    schema: OnboardingArchitectSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 2000 },
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

  'calendar.optimize': {
    schema: DayOptimizationSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1500 },
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
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.5, maxTokens: 1000 },
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
  }
};

export type ChannelName = keyof typeof ChannelRegistry;
