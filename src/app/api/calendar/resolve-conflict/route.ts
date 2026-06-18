import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

// Request Schema
const ResolveConflictSchema = z.object({
    proposed_block: z.record(z.string(), z.any()),
    conflicting_blocks: z.array(z.record(z.string(), z.any()))
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        // 1. Zod Validation
        const validation = ResolveConflictSchema.safeParse(body);
        if (!validation.success) {
            return apiError(`Invalid Input: ${validation.error.message}`, 400);
        }

        const { proposed_block, conflicting_blocks } = validation.data;

        // Format dates for prompt context
        const dateStr = proposed_block.date || new Date().toISOString().split('T')[0];

        try {
            // 2. Fetch Deep Context
            const { buildFeatureContext } = await import('@/lib/services/feature-context');
            const featureCtx = await buildFeatureContext(userId, supabase, {
                includeChatHistory: false,

                includeHabitStacks: false,
                weekDays: 1
            });

            const allBlocks = featureCtx.schedule || [];
            const remainingBlocks = allBlocks.filter((b: any) => b.date === dateStr && b.status !== 'inbox' && b.status !== 'completed');
            const anchors = featureCtx.anchors;
            const prefs = featureCtx.preferences;

            // 3. Call AI Core
            const { executeAI } = await import('@/lib/ai/ai-service');

            const aiResponse = await executeAI(userId, {
                channel: 'calendar_resolve_conflict',
                input: `Resolve conflict for proposed block "${proposed_block.title || 'Untitled'}" on ${dateStr}.`,
                context: {
                    date: dateStr,
                    proposed_block,
                    conflicting_blocks,
                    remaining_blocks: remainingBlocks.map((b: any) => ({
                        id: b.id,
                        title: b.title || 'Untitled',
                        start_time: b.start_time,
                        end_time: b.end_time,
                        block_type: b.block_type || 'flex',
                        pillar: b.pillar
                    })),
                    profile: prefs,
                    anchors: anchors.map((a: any) => ({
                        title: a.title,
                        start_time: a.start_time,
                        end_time: a.end_time,
                        days_of_week: a.days_of_week
                    }))
                }
            });

            // 4. Return Options directly to User Interface
            const options = aiResponse?.options || [];
            if (options.length === 0) {
                return apiSuccess({
                    conflict: aiResponse?.conflict || { proposed_block, conflicting_blocks },
                    options: []
                });
            }

            return apiSuccess({
                conflict: aiResponse?.conflict || { proposed_block, conflicting_blocks },
                options: options
            });

        } catch (e: any) {
            console.error("[ResolveConflict] Unhandled Logic Error:", e);
            return apiError(`Conflict resolution failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);
