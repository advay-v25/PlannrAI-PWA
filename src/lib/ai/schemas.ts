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
]);

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

export const RefusalSchema = z.object({
    reason: z.string().max(160),
    next_best: z.string().max(160).nullable().optional(),
});

export const AIResponseSchema = z.object({
    channel: ChannelEnum,
    summary: z.string().max(500).optional(), // Relaxed length and made optional as some use note
    note: z.string().optional(), // Added for brain_dump/goal_strategy
    explanation: z.string().optional(), // Added for coach
    mode: ModeEnum,
    options: z.array(OptionSchema).max(10).optional(), // Increased max options
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
