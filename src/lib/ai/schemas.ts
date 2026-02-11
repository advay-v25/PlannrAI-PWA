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
    "goal_decomposition",
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
    reason: z.string().max(140).optional(),
});

export const OptionSchema = z.object({
    id: z.string().min(1),
    title: z.string().max(40),
    impact: z.string().max(80),
    patch: PatchSchema,
});

export const QuestionSchema = z.object({
    prompt: z.string().max(120),
    type: z.enum(["time", "choice", "number", "text"]),
    choices: z.array(z.string()).max(12).optional(),
});

export const RefusalSchema = z.object({
    reason: z.string().max(120),
    next_best: z.string().max(120).nullable().optional(),
});

export const AIResponseSchema = z.object({
    channel: ChannelEnum,
    summary: z.string().max(120),
    mode: ModeEnum,
    options: z.array(OptionSchema).max(3).optional(),
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

export type AIResponse = z.infer<typeof AIResponseSchema>;
export type Patch = z.infer<typeof PatchSchema>;
export type PatchOp = z.infer<typeof PatchOpSchema>;
export type ChannelType = z.infer<typeof ChannelEnum>;
