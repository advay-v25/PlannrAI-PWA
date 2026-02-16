
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { ChannelRegistry } from '@/lib/ai/registry';
import { ConflictResolutionSchema } from '@/lib/ai/schemas';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { getConflicts } from '@/lib/scheduler/conflict-utils'; // Need to implement this

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { block } = body as { block: any };

        if (!block || !block.start_time || !block.end_time || !block.date) {
            return apiError('Invalid block data', 400);
        }

        // 1. Fetch Day's Blocks
        const { data: existingBlocks, error } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', block.date);

        if (error) return apiError('Failed to fetch schedule', 500);

        // 2. Check overlap
        const conflicts = getConflicts(block, existingBlocks);

        // 3. No Conflict -> Insert
        if (conflicts.length === 0) {
            const { data, error: insertError } = await supabase.from('schedule_blocks').insert({
                user_id: userId,
                ...block,
                status: 'planned'
            }).select().single();

            if (insertError) return apiError('Failed to create block', 500);
            return apiSuccess({ success: true, block: data });
        }

        // 4. Conflict Detected -> AI Resolution
        const aiContext = {
            new_block: block,
            conflicting_blocks: conflicts,
            all_blocks_today: existingBlocks
        };

        const systemPrompt = `You are the Conflict Resolver.
        Proposed block '${block.title}' (${block.start_time}-${block.end_time}) overlaps with existing blocks.
        Propose 2-3 options to resolve this.
        
        OPTIONS:
        1. Move conflicting block.
        2. Move new block.
        3. Shrink blocks.
        
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
                    label: "Cancel",
                    description: "Do not add the block.",
                    patch: { ops: [], undoable: false }
                }]
            };
        }

        return apiSuccess({
            success: false,
            conflict: true,
            conflicts, // Return raw conflicts for UI highlight
            resolution_options: aiResponse.options
        });
    },
    { requireAuth: true }
);
