
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

export class SchedulerService {
    constructor(private supabase: SupabaseClient<Database>) { }

    async getContext(userId: string, date: string) {
        // 1. Fetch Preferences (Source of Truth for Constraints)
        const { data: prefs } = await this.supabase
            .from('profile_preferences')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Fallback if migration hasn't run or user is new (though /profile/me bootstraps)
        // We should probably rely on the preferences being there.

        // 2. Fetch Existing Blocks
        const { data: blocks } = await this.supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .order('start_time');

        // 3. Fetch Goals
        const { data: goals } = await this.supabase
            .from('goals')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active');

        return {
            preferences: prefs,
            blocks: blocks || [],
            goals: goals || []
        };
    }

    // ... rest of service
}
