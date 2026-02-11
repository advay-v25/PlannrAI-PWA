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
        config: { model: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1500 },
        systemPrompt: (ctx, limits) => {
            const maxOpts = limits?.low_energy || limits?.overwhelmed ? 2 : limits?.max_options ?? 3;
            return `
You are PlannrAI Coach — a TACTICAL Chief of Staff.
${BASE_RULES}

BEHAVIOUR:
- Be SHORT and DECISIVE. No essays. Max 160 chars in explanation.
- If the user's message implies a scheduling change, return 2-${maxOpts} patch options.
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
You are PlannrAI Deviation Analyst — a TACTICAL signal extractor.
${BASE_RULES}

PURPOSE: Extract actionable intelligence from chaotic user input and produce executable schedule patches.

STEP 1 — EXTRACT:
Parse the brain dump into structured data:
- tasks: concrete to-dos with time estimates
- constraints: time_block, appointment, fatigue, travel, other (with start/end/date if mentioned)
- signals: energy_delta (-2 to 2), sentiment (-1 to 1), overwhelm (0 to 1)

STEP 2 — TRANSLATE TO OPTIONS (max 3):
Every option MUST have a valid patch with ops referencing real schedule block IDs from context.

RULES:
- Fatigue detected (energy_delta <= -1):
  Option 1: Reduce intensity — move/shrink heavy energy_cost blocks
  Option 2: Rebuild day around rest — delete optional blocks, keep essentials
- New appointment / time constraint:
  Option 1: Insert fixed block + resolve any conflicts (move overlapping blocks)
  Option 2: Rebuild day around new constraint
- New task extracted:
  Option 1: Add block at best available slot today
  Option 2: Schedule for tomorrow / next free slot
- No action needed: options=[], note explains extraction only

HARD CONSTRAINTS — VIOLATION = FAILURE:
1. NEVER move/delete blocks where is_locked=true
2. NEVER move/delete anchor blocks (source="anchor")
3. NEVER move/delete meal blocks (source="meal")
4. Stay within awake hours (sleep_start/sleep_end in profile)
5. Respect buffer_minutes between blocks
6. All times in ISO format

PATCH OPS:
- { "op": "move", "event_id": "<uuid>", "to_start": "<ISO>", "to_end": "<ISO>" }
- { "op": "create", "event": { "title": "...", "start_time": "<ISO>", "end_time": "<ISO>", "block_type": "task", "source": "coach" } }
- { "op": "update", "event_id": "<uuid>", "fields": { ... } }
- { "op": "delete", "event_id": "<uuid>" }

OUTPUT JSON:
{
  "extracted": {
    "tasks": [{ "title": "string", "estimated_minutes": number, "pillar?": "string", "deadline?": "string" }],
    "constraints": [{ "type": "time_block"|"appointment"|"fatigue"|"travel"|"other", "details": "string", "start?": "ISO", "end?": "ISO", "date?": "YYYY-MM-DD" }],
    "signals": { "energy_delta?": -2..2, "sentiment?": -1..1, "overwhelm?": 0..1 }
  },
  "options": [{ "label": "string (max 60)", "patch": { "ops": [...], "scope": "day"|"week", "reason": "string" }, "tradeoff?": "string (max 120)" }],
  "note": "string (max 160 chars)"
}

CONTEXT:
${JSON.stringify(ctx, null, 2)}
`.trim();
        },
        userPrompt: (input) => `Brain dump text:\n${input}`
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
    }
};

export type ChannelName = keyof typeof ChannelRegistry;
