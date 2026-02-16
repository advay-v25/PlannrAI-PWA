
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { ChannelRegistry } from '@/lib/ai/registry';
import { ConflictResolutionSchema } from '@/lib/ai/schemas';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { getConflicts } from '@/lib/scheduler/conflict-utils';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { block_id, new_start_time, new_end_time, new_date } = body as {
            block_id: string;
            new_start_time: string;
            new_end_time: string;
            new_date?: string
        };

        if (!block_id || !new_start_time || !new_end_time) {
            return apiError('Invalid move data', 400);
        }

        // 1. Fetch Target Day's Blocks + The Block to Move
        const targetDate = new_date || new Date().toISOString().split('T')[0]; // Simplify if date not passed

        const { data: existingBlocks, error } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', targetDate);

        if (error) return apiError('Failed to fetch schedule', 500);

        const movingBlock = existingBlocks.find((b: any) => b.id === block_id);
        if (!movingBlock) {
            // Maybe it's not loaded in existingBlocks if date changed?
            // Fetch specifically if not found
            const { data: checkBlock } = await supabase.from('schedule_blocks').select('*').eq('id', block_id).single();
            if (!checkBlock) return apiError('Block not found', 404);
            // Verify ownership
            if (checkBlock.user_id !== userId) return apiError('Unauthorized', 403);

            // If date changed, we need blocks for target date (already fetched)
        }

        // 2. Check overlap
        const tempBlock = {
            id: block_id,
            start_time: new_start_time,
            end_time: new_end_time,
            title: movingBlock?.title || 'Moving Block'
        };

        const conflicts = getConflicts(tempBlock, existingBlocks);

        // 3. No Conflict -> Update directly
        // Note: For consistency, should we use apply-patch internally? 
        // Yes, but for performance, direct update is fine if no conflict.

        if (conflicts.length === 0) {
            const updates: any = {
                start_time: new_start_time,
                end_time: new_end_time,
                status: 'planned' // Reset status on move? Or keep 'missed'? Usually 'planned'.
            };
            if (new_date) updates.date = new_date;

            const { data, error: updateError } = await supabase.from('schedule_blocks')
                .update(updates)
                .eq('id', block_id)
                .eq('user_id', userId)
                .select().single();

            if (updateError) return apiError('Failed to move block', 500);
            return apiSuccess({ success: true, block: data });
        }

        // 4. Conflict Detected -> AI Resolution
        const aiContext = {
            moving_block: tempBlock,
            conflicting_blocks: conflicts,
            all_blocks_target_day: existingBlocks
        };

        const systemPrompt = `You are the Conflict Resolver.
        Moving block '${tempBlock.title}' to ${new_start_time}-${new_end_time} causes overlap.
        Propose solutions.
        
        OUTPUT JSON:
        { "options": [{ "label": "string", "description": "string", "patch": { "ops": [ ... ], "undoable": true } }] }`;

        let aiResponse;
        try {
            const text = await groqChat({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(aiContext) }
                ],
                userId,
                temperature: 0.3
            });

            aiResponse = await JSONReliability.validateOrRepair(text, ConflictResolutionSchema, 'llama-3.3-70b-versatile', "conflict resolution");
        } catch (e) {
            console.error("Conflict Resolution failed", e);
            aiResponse = {
                options: [{
                    label: "Cancel Move",
                    description: "Revert changes.",
                    patch: { ops: [], undoable: false }
                }]
            };
        }

        return apiSuccess({
            success: false,
            conflict: true,
            conflicts,
            resolution_options: aiResponse.options
        });
    },
    { requireAuth: true }
);
