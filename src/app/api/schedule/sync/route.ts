import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const SyncSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    blocks: z.array(z.any()), // Loose validation here, strict on type mapping
});

export const POST = secureApiRoute(
    async (context, body) => {
        const result = SyncSchema.safeParse(body);
        if (!result.success) return apiError("Invalid format", 400);

        const { date, blocks } = result.data;
        const supabase = await createClient();

        // 1. Delete existing non-fixed/completed blocks for this date
        // Note: Strategy decision - do we wipe everything? 
        // For "Optimize Day", we usually want to wipe planned/flex blocks but keep 'done' and maybe 'anchors' if they match?
        // Let's assume the Client sends the *Entire* derived schedule.

        // Safer approach: Delete 'planned' blocks for this day, then insert new ones.
        // But what if we moved an anchor?
        // Let's go with a full wipe of 'planned', 'missed', 'flex' for this day.

        const { error: deleteError } = await supabase
            .from('schedule_blocks')
            .delete()
            .eq('user_id', context.userId)
            .eq('date', date)
            .neq('status', 'done'); // Keep completed tasks history

        if (deleteError) throw deleteError;

        // 2. Insert new blocks
        if (blocks.length > 0) {
            const cleanBlocks = blocks.map((b: any) => ({
                user_id: context.userId,
                date: date,
                start_time: b.start_time,
                end_time: b.end_time,
                title: b.title || b.context || 'Untitled',
                context: b.context || b.title,
                block_type: b.block_type || 'flex',
                status: b.status || 'planned',
                goal_id: b.goal_id
            }));

            const { data, error: insertError } = await supabase
                .from('schedule_blocks')
                .insert(cleanBlocks)
                .select();

            if (insertError) throw insertError;
            return apiSuccess({ success: true, blocks: data });
        }

        return apiSuccess({ success: true, blocks: [] });
    },
    { requireAuth: true, auditAction: 'schedule_sync' }
);
