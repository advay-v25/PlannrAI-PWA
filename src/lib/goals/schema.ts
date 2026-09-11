/**
 * The ONE contract for what a goal may contain.
 *
 * There were two ways to write a goal and they disagreed. `api/goals/route.ts`
 * validated `importance` and `category` against strict enums; the
 * `PatchService.update_goal` path — used by the coach and (until Prompt 37) the
 * weekly review — validated nothing and wrote whatever it was handed.
 *
 * MEASURED against the live database, because these values have to match the
 * columns rather than anyone's assumption:
 *
 *   importance     text, CHECK (low|medium|high)      — a numeric write is REJECTED
 *   category       text, CHECK (mind|body|craft)      — 'soul' is REJECTED
 *   pillar         text, CHECK (mind|body|craft)      — 'soul' is REJECTED
 *   energy_demand  text, CHECK (light|medium|heavy)   — 'high'/'low' are REJECTED
 *   status         text, no constraint                — 'paused'/'archived' accepted
 *
 * `normalizeImportance` (context-builder.ts) turns importance into a NUMBER for
 * the scheduler, but only in memory — nothing writes it back, and the database
 * would refuse if anything tried.
 */

import { z } from 'zod';

export const GOAL_IMPORTANCE = ['low', 'medium', 'high'] as const;
export const GOAL_CATEGORIES = ['mind', 'body', 'craft'] as const;
export const GOAL_ENERGY = ['light', 'medium', 'heavy'] as const;

/** Every field any writer may set, validated the same way for all of them. */
export const GoalWritableSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    category: z.enum(GOAL_CATEGORIES).optional(),
    pillar: z.enum(GOAL_CATEGORIES).optional(),
    importance: z.enum(GOAL_IMPORTANCE).optional(),
    energy_demand: z.enum(GOAL_ENERGY).optional(),
    minutes_per_day: z.number().min(5).max(1440).optional(),
    days_per_week: z.number().min(1).max(7).optional(),
    weekly_target_minutes: z.number().optional(),
    is_paused: z.boolean().optional(),
    is_active: z.boolean().optional(),
    is_archived: z.boolean().optional(),
    status: z.enum(['active', 'paused', 'archived', 'completed']).optional(),
    priority: z.number().optional(),
    color: z.string().optional(),
    emoji: z.string().optional(),
    sort_order: z.number().optional(),
    start_date: z.string().optional(),
    target_date: z.string().optional(),
    constraints: z.record(z.string(), z.unknown()).optional(),
    non_negotiables: z.array(z.string()).optional(),
    time_commitment_mins: z.number().optional(),
    milestone_progress: z.number().optional(),
    ai_strategy: z.unknown().optional(),
    preferred_windows: z
        .object({ time_of_day: z.enum(['morning', 'afternoon', 'evening', 'flexible']) })
        .nullable()
        .optional(),
});

export type GoalWritableFields = z.infer<typeof GoalWritableSchema>;

/**
 * Validate a partial goal write. Returns the accepted fields, or the names of
 * the ones refused — so a caller can tell the user WHAT failed rather than
 * silently dropping it, which is how a rejected write comes to look like a lock.
 */
export function validateGoalFields(
    fields: Record<string, unknown>
): { ok: true; data: GoalWritableFields } | { ok: false; errors: string[] } {
    const parsed = GoalWritableSchema.safeParse(fields);
    if (parsed.success) return { ok: true, data: parsed.data };
    const errors = parsed.error.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`);
    return { ok: false, errors };
}

/**
 * Coerce a stored value back into contract, for repairing rows written before
 * this contract existed. Returns null when the value is already valid.
 */
export function repairGoalValue(field: string, value: unknown): string | null {
    const s = String(value ?? '').toLowerCase();
    if (field === 'importance') {
        if ((GOAL_IMPORTANCE as readonly string[]).includes(s)) return null;
        const n = Number(value);
        if (Number.isFinite(n)) return n >= 8 ? 'high' : n <= 3 ? 'low' : 'medium';
        return 'medium';
    }
    if (field === 'category' || field === 'pillar') {
        if ((GOAL_CATEGORIES as readonly string[]).includes(s)) return null;
        if (s === 'future') return 'craft';   // predates the pillar rename
        if (s === 'soul') return 'mind';      // no 'soul' value exists in the column
        return 'craft';
    }
    if (field === 'energy_demand') {
        if ((GOAL_ENERGY as readonly string[]).includes(s)) return null;
        if (s === 'high') return 'heavy';
        if (s === 'low') return 'light';
        return 'medium';
    }
    return null;
}
