import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { id, name, steps, preferred_window, enabled = true } = body as any;

        if (!name || !steps) {
            return apiError('Name and steps are required', 400);
        }

        const totalDuration = steps.reduce((sum: number, s: any) => sum + (Number(s.minutes) || 0), 0);

        try {
            const payload = {
                user_id: userId,
                name: name,
                steps: steps,
                action_duration_mins: totalDuration,
                preferred_window: preferred_window || 'morning',
                enabled: enabled,
                is_active: true,
                updated_at: new Date().toISOString()
            };

            let data, error;

            if (id) {
                // Update
                const result = await supabase
                    .from('habit_stacks')
                    .update(payload)
                    .eq('id', id)
                    .eq('user_id', userId)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            } else {
                // Insert
                const result = await supabase
                    .from('habit_stacks')
                    .insert({
                        ...payload,
                        current_streak: 0,
                        longest_streak: 0,
                        total_completions: 0
                    })
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            }

            if (error) throw error;

            return apiSuccess(data);

        } catch (e: any) {
            console.error('[habit_stacks_save] Error:', e);
            return apiError('Failed to save habit stack', 500);
        }
    },
    { requireAuth: true }
);
