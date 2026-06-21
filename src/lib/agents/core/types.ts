import { z } from 'zod';
import type { Goal } from '@/types/database';

// --- SHARED PRIMITIVES ---

export type UserMode = 'survival' | 'maintenance' | 'growth';
type EnergyLevel = 1 | 2 | 3 | 4 | 5;
export type EmotionalState = 'overwhelmed' | 'avoidant' | 'coasting' | 'focused' | 'burnt' | 'motivated';

export interface UserState {
    energy_level: EnergyLevel;
    cognitive_load: 1 | 2 | 3; // 1=Low, 3=High
    emotional_bandwidth: 1 | 2 | 3;
    current_mode: UserMode;
    emotional_state: EmotionalState; // New Field
    last_updated: Date;
}

type BlockType = 'anchor' | 'body' | 'craft' | 'mind' | 'meal' | 'buffer';
type EnergyCost = 'low' | 'medium' | 'high';

export interface AgentContext {
    userId: string;
    now: Date;
    timezone: string;
    userState?: UserState; // Injected State
    currentSchedule?: any[]; // Snapshot of the day/week
    goals?: Goal[]; // Active goals
    todos?: any[]; // Mindspace tasks
    recentMemories?: any[]; // Recent chat/system logs
    recentSignals?: any[]; // Recent behavioral signals (rejections/acceptances)
    behaviorPatterns?: any; // Phase 4: Learned Preferences
}

// --- 1. PLANNER AGENT TYPES ---

// --- 1. PLANNER AGENT TYPES (DEEP SPEC) ---

export const PlannerIntentSchema = z.enum([
    'add_constraint',
    'reschedule',
    'rebuild_day',
    'rebuild_week',
    'reduce_intensity',
    'add_task',
    'clarify',
    'unknown'
]);

type PlannerIntent = z.infer<typeof PlannerIntentSchema>;

export const TimeRefSchema = z.object({
    start: z.string().nullable().optional(), // ISO or "HH:mm"
    end: z.string().nullable().optional(),
    duration_minutes: z.number().optional(),
    date: z.string().optional() // "YYYY-MM-DD"
});

export const PlannerOutputSchema = z.object({
    intent: PlannerIntentSchema,
    time_refs: z.array(TimeRefSchema).optional(),
    entities: z.object({
        target_event_hint: z.string().nullable().optional(),
        new_task_text: z.string().nullable().optional()
    }).optional(),
    scope: z.enum(['block', 'day', 'week']),
    urgency: z.enum(['low', 'medium', 'high']),
    requires_calendar_change: z.boolean(),
    strategy: z.enum(['move', 'swap', 'rebuild', 'compress', 'hide_low_priority', 'ask_sacrifice', 'none', 'add_constraint', 'add_task', 'shorten', 'cancel']),
    questions_needed: z.array(z.string()).optional()
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;


// --- 2. EMOTIONAL REGULATOR TYPES (DEEP SPEC) ---

export const RegulatorOutputSchema = z.object({
    response_mode: z.enum(['minimal', 'normal']),
    max_options: z.number().min(2).max(5),
    language_style: z.enum(['direct', 'neutral']),
    ask_questions: z.boolean(),
    warn_user: z.boolean(),
    tone_notes: z.string().optional() // Internal only
});

export type RegulatorOutput = z.infer<typeof RegulatorOutputSchema>;


// --- 3. SCHEDULER AGENT TYPES ---

export const CalendarChangeSchema = z.object({
    op: z.enum(['move', 'create', 'delete', 'update']),
    block_id: z.string().optional(),
    data: z.record(z.string(), z.any())
});

export const SacrificeSchema = z.object({
    type: z.enum(['delete', 'shorten', 'move']),
    block_id: z.string(),
    title: z.string(),
    description: z.string(),
    effect: z.enum(['minor', 'major'])
});

export interface Sacrifice extends z.infer<typeof SacrificeSchema> { }

export const CalendarPatchSchema = z.object({
    summary: z.string(),
    changes: z.array(CalendarChangeSchema),
    requires_confirmation: z.boolean(),
    warnings: z.array(z.string()).optional(),
    sacrifices: z.array(SacrificeSchema).optional()
});

export type CalendarPatch = z.infer<typeof CalendarPatchSchema>;

export const SchedulerOptionSchema = z.object({
    id: z.string(),
    label: z.string(),
    patch: CalendarPatchSchema, // The structured wrapper
    confidence_score: z.number()
});

export const SchedulerOutputSchema = z.object({
    options: z.array(SchedulerOptionSchema),
    impossible: z.boolean().default(false),
    sacrifice_needed: z.array(SacrificeSchema).optional()
});

export type SchedulerOutput = z.infer<typeof SchedulerOutputSchema>;


// --- 4. VALIDATOR AGENT TYPES ---

export const ValidatorOutputSchema = z.object({
    valid: z.boolean(),
    reason: z.string().optional(),
    required_action: z.enum(['none', 'sacrifice', 'clarify']).default('none'),
    sacrifices: z.array(SacrificeSchema).optional()
});

export type ValidatorOutput = z.infer<typeof ValidatorOutputSchema>;
