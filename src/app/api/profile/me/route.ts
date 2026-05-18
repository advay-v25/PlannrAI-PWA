
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_PREFERENCES } from '@/lib/types/settings';

export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const { userId } = context;

        // 1. Fetch Profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            return apiError('Profile not found', 404);
        }

        // 2. Fetch Preferences
        let { data: preferences, error: prefError } = await supabase
            .from('profile_preferences')
            .select('*')
            .eq('user_id', userId)
            .single();

        // 3. Auto-Bootstrap if missing
        if (!preferences && (prefError?.code === 'PGRST116' || !prefError)) { // PGRST116 is "Row not found"
            console.log("Bootstrapping preferences for user", userId);
            const { data: newPrefs, error: insertError } = await supabase
                .from('profile_preferences')
                .insert({
                    user_id: userId,
                    ...DEFAULT_PREFERENCES
                })
                .select()
                .single();

            if (insertError) {
                console.error("Failed to bootstrap preferences", insertError);
                return apiError('Failed to initialize settings', 500);
            }
            preferences = newPrefs;
        } else if (prefError) {
            console.error("Error fetching preferences", prefError);
            return apiError('Failed to fetch settings', 500);
        }

        // 4. Fetch Habit Stacks Summary (for dropdowns)
        const { data: stacks } = await supabase
            .from('habit_stacks')
            .select('id, name, duration_min')
            .eq('user_id', userId)
            .eq('is_active', true);

        const { data: userData } = await supabase.auth.getUser();

        return apiSuccess({
            profile: {
                ...profile,
                email: userData?.user?.email
            },
            preferences,
            habit_stacks_summary: stacks || [],
            integrations_status: {
                google_calendar: preferences?.calendar_integration_enabled || false
                // In real app, we'd check auth tokens/provider status
            }
        });
    },
    { requireAuth: true }
);
