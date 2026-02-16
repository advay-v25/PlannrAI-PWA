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
import { OnboardingArchitectSchema, DayOptimizationSchema, RoutineGenerationSchema, CalendarPlanWeekSchema, ConflictResolutionSchema, CoachResponseSchema, BrainDumpResponseSchema } from './schemas';

// 1. Coach
export const CoachOutputSchema = z.object({
  intent: z.enum(['adjust_schedule', 'rebuild_day', 'rebuild_week', 'reduce_intensity', 'consultation', 'none']),
  explanation: z.string().max(200),
  wisdom: z.string().optional(),
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
    schema: CoachResponseSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 2000 },
    minOptions: 1,
    fallback: () => ({
      channel: 'coach',
      summary: "I'm having trouble thinking, but here are safe options.",
      mode: 'propose',
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
      const maxOpts = limits?.low_energy || limits?.overwhelmed ? 2 : limits?.max_options ?? 3;
      return `
      You are the Chief of Staff for a high-performance operator.
      Your IQ is 250. You are a productivity manager, flow-state coach, and time orchestrator.
      
      MISSION:
      "Act, don't talk."
      Your goal is to unblock the user by providing EXECUTABLE OPTIONS to change their schedule/reality.
      
      CONTEXT:
      Current Time: ${ctx.now}
      Schedule: ${JSON.stringify(ctx.schedule || [])}
      Anchors (Locked): ${JSON.stringify(ctx.anchors || [])}
      Goals: ${JSON.stringify(ctx.goals || [])}
      User State: ${JSON.stringify(ctx.userState || {})}
      Recent Logs: ${JSON.stringify(ctx.recentLogs || [])}
      
      RULES:
      1. NEVER return without options unless asking a clarifying question.
      2. Options must be 2-${maxOpts} MAX.
      3. EVERY option must have a 'patch' with real operations (create_event, move_event, etc).
      4. NO WAFFLE. Summary must be < 120 chars.
      5. If schedule is packed, options must involve tradeoffs (killing tasks, moving to tomorrow).
      6. Protect Anchors, Sleep, and Meals.
      
      INTENT DETECTION:
      - "I'm busy at 4pm" -> Move block at 4pm to another slot.
      - "I'm tired" -> Lighten load, insert breaks.
      - "Plan my day" -> Fill empty slots with highest priority goals.
      
      OUTPUT FORMAT:
      JSON matching CoachResponseSchema.
      channel: "coach"
      `.trim();
    },
    userPrompt: (input) => input
  },


  brain_dump: {
    schema: BrainDumpResponseSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.2, maxTokens: 3000 },
    fallback: (input) => ({
      channel: 'brain_dump',
      summary: "I extracted some items but couldn't process fully.",
      mode: 'propose',
      options: [
        {
          id: 'fallback_1',
          title: 'Save to Inbox',
          impact: 'Review later',
          patch: { ops: [], reason: "Fallback save" }
        }
      ],
      extracted: {
        items: [{ kind: 'note', title: input.slice(0, 50) }],
        signals: { overwhelm: 0, stress: 0, motivation: 0.5, energy: 3, health_flag: false }
      }
    }),
    systemPrompt: (ctx) => `
      You are PlannrAI's "Chaos Engine".
      Transform raw brain dumps into STRUCTURED ACTION + REALITY CHANGES.
      ${BASE_RULES}
      
      MISSION:
      1. Capture raw thoughts.
      2. Extract actionable items (Tasks, Commitments) + Constraints + Signals.
      3. Produce 2-3 "Do Something Now" options with EXECUTABLE PATCHES.
      
      CONTEXT:
      Current Time: ${ctx.now}
      Schedule: ${JSON.stringify(ctx.schedule || [])}
      Goals: ${JSON.stringify(ctx.goals || [])}
      User State: ${JSON.stringify(ctx.userState || {})}
      
      DETECTION RULES:
      A) Deviations: "I'm busy at 4pm" -> Propose reschedule.
      B) New Tasks: "Buy milk" -> Propose 'create_event' (today/tomorrow).
      C) Overload: "I'm overwhelmed" -> Propose 'reduce_intensity' (update_goal).
      D) Fog: "I don't know what to do" -> Propose 'triage' (pick top 3).
      
      OUTPUT FORMAT:
      JSON matching BrainDumpResponseSchema.
      channel: "brain_dump"
    `.trim(),
    userPrompt: (input) => `Input:\n${input}`
  },

  onboarding_plan: {
    schema: OnboardingPlanOutputSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.2, maxTokens: 4000 },
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
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 1500 },
    minOptions: 1,
    fallback: () => ({
      stacks: [],
      options: [{
        label: "Manual Setup",
        patch: { ops: [], undoable: false, reason: "Fallback" }
      }]
    }),
    systemPrompt: (ctx) => `
You are PlannrAI Habit Architect.
Design high-adherence habit stacks using BJ Fogg's "Tiny Habits" method and Andrew Huberman's protocols.
${BASE_RULES}

THE METHOD:
1. ANCHOR: Connect the new habit to an existing routine (e.g., "After I pour my coffee...").
2. MICRO-BEHAVIOR: Make it minimal (< 2 mins). (e.g., "...I will do 2 pushups", not "I will workout").
3. DO IT: The steps must include the anchor and the behavior.

GOAL ALIGNMENT:
- Review the User's GOALS in the context.
- If User has a goal "Run Marathon", the habit is "Put on running shoes" (1 min).
- If User has a goal "Deep Work", the habit is "Clear desk & Phone away" (2 mins).

PATCH OPS:
- Use "create_habit_stack" op to save to DB.
- Payload: { name, steps, preferred_window, schedule_now: true }.
- Steps structure: [{ "title": "After I [Anchor]...", "minutes": 1 }, { "title": "I will [Micro-Habit]", "minutes": 2 }, { "title": "Celebrate (Instant dopemine)", "minutes": 0 }]

OUTPUT JSON:
{
  "stacks": [{
    "name": "string (e.g. 'Morning Momentum')",
    "steps": [{ "title": "string", "minutes": number }],
    "schedule_hint": { "time_of_day": "morning"|"afternoon"|"evening" }
  }],
  "options": [{ 
    "label": "Save & Schedule (Morning)", 
    "patch": { 
      "ops": [{
         "op": "create_habit_stack",
         "payload": {
            "name": "string",
            "steps": [...],
            "preferred_window": "morning",
            "schedule_now": true
         }
      }], 
      "undoable": true, 
      "reason": "Aligned with goal: [Goal Title]" 
    } 
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
    minOptions: 1,
    fallback: () => ({
      options: [{
        label: "Strategy Unavailable",
        patch: { ops: [], undoable: false, reason: "Fallback" }
      }]
    }),
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

  'calendar.optimize': {
    schema: DayOptimizationSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1500 },
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
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.5, maxTokens: 1000 },
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
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.4, maxTokens: 3000 },
    fallback: () => ({
      options: [{
        label: "Standard Balance",
        description: "A balanced mix of work and recovery.",
        patch: { ops: [], undoable: false, reason: "Fallback" }
      }]
    }),
    systemPrompt: (ctx) => `
    You are the Week Architect.
    Generate 2-3 schedule variants based on the user's profile and goals.
    ${BASE_RULES}

    VARIANTS:
    1. Balanced: Even distribution of work/rest.
    2. Front-Loaded: Heavy work Mon-Wed, lighter Thu-Fri.
    3. Recovery-Focused: Prioritizes breaks and sleep.

    Constraints:
    - Sleep/Wake times are immutable.
    - Meals are immutable.
    - Respect weekend intensity preference.

    OUTPUT JSON:
    {
      "options": [{
        "label": "string",
        "description": "string",
        "patch": { "ops": [{"op": "create_block", "payload": {...}}], "undoable": true, "reason": "string" }
      }]
    }

    CONTEXT:
    ${JSON.stringify(ctx, null, 2)}
    `.trim(),
    userPrompt: (input) => `Plan week: ${input}`
  },

  'calendar_optimize_day': {
    schema: DayOptimizationSchema, // Reuse structure
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 2000 },
    fallback: () => ({
      analysis: { energy_state: "normal", schedule_health: "balanced", flow_opportunity: "none" },
      strategy: { main_focus: "Manual", changes_made: "Service offline", reality_check_applied: false },
      options: [{ label: "Keep Current", patch: { ops: [], undoable: false } }]
    }),
    systemPrompt: (ctx) => `
    You are the Day Optimizer. Re-organize today's blocks for better flow.
    ${BASE_RULES}
    
    OBJECTIVE:
    - Fix overlaps.
    - Group similar tasks (batching).
    - Insert breaks if intensity is high.
    
    OUTPUT JSON:
    {
      "analysis": { "energy_state": "string", "schedule_health": "string", "flow_opportunity": "string" },
      "strategy": { "main_focus": "string", "changes_made": "string", "reality_check_applied": boolean },
      "options": [{ "label": "string", "patch": { "ops": [...], "undoable": true } }]
    }

    CONTEXT:
    ${JSON.stringify(ctx, null, 2)}
    `.trim(),
    userPrompt: (input) => `Optimize day: ${input}`
  },

  'conflict_resolution': {
    schema: ConflictResolutionSchema,
    config: { model: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1000 },
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
  }
};

export type ChannelName = keyof typeof ChannelRegistry;
