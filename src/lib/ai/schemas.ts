// src/lib/ai/schemas.ts
import { z } from "zod";

export const ChannelEnum = z.enum([
    "onboarding",
    "home",
    "home.insight",
    "home.briefing",
    "calendar",
    "calendar.optimize",
    "coach",
    "brain_dump",
    "weekly_review",
    "settings",
    "habit_stack",
    "habit_stack.optimize",
    "goal_strategy",
    "goal_decomposition", // kept for legacy if needed
    "goals.suggest",
    "routines.generate",
    "scans.analyze",
    "system.translate",
    "onboarding_architect",
    "calendar_plan_week",
    "conflict_resolution"
]);

export const OnboardingArchitectSchema = z.object({
    analysis: z.object({
        chronotype_insight: z.string().describe("Insight about their sleep/wake window"),
        energy_strategy: z.string().describe("How we will manage their energy levels"),
        conflict_resolution: z.string().describe("How we handled commitments vs goals"),
    }),
    blueprint: z.object({
        narrative: z.string().describe("A 2-3 sentence 'Master Plan' summary"),
        focus_block_time: z.enum(['morning', 'afternoon', 'evening']).describe("Best time for deep work"),
        suggested_wake_time: z.string().optional().describe("HH:MM"),
        suggested_sleep_time: z.string().optional().describe("HH:MM"),
    }),
    parameter_overrides: z.object({
        weekend_intensity: z.enum(['normal', 'light', 'off']).optional(),
        winddown_mins: z.number().optional(),
        meals_per_day: z.number().optional()
    }).optional()
});

export const RoutineGenerationSchema = z.object({
    routine_type: z.enum(['morning', 'night', 'workout', 'stretch', 'break']),
    name: z.string().describe("Catchy title"),
    duration_minutes: z.number(),
    goal: z.enum(['mobility', 'activation', 'recovery', 'downshift', 'energy']),
    intensity: z.enum(['low', 'medium', 'high']),
    steps: z.array(z.string()).describe("List of exercises/actions"),
    avoid_today: z.string().optional().describe("Warning if pain detected"),
    best_time_window: z.string().describe("When to perform"),
    confidence_score: z.number().min(0).max(1)
});

export const ModeEnum = z.enum(["execute", "propose", "ask", "refuse"]);

export const PatchOpSchema = z.union([
    z.object({
        op: z.literal("create_event"),
        payload: z.record(z.string(), z.any()),
    }),
    z.object({
        op: z.literal("move_event"),
        event_id: z.string().min(1),
        to_start: z.string().min(1), // ISO string
        to_end: z.string().min(1),   // ISO string
    }),
    z.object({
        op: z.literal("update_event"),
        event_id: z.string().min(1),
        fields: z.record(z.string(), z.any()),
    }),
    z.object({
        op: z.literal("delete_event"),
        event_id: z.string().min(1),
    }),
    z.object({
        op: z.literal("update_goal"),
        goal_id: z.string().min(1),
        fields: z.record(z.string(), z.any()),
    }),
    z.object({
        op: z.literal("update_settings"),
        fields: z.record(z.string(), z.any()),
    }),
    z.object({
        op: z.literal("create_habit_stack"),
        trigger: z.string().min(1),
        action: z.string().min(1),
        duration: z.number().min(1).max(60),
        time_of_day: z.enum(["morning", "afternoon", "evening", "anytime"]).optional(),
    }),
    z.object({
        op: z.literal("update_habit_stack"),
        stack_id: z.string().min(1),
        fields: z.record(z.string(), z.any()),
    }),
    z.object({
        op: z.literal("delete_habit_stack"),
        stack_id: z.string().min(1),
    }),
    z.object({
        op: z.literal("create_anchor"),
        title: z.string().min(1),
        start_time: z.string().min(1),
        end_time: z.string().min(1),
        days_of_week: z.array(z.number()).min(1),
    }),
    z.object({
        op: z.literal("delete_anchor"),
        anchor_id: z.string().min(1),
    }),
    z.object({
        op: z.literal("analyze_content"),
        analysis: z.record(z.string(), z.any()),
    }),
]);

export const PatchSchema = z.object({
    ops: z.array(PatchOpSchema).max(50),
    undoable: z.boolean().default(true),
    reason: z.string().max(160).optional(),
});

export const DayOptimizationSchema = z.object({
    analysis: z.object({
        energy_state: z.string().describe("User's current energy vibe"),
        schedule_health: z.enum(['balanced', 'packed', 'loose', 'conflict']),
        flow_opportunity: z.string().describe("Where is the best deep work slot?")
    }),
    strategy: z.object({
        main_focus: z.string().describe("The one thing to nail today"),
        changes_made: z.string().describe("Summary of what we moved and why"),
        reality_check_applied: z.boolean().describe("Did we have to condense tasks?")
    }),
    patch: PatchSchema // Reusing existing PatchSchema
});

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

export const CoachResponseSchema = z.object({
    channel: z.literal('coach'),
    summary: z.string().max(120).describe('Short actionable summary of what you are doing (max 120 chars)'),
    mode: z.enum(['execute', 'propose', 'ask', 'refuse']).describe('Interaction mode'),
    options: z.array(z.object({
        id: z.string(),
        title: z.string().max(40),
        impact: z.string().max(80),
        patch: PatchSchema
    })).optional().describe('Actionable options (max 3)'),
    question: z.object({
        prompt: z.string(),
        type: z.enum(['text', 'confirm', 'choice']),
        choices: z.array(z.string()).optional()
    }).optional().describe('Clarifying question if needed'),
    refusal: z.object({
        reason: z.string(),
        next_best: z.string()
    }).optional()
});

export const BrainDumpResponseSchema = z.object({
    channel: z.literal('brain_dump'),
    summary: z.string().max(120).describe('Short impact summary (max 120 chars)'),
    mode: z.enum(['execute', 'propose', 'ask']).describe('Interaction mode'),
    options: z.array(z.object({
        id: z.string(),
        title: z.string().max(40),
        impact: z.string().max(80),
        patch: PatchSchema
    })).min(1).max(3).describe('Actionable options (1-3)'),
    extracted: z.object({
        items: z.array(z.object({
            kind: z.enum(['task', 'commitment', 'note', 'worry', 'idea', 'habit', 'constraint']),
            title: z.string(),
            est_min: z.number().optional(),
            pillar: z.enum(['mind', 'body', 'craft', 'uncategorized']).optional(),
            urgency: z.number().min(1).max(3).optional(),
            importance: z.number().min(1).max(3).optional(),
            due: z.string().optional(), // YYYY-MM-DD or 'today'
            fixed_time: z.string().optional(), // HH:MM
            tags: z.array(z.string()).optional()
        })),
        signals: z.object({
            overwhelm: z.number().min(0).max(1),
            stress: z.number().min(0).max(1),
            motivation: z.number().min(0).max(1),
            energy: z.number().min(1).max(5),
            health_flag: z.boolean()
        }),
        constraints: z.array(z.object({
            type: z.enum(['busy', 'cannot_do', 'reduce_intensity']),
            date: z.string().optional(),
            start: z.string().optional(),
            end: z.string().optional(),
            reason: z.string().optional()
        })).optional()
    }),
    question: z.object({
        prompt: z.string(),
        type: z.enum(['text', 'confirm', 'choice']),
        choices: z.array(z.string()).optional()
    }).optional()
});

export const CalendarPlanWeekSchema = z.object({
    options: z.array(z.object({
        label: z.string(),
        description: z.string(),
        patch: PatchSchema
    }))
});

export const ConflictResolutionSchema = z.object({
    options: z.array(z.object({
        label: z.string(),
        description: z.string(),
        patch: PatchSchema
    }))
});

export const OptionSchema = z.object({
    id: z.string().min(1),
    title: z.string().max(60), // Slightly more room for tactical titles
    impact: z.string().max(100),
    patch: PatchSchema,
});

export const QuestionSchema = z.object({
    prompt: z.string().max(160),
    type: z.enum(["time", "choice", "number", "text"]),
    choices: z.array(z.string()).max(5).optional(), // Reduced choices for decisiveness
});

export const GoalDecompositionSchema = z.object({
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
});

export const RefusalSchema = z.object({
    reason: z.string().max(160),
    next_best: z.string().max(160).nullable().optional(),
});

export const StackSchema = z.object({
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
});

export const AIResponseSchema = z.object({
    channel: ChannelEnum,
    summary: z.string().max(500).optional(),
    note: z.string().optional(),
    explanation: z.string().optional(),
    mode: ModeEnum,
    options: z.array(OptionSchema).max(10).optional(),
    stacks: z.array(StackSchema).optional(),
    plan: GoalDecompositionSchema.optional(),
    question: QuestionSchema.optional(),
    refusal: RefusalSchema.optional(),
}).superRefine((val, ctx) => {

    const optionsLen = val.options?.length ?? 0;

    if (val.mode === "execute") {
        if (optionsLen !== 1) ctx.addIssue({ code: "custom", message: "execute must include exactly 1 option (the action)" });
        if (val.question) ctx.addIssue({ code: "custom", message: "execute must not include question" });
        if (val.refusal) ctx.addIssue({ code: "custom", message: "execute must not include refusal" });
    }

    if (val.mode === "propose") {
        if (optionsLen < 1) ctx.addIssue({ code: "custom", message: "propose must include 1-3 options" });
    }

    if (val.mode === "ask") {
        if (!val.question) ctx.addIssue({ code: "custom", message: "ask must include question" });
        if (optionsLen > 0) ctx.addIssue({ code: "custom", message: "ask must not include options" });
    }

    if (val.mode === "refuse") {
        if (!val.refusal) ctx.addIssue({ code: "custom", message: "refuse must include refusal" });
        if (optionsLen > 0) ctx.addIssue({ code: "custom", message: "refuse must not include options" });
        if (val.question) ctx.addIssue({ code: "custom", message: "refuse must not include question" });
    }
});


// --- Canonical Patch Schema (Phase 2.5) ---
export const CanonicalPatchOpSchema = z.discriminatedUnion('op', [
    z.object({
        op: z.literal('CREATE'),
        block: z.object({
            date: z.string(),
            start_time: z.string(),
            end_time: z.string(),
            title: z.string(),
            block_type: z.enum(['focus', 'routine', 'meal', 'social', 'rest', 'sleep', 'buffer']),
            is_fixed: z.boolean().optional(),
            status: z.enum(['planned', 'completed', 'skipped']).optional(),
            goal_id: z.string().optional(),
            pillar: z.string().optional(),
            energy_cost: z.enum(['low', 'medium', 'high']).optional(),
            commitment_id: z.string().optional(),
            is_locked: z.boolean().optional(),
            meta: z.record(z.string(), z.any()).optional()
        })
    }),
    z.object({
        op: z.literal('MOVE'),
        block_id: z.string(),
        new_date: z.string(),
        new_start_time: z.string(),
        new_end_time: z.string()
    }),
    z.object({
        op: z.literal('UPDATE'),
        block_id: z.string(),
        fields: z.record(z.string(), z.any())
    }),
    z.object({
        op: z.literal('DELETE'),
        block_id: z.string()
    })
]);

export const CanonicalPatchSchema = z.object({
    reason: z.string(),
    changes: z.array(CanonicalPatchOpSchema)
});

export type CanonicalPatch = z.infer<typeof CanonicalPatchSchema>;
export type CanonicalPatchOp = z.infer<typeof CanonicalPatchOpSchema>;

export type AIResponse = z.infer<typeof AIResponseSchema>;
export type Patch = z.infer<typeof PatchSchema>;
export type PatchOp = z.infer<typeof PatchOpSchema>;
export type ChannelType = z.infer<typeof ChannelEnum>;
