
import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, addDays, format, subDays } from 'date-fns';

export async function buildCoachContext(userId: string, supabase: SupabaseClient) {
    const today = startOfDay(new Date());
    const threeDaysLater = addDays(today, 3);
    const startStr = format(today, 'yyyy-MM-dd');
    const endStr = format(threeDaysLater, 'yyyy-MM-dd');

    // Parallel fetch for richness
    const [
        scheduleRes,
        goalsRes,
        anchorsRes,
        logsRes,
        profileRes
    ] = await Promise.all([
        // 1. Schedule (Next 3 days)
        supabase.from('schedule_blocks')
            .select('*, goal:goals(title, pillar)')
            .eq('user_id', userId)
            .gte('date', startStr)
            .lte('date', endStr)
            .neq('status', 'cancelled'), // Don't show cancelled

        // 2. Goals (Active)
        supabase.from('goals')
            .select('*')
            .eq('user_id', userId)
            .eq('is_paused', false),

        // 3. Anchors (Commitments) - Technically in schedule_blocks too if materialized, 
        // but fetching raw commitments helps distinguish "hard" constraints.
        supabase.from('commitments')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true),

        // 4. Recent Logs (Last 3 days for context)
        supabase.from('daily_logs')
            .select('date, energy_level, mood, notes')
            .eq('user_id', userId)
            .gte('date', format(subDays(today, 3), 'yyyy-MM-dd'))
            .order('date', { ascending: false })
            .limit(3),

        // 5. User Profile (Preferences)
        supabase.from('profile_preferences') // OR 'profiles' depending on schema
            .select('*')
            .eq('user_id', userId) // or id? usually user_id is the link
            .single()
    ]);

    // Construct simple context object
    return {
        now: new Date().toISOString(),
        schedule: scheduleRes.data || [],
        anchors: anchorsRes.data || [],
        goals: goalsRes.data || [],
        recentLogs: logsRes.data || [],
        userState: {
            preferences: profileRes.data || {},
            // We could add computed stats here like "accumulated fatigue"
        }
    };
}

export async function saveCoachMessage(
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    supabase: SupabaseClient,
    content_json?: any
) {
    // 1. Find or Create today's Thread? 
    // For simplicity, let's just use a single "Main" thread or create new one daily?
    // "Coach" usually is a continuous thread. Let's find the most recent active thread.

    // Check for existing thread
    const { data: threads } = await supabase
        .from('coach_threads')
        .select('id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);

    let threadId;
    if (threads && threads.length > 0) {
        threadId = threads[0].id;
    } else {
        const { data: newThread } = await supabase
            .from('coach_threads')
            .insert({ user_id: userId, title: 'General Coaching' })
            .select()
            .single();
        threadId = newThread.id;
    }

    // 2. Insert Message
    await supabase.from('coach_messages').insert({
        thread_id: threadId,
        user_id: userId,
        role,
        content,
        content_json
    });

    // 3. Touch Thread
    await supabase.from('coach_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
}
