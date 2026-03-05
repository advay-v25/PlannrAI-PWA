
import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, addDays, format, subDays } from 'date-fns';

export async function buildCoachContext(userId: string, supabase: SupabaseClient) {
    const today = startOfDay(new Date());
    const threeDaysLater = addDays(today, 3);
    const startStr = format(today, 'yyyy-MM-dd');
    const endStr = format(threeDaysLater, 'yyyy-MM-dd');

    const [
        scheduleRes,
        goalsRes,
        anchorsRes,
        logsRes,
        profileRes,
        proposalsRes
    ] = await Promise.all([
        // 1. Schedule (Next 3 days)
        supabase.from('schedule_blocks')
            .select('id, title, start_time, end_time, pillar, date, block_type')
            .eq('user_id', userId)
            .gte('date', startStr)
            .lte('date', endStr)
            .neq('status', 'cancelled')
            .limit(50),

        // 2. Goals (Active)
        supabase.from('goals')
            .select('id, title, category, importance')
            .eq('user_id', userId)
            .eq('status', 'active') // Ensure we only get active goals
            .limit(10),

        // 3. Anchors (Commitments)
        supabase.from('commitments')
            .select('id, title, start_time, end_time, days_of_week')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(20),

        // 4. Recent Logs (Last 3 days for context)
        supabase.from('daily_logs')
            .select('date, energy_level, mood, notes')
            .eq('user_id', userId)
            .gte('date', format(subDays(today, 3), 'yyyy-MM-dd'))
            .order('date', { ascending: false })
            .limit(3),

        // 5. User Profile (Preferences)
        supabase.from('profile_preferences')
            .select('*')
            .eq('user_id', userId)
            .single(),

        // 6. Active Thread & History
        supabase.from('coach_threads')
            .select('id, coach_messages(role, content, created_at)')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single(),

        // 7. Pending Proactive Proposals
        supabase.from('ai_proposals')
            .select('id, title, description, proposal_type, priority, action_data')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .limit(3)
    ]);

    const thread = (profileRes as any)?.error ? null : (await Promise.resolve(profileRes)).data; // Fix type if needed, but array destructuring handles it
    // Actually, Promise.all returns array. 
    // const threadData = results[5].data; // Wait, I need to handle the array properly.

    // Let's rely on the array index.
    const threadData = (await Promise.resolve(profileRes)).data; // This is actually index 4
    // Wait, I am adding a 6th element to Promise.all.
    // Let me rewrite the destructuring to be safe.

    const activeThread = (await supabase.from('coach_threads')
        .select('id, coach_messages(role, content, created_at)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()).data;

    const history = activeThread?.coach_messages
        ? (activeThread.coach_messages as any[]).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-6)
        : [];

    // Construct simple context object
    return {
        now: new Date().toISOString(),
        schedule: scheduleRes.data || [],
        anchors: anchorsRes.data || [],
        goals: goalsRes.data || [],
        recentLogs: logsRes.data || [],
        userState: {
            preferences: profileRes.data || {},
        },
        proposals: proposalsRes.data || [],
        chatHistory: history.map(m => ({ role: m.role, content: m.content }))
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
