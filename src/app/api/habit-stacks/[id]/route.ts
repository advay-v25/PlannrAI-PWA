import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

// DELETE - Delete a habit stack
export const DELETE = secureApiRoute(
    async (context) => {
        const id = context.request.nextUrl.pathname.split('/').pop();

        if (!id) {
            return apiError('Missing habit stack ID', 400);
        }

        const supabase = await createClient();

        const { error } = await supabase
            .from('habit_stacks')
            .delete()
            .eq('id', id)
            .eq('user_id', context.userId);

        if (error) {
            return apiError('Failed to delete habit stack', 500);
        }

        return apiSuccess({ success: true });
    },
    { requireAuth: true, auditAction: 'habit_stack_delete' }
);
