
import { z } from 'zod';
import { CalendarPatchSchema } from '@/lib/validation/calendar-contract';

export const BrainDumpSignalType = z.enum(['constraint', 'deviation', 'task', 'idea']);
export type BrainDumpSignalType = z.infer<typeof BrainDumpSignalType>;

export const ScoredSignalSchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()),
    type: BrainDumpSignalType,
    description: z.string(),
    confidence: z.number().min(0).max(1),
    // If this signal maps to a calendar action, here is the proposal
    suggested_patch: CalendarPatchSchema.optional(),
    // Metadata for UI
    metadata: z.record(z.string(), z.any()).optional()
});

export type ScoredSignal = z.infer<typeof ScoredSignalSchema>;

export const BrainDumpAnalysisSchema = z.object({
    summary: z.string(),
    sentiment: z.enum(['positive', 'neutral', 'negative', 'overwhelmed', 'energetic']),
    // Extracted entities
    signals: z.array(ScoredSignalSchema),
    // immediate actions recommended
    recommended_actions: z.array(z.object({
        label: z.string(),
        patch: CalendarPatchSchema,
        reasoning: z.string()
    }))
});

export type BrainDumpAnalysis = z.infer<typeof BrainDumpAnalysisSchema>;
