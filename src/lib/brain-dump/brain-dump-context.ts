
import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, addDays, format } from 'date-fns';

export async function buildBrainDumpContext(userId: string, supabase: SupabaseClient) {
    const today = startOfDay(new Date());
    const threeDaysLater = addDays(today, 3);
    const startStr = format(today, 'yyyy-MM-dd');
    const endStr = format(threeDaysLater, 'yyyy-MM-dd');

    // Parallel fetch for richness
    const [
        scheduleRes,
        goalsRes,
        anchorsRes,
        userStateRes,
        recentDumpsRes,
        prefsRes
    ] = await Promise.all([
        // 1. Schedule (Next 3 days)
        supabase.from('schedule_blocks')
            .select('id, title, start_time, end_time, is_focus, pillar, date')
            .eq('user_id', userId)
            .gte('date', startStr)
            .lte('date', endStr)
            .neq('status', 'cancelled')
            .limit(50),

        // 2. Goals (Active)
        supabase.from('goals')
            .select('id, title, category, importance')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(10),

        // 3. Anchors (Commitments)
        supabase.from('commitments')
            .select('id, title, start_time, end_time, days_of_week')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(20),

        // 4. User State (Energy/Emotion)
        supabase.from('user_state')
            .select('energy_level, current_mood')
            .eq('user_id', userId)
            .single(),

        // 5. Recent Dumps (Context of past thoughts)
        supabase.from('brain_dumps')
            .select('content, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(3),

        // 6. Preferences (Constraints)
        supabase.from('profile_preferences')
            .select('*')
            .eq('user_id', userId)
            .single()
    ]);

    // Construct simple context object
    return {
        now: new Date().toISOString(),
        schedule: scheduleRes.data || [],
        anchors: anchorsRes.data || [],
        goals: goalsRes.data || [],
        userState: userStateRes.data || {},
        preferences: prefsRes.data || {},
        recentDumps: recentDumpsRes.data?.map(d => d.content) || []
    };
}
