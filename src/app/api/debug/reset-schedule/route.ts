import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

const ResetSchema = z.object({
    confirm: z.boolean(),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        const validation = ResetSchema.safeParse(body);
        if (!validation.success || !validation.data.confirm) {
            return apiError('Must confirm reset', 400);
        }

        try {
            // Delete all schedule blocks for the user
            const { count, error } = await supabase
                .from('schedule_blocks')
                .delete({ count: 'exact' })
                .eq('user_id', userId);

            if (error) throw error;

            return apiSuccess({
                message: `Successfully wiped ${count || 0} schedule blocks.`,
                deleted_count: count,
            });
        } catch (e: any) {
            console.error('[ResetSchedule] Error:', e);
            return apiError(`Failed to reset schedule: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);
