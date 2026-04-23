
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { ProfilePreferences } from '@/lib/types/settings';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const patch = body as Partial<ProfilePreferences>;

        // 1. Remove protected fields if any
        delete (patch as any).user_id;
        delete (patch as any).updated_at;

        // 2. Update Preferences
        const { data: updated, error } = await supabase
            .from('profile_preferences')
            .update(patch)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error("Settings update failed", error);
            return apiError('Failed to update settings', 500);
        }

        return apiSuccess({ preferences: updated });
    },
    { requireAuth: true }
);
