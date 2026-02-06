import { z } from 'zod';

/**
 * Calendar Patch Contract - Strict Runtime Validation
 * 
 * This file replaces the loose TypeScript interfaces with strict Zod schemas.
 * It serves as the single source of truth for all Coach-Calendar interactions.
 */

// ============================================
// PRIMITIVE TYPES
// ============================================

const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS");
const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const DateTimeStringSchema = z.string().datetime({ message: "Must be ISO 8601 DateTime" });

// ============================================
// PATCH OPERATIONS
// ============================================

export const PatchOpSchema = z.enum([
    'CREATE_ANCHOR',
    'CREATE_BLOCK', // For Undo/Restore
    'MOVE',
    'RESIZE',
    'HIDE',
    'CANCEL',
    'UPDATE'
]);

// Discriminated Union for strict type narrowing based on 'op'
export const PatchChangeSchema = z.discriminatedUnion('op', [
    // 1. CREATE_ANCHOR
    z.object({
        op: z.literal('CREATE_ANCHOR'),
        title: z.string().min(1, "Title is required"),
        start_ts: DateTimeStringSchema,
        end_ts: DateTimeStringSchema,
        locked: z.boolean().default(true),
        // Goal Linking
        goal_id: z.string().uuid().optional(),
        block_type: z.enum(['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down']).optional(),
        notes: z.string().optional(),
        // Optional recurrence rules for the anchor
        recurrence: z.array(z.number().min(0).max(6)).optional()
    }).refine(data => data.end_ts > data.start_ts, {
        message: "End time must be after start time",
        path: ['end_ts']
    }),

    // 2. CREATE_BLOCK (For Restore/Undo)
    z.object({
        op: z.literal('CREATE_BLOCK'),
        title: z.string().min(1),
        start_ts: DateTimeStringSchema,
        end_ts: DateTimeStringSchema,
        goal_id: z.string().uuid().optional(),
        block_type: z.string().optional(),
        status: z.string().default('planned'),
        context: z.string().optional()
    }),

    // 3. MOVE
    z.object({
        op: z.literal('MOVE'),
        event_id: z.string().uuid("Invalid block ID"),
        new_start_ts: DateTimeStringSchema,
        new_end_ts: DateTimeStringSchema
    }).refine(data => data.new_end_ts > data.new_start_ts, {
        message: "New end time must be after new start time",
        path: ['new_end_ts']
    }),

    // 4. RESIZE
    z.object({
        op: z.literal('RESIZE'),
        event_id: z.string().uuid("Invalid block ID"),
        duration_minutes: z.number().min(5, "Minimum duration is 5 minutes")
    }),

    // 5. HIDE (Soft Delete / Skip)
    z.object({
        op: z.literal('HIDE'),
        event_id: z.string().uuid("Invalid block ID")
    }),

    // 6. CANCEL (Hard Delete)
    z.object({
        op: z.literal('CANCEL'),
        event_id: z.string().uuid("Invalid block ID")
    }),

    // 7. UPDATE (Status/Context)
    z.object({
        op: z.literal('UPDATE'),
        event_id: z.string().uuid("Invalid block ID"),
        fields: z.object({
            status: z.enum(['planned', 'done', 'missed', 'partial']).optional(),
            context: z.string().optional(),
            title: z.string().optional()
        })
    })
]);

// ============================================
// SACRIFICE & IMPACT
// ============================================

export const SacrificeSchema = z.object({
    id: z.string(),
    label: z.string(),
    effect: z.string(),
    affected_blocks: z.array(z.string()).optional()
});

// ============================================
// FULL PATCH
// ============================================

export const CalendarPatchSchema = z.object({
    summary: z.string().describe("Human-readable one-liner"),
    affected_date: DateStringSchema,
    changes: z.array(PatchChangeSchema).min(1, "Patch must contain at least one change"),
    requires_confirmation: z.boolean().default(true),
    warnings: z.array(z.string()).default([]),
    sacrifices: z.array(SacrificeSchema).default([]),
    // Metadata
    reasoning: z.string().optional(),
    confidence_score: z.number().min(0).max(1).optional(),
    source: z.enum(['coach', 'calendar', 'brain_dump', 'system']).default('coach')
});

// ============================================
// COACH INTERACTION TYPES
// ============================================

export const CoachActionTypeSchema = z.enum([
    'move_single',
    'swap',
    'rebuild_day',
    'hide_low',
    'create_anchor',
    'sacrifice',
    'undo' // New: Undo support
]);

export const CoachOptionSchema = z.object({
    id: z.string(),
    label: z.string().max(60, "Label too long"),
    action_type: CoachActionTypeSchema,
    preview: z.string().optional(),
    requires_input: z.boolean().default(false),
    // Payload to reconstruct intent without re-parsing
    intent_payload: z.record(z.string(), z.any()).optional()
});

export const CoachPlanResponseSchema = z.object({
    acknowledgment: z.string(),
    options: z.array(CoachOptionSchema).min(1).max(5),
    context: z.object({
        affected_blocks: z.array(z.string()).default([]),
        busy_time: z.string().optional(),
        busy_duration_mins: z.number().optional()
    }).optional()
});

// ============================================
// EXPORTED TYPES (Inferred)
// ============================================

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type PatchChange = z.infer<typeof PatchChangeSchema>;
export type CalendarPatch = z.infer<typeof CalendarPatchSchema>;
export type CoachOption = z.infer<typeof CoachOptionSchema>;
export type CoachPlanResponse = z.infer<typeof CoachPlanResponseSchema>;
export type Sacrifice = z.infer<typeof SacrificeSchema>;

// ============================================
// IMMUTABILITY LOGIC (Pure Function)
// ============================================

export const IMMUTABLE_BLOCK_TYPES = ['anchor', 'sleep', 'wind_down', 'meal', 'routine'] as const;

export function isImmutable(block: {
    block_type?: string | null;
    locked?: boolean;
    commitment_id?: string | null;
}): boolean {
    if (block.locked) return true;
    if (block.commitment_id) return true;
    if (block.block_type && IMMUTABLE_BLOCK_TYPES.includes(block.block_type as any)) return true;
    return false;
}
