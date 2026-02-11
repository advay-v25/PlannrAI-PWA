import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const GoalSyncSchema = z.object({
    operation: z.enum(['create', 'update', 'delete', 'pause', 'resume']),
    goal_id: z.string().optional(),
    payload: z.any().optional()
});

export const POST = secureApiRoute(
    async (context, body) => {
        const result = GoalSyncSchema.safeParse(body);
        if (!result.success) return apiError('Invalid schema', 400);

        const { operation, goal_id, payload } = result.data;
        const supabase = await createClient();

        // 1. Perform DB Operation
        if (operation === 'create') {
            const { error } = await supabase.from('goals').insert({ ...payload, user_id: context.userId });
            if (error) throw error;
        } else if (operation === 'update') {
            const { error } = await supabase.from('goals').update(payload).eq('id', goal_id);
            if (error) throw error;
        } else if (operation === 'delete') {
            const { error } = await supabase.from('goals').delete().eq('id', goal_id);
            if (error) throw error;
        } else if (operation === 'pause') {
            const { error } = await supabase.from('goals').update({ status: 'paused', is_paused: true }).eq('id', goal_id);
            if (error) throw error;
        } else if (operation === 'resume') {
            const { error } = await supabase.from('goals').update({ status: 'active', is_paused: false }).eq('id', goal_id);
            if (error) throw error;
        }

        // 2. Trigger Reflow (Optimistic or Async?)
        // For MVP, if operation affects capacity (minutes, status), we should ideally re-patch visibility.
        // We will call the Patch Service to "Reflow" or "Regenerate" future blocks for this goal.
        // BUT, adhering to "Goals -> Patch" rule:
        // We need to invalidate the schedule for this goal if modified.

        // If DELETE/PAUSE -> Remove future blocks for this goal
        if (['delete', 'pause'].includes(operation) && goal_id) {
            await supabase.from('schedule_blocks')
                .delete()
                .eq('goal_id', goal_id)
                .gte('start_time', new Date().toISOString());
        }

        // If RESUME/CREATE/UPDATE -> We might need to auto-schedule?
        // "Editing a goal must reflow future schedule" -> implies auto-schedule.
        // For now, return success and let Frontend call "Auto-Schedule" explicitly or via a separate hook if we want magic.
        // The user requirement says "Editing a goal must reflow future schedule".
        // Let's minimally trigger a "cleanup" of invalid blocks (e.g. if duration changed, current blocks are wrong).

        if (operation === 'update' && goal_id && payload.minutes_per_day) {
            // Remove future blocks so they can be regenerated (simple reflow)
            // or mark them as 'needs_review'?
            // "Reflow" implies shifting.
            // Simplest "Reflow" = Delete future + Suggest new.
            // Let's just Delete Future blocks for now to force regeneration, 
            // ensuring "Resuming/Editing" cleans slate.
            await supabase.from('schedule_blocks')
                .delete()
                .eq('goal_id', goal_id)
                .gte('start_time', new Date().toISOString());
        }

        return apiSuccess({ success: true, operation });
    },
    { requireAuth: true }
);
