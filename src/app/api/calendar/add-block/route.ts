
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

        const systemPrompt = `You are a Master Scheduler and Conflict Resolver.
        Input: A proposed block that conflicts with the user's existing schedule.
        Goal: Provide 3 distinct, high-quality resolution strategies.

        STRATEGIES (Use these labels):
        1. "Shift": Move the NEW block to the nearest open slot (min change).
        2. "Squeeze": Shorten the conflicting block or the new block to fit (if it makes sense).
        3. "Shuffle": Move the CONFLICTING block to a later time to accommodate the new one.
        
        RULES:
        - Output STRICT JSON.
        - "description" must explicitly state the trade-off (e.g. "-15m duration" or "Moved to 5pm").
        - "label" should be action-oriented (e.g. "Shift Workout", "Squeeze Lunch").
        - Ensure "patch" contains all necessary 'update_event' or 'create_event' ops.
        - If a block is an ANCHOR, do not move it. Only the new block can move.
        
        OUTPUT SCHEMA:
        {
          "options": [
            { 
              "id": "shift",
              "label": "Shift [Block Name]", 
              "description": "Move to [Time]",
              "tags": ["⏱️ +30m shift"],
              "patch": { "ops": [], "undoable": true } 
            }
          ]
        }`;

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

            aiResponse = await JSONReliability.validateOrRepair(text, ConflictResolutionSchema, 'llama-3.3-70b-versatile', "conflict_resolution_v2");
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
