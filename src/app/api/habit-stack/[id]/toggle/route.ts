import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { isPreviewEnabled } from '@/lib/featureFlags';

export const POST = secureApiRoute(
    async (context, body) => {
        if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);
        const { userId, supabase, request } = context;
        
        // Extract ID from URL since it's a dynamic route like /api/habit-stack/[id]/toggle
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        const idIndex = pathParts.indexOf('habit-stack') + 1;
        const id = pathParts[idIndex];

        if (!id || id === 'toggle') return apiError('Missing habit stack ID', 400);

        // Fetch current stack
        const { data: stack, error: fetchError } = await supabase
            .from('habit_stacks')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !stack) return apiError(fetchError?.message || 'Habit stack not found');

        // Logic to update streak
        const newStreak = (stack.current_streak || 0) + 1;
        const newTotal = (stack.total_completions || 0) + 1;
        const newLongest = Math.max(stack.longest_streak || 0, newStreak);

        const { data, error } = await supabase
            .from('habit_stacks')
            .update({
                current_streak: newStreak,
                total_completions: newTotal,
                longest_streak: newLongest,
                last_completed: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) return apiError(error.message);
        return apiSuccess({ data });
    }
);
