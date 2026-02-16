import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database, Profile } from '@/types/database';
import { startOfDay, parseISO } from 'date-fns';

import { PlanWeekService, SchedulerContext } from '@/lib/calendar/plan-week-service';

export class SchedulerService {
    private context: SchedulerContext;

    constructor(context: SchedulerContext) {
        this.context = context;
    }

    /**
     * Generates a baseline schedule using deterministic logic.
     * Delegates to PlanWeekService for the heavy lifting.
     */
    async generateBaseline() {
        const result = await PlanWeekService.generateScheduleFromContext(this.context, this.context.weekStart);

        // Extract blocks from the patch changes
        // The result.patch.changes contains 'create_event' ops with payload being the block
        const blocks = result.patch.changes
            .filter((c: any) => c.op === 'create_event')
            .map((c: any) => c.payload);

        return blocks;
    }

    static async getContext(userId: string, date: string, supabase: SupabaseClient<Database>) {
        // 1. Fetch Profile & Preferences (Source of Truth for Constraints)
        // We need both because SchedulerContext expects a rich Profile object
        const [prefsRes, profileRes] = await Promise.all([
            supabase.from('profile_preferences').select('*').eq('user_id', userId).single(),
            supabase.from('profiles').select('*').eq('id', userId).single()
        ]);

        const prefs = prefsRes.data;
        const profileData = profileRes.data;

        // 2. Fetch Existing Blocks
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .order('start_time');

        // 3. Fetch Goals
        const { data: goals } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active');

        // 4. Fetch Commitments
        const { data: commitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);

        // Merge profile data to satisfy valid Profile type
        const fullProfile = {
            ...profileData,
            ...prefs
        } as unknown as Profile;

        return {
            userId,
            weekStart: startOfDay(parseISO(date)),
            profile: fullProfile,
            existingBlocks: blocks || [],
            goals: goals || [],
            commitments: commitments || []
        } as SchedulerContext;
    }
}
