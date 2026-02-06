import { createClient } from '@/lib/supabase/server';
import { AgentContext } from './core/types';
import { startOfDay, endOfDay } from 'date-fns';
import { SupabaseClient } from '@supabase/supabase-js';
import { StateService } from '@/lib/user-state/state-service';

export class ContextBuilder {
    static async build(userId: string, injectedClient?: SupabaseClient): Promise<AgentContext> {
        const supabase = injectedClient ?? await createClient(); // Use injected or default

        // 1. Fetch Profile (Timezone, Preferences)
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // 2. Refresh & Fetch User State (The Brain Stem)
        const userState = await StateService.refreshState(userId, supabase);

        // 3. Fetch Schedule (Today + Tomorrow approx)
        const now = new Date();
        const { data: events } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('start_time', startOfDay(now).toISOString())
            .lte('end_time', endOfDay(now).toISOString());

        // 4. Fetch Goals
        // (Optional for Phase 1 MVP)

        return {
            userId,
            now,
            timezone: profile?.timezone || 'UTC',
            userState, // Injected!
            currentSchedule: events || []
        };
    }
}
