
import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, addDays, subDays, format } from 'date-fns';

export interface FeatureContextOptions {
    includeChatHistory?: boolean;
    includeRecentDumps?: boolean;
    includeHabitStacks?: boolean;
    includeWeekSchedule?: boolean;
    weekDays?: number; // default 3
}

export interface FeatureContext {
    now: string;
    schedule: any[];
    anchors: any[];
    goals: any[];
    recentLogs: any[];
    userState: any;
    preferences: any;
    chatHistory?: { role: string; content: string }[];
    recentDumps?: string[];
    habitStacks?: any[];
    capacity: {
        wake_time: string;
        sleep_time: string;
        total_waking_mins: number;
        scheduled_mins: number;
        available_mins: number;
        utilization_ratio: number;
        is_overloaded: boolean;
    };
}

/**
 * Unified context builder for Coach.
 */
export async function buildFeatureContext(
    userId: string,
    supabase: SupabaseClient,
    options: FeatureContextOptions = {}
): Promise<FeatureContext> {
    const {
        includeChatHistory = false,
        includeRecentDumps = false,
        includeHabitStacks = false,
        weekDays = 3,
    } = options;

    const today = startOfDay(new Date());
    const endDate = addDays(today, weekDays);
    const startStr = format(today, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    // Parallel fetch for speed — wrap Supabase queries as Promises
    const queries: Promise<any>[] = [
        // 0. Schedule (next N days)
        Promise.resolve(supabase.from('schedule_blocks')
            .select('id, title, start_time, end_time, pillar, date, block_type, goal_id, status, is_fixed, commitment_id')
            .eq('user_id', userId)
            .gte('date', startStr)
            .lte('date', endStr)
            .neq('status', 'cancelled')
            .order('start_time')
            .limit(100)),

        // 1. Goals (Active)
        Promise.resolve(supabase.from('goals')
            .select('id, title, category, importance, status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(10)),

        // 2. Anchors (Commitments)
        Promise.resolve(supabase.from('commitments')
            .select('id, title, start_time, end_time, days_of_week')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(20)),

        // 3. Recent Logs (Last 3 days)
        Promise.resolve(supabase.from('daily_logs')
            .select('log_date, energy_level, mood, signals')
            .eq('user_id', userId)
            .gte('log_date', format(subDays(today, 3), 'yyyy-MM-dd'))
            .order('log_date', { ascending: false })
            .limit(3)),

        // 4. User Preferences
        Promise.resolve(supabase.from('profile_preferences')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle()),
    ];

    // 5. Chat History (optional)
    let chatHistoryPromise = Promise.resolve({ data: null });
    if (includeChatHistory) {
        chatHistoryPromise = supabase.from('coach_conversations')
            .select('id, coach_messages(role, content, created_at)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle() as any;
    }

    // 6. Recent Dumps (optional)
    let recentDumpsPromise = Promise.resolve({ data: [] });
    if (includeRecentDumps) {
        recentDumpsPromise = supabase.from('brain_dumps')
            .select('raw_text, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(3) as any;
    }

    // 7. Habit Stacks (optional)
    let habitStacksPromise = Promise.resolve({ data: [] });
    if (includeHabitStacks) {
        habitStacksPromise = supabase.from('habit_stacks')
            .select('name, trigger_habit, action_habit, preferred_window, action_duration_mins')
            .eq('user_id', userId)
            .eq('enabled', true) as any;
    }

    // Execute optional queries
    const [chatRes, dumpRes, habitRes] = await Promise.all([
        chatHistoryPromise,
        recentDumpsPromise,
        habitStacksPromise
    ]);

    const results = await Promise.all(queries);

    const scheduleData = results[0].data || [];
    const goalsData = results[1].data || [];
    const anchorsData = results[2].data || [];
    const logsData = results[3].data || [];
    const prefsData = results[4].data || {};

    // Chat history processing
    let chatHistory: { role: string; content: string }[] = [];
    if (includeChatHistory && chatRes?.data) {
        const thread = chatRes.data as any;
        const msgs = thread?.coach_messages as any[] || [];
        chatHistory = msgs
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .slice(-8)
            .map((m: any) => ({ role: m.role, content: m.content }));
    }

    // Recent dumps processing
    let recentDumps: string[] = [];
    if (includeRecentDumps) {
        const dumpData = dumpRes?.data || [];
        recentDumps = dumpData.map((d: any) => d.raw_text || d.content || '');
    }

    // Habit Stacks processing
    let habitStacks: any[] = [];
    if (includeHabitStacks) {
        habitStacks = habitRes?.data || [];
    }

    // --- Capacity Calculation ---
    const wakeTime = prefsData.wake_time || '07:00';
    const sleepTime = prefsData.sleep_start || '23:00';
    const wakeMins = timeToMinutes(wakeTime);
    const sleepMins = timeToMinutes(sleepTime);
    const totalWakingMins = sleepMins > wakeMins ? sleepMins - wakeMins : (1440 - wakeMins) + sleepMins;

    // Calculate scheduled minutes for today
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayBlocks = scheduleData.filter((b: any) => b.date === todayStr);
    const scheduledMins = todayBlocks.reduce((acc: number, b: any) => {
        const start = timeToMinutes(b.start_time);
        const end = timeToMinutes(b.end_time);
        return acc + Math.max(0, end - start);
    }, 0);

    const availableMins = Math.max(0, totalWakingMins - scheduledMins);
    const utilizationRatio = totalWakingMins > 0 ? scheduledMins / totalWakingMins : 0;

    // Derive user state from most recent log
    const latestLog = logsData[0] || {};
    const userState = {
        energy_level: latestLog.energy_level ?? 5,
        mood: latestLog.mood ?? 'neutral',
        signals: latestLog.signals || {},
        is_low_energy: (latestLog.energy_level ?? 5) <= 3,
        is_overwhelmed: utilizationRatio > 0.85 || prefsData.overwhelm_mode,
    };

    return {
        now: new Date().toISOString(),
        schedule: scheduleData,
        anchors: anchorsData,
        goals: goalsData,
        recentLogs: logsData,
        userState,
        preferences: prefsData,
        chatHistory: includeChatHistory ? chatHistory : undefined,
        recentDumps: includeRecentDumps ? recentDumps : undefined,
        habitStacks: includeHabitStacks ? habitStacks : undefined,
        capacity: {
            wake_time: wakeTime,
            sleep_time: sleepTime,
            total_waking_mins: totalWakingMins,
            scheduled_mins: scheduledMins,
            available_mins: availableMins,
            utilization_ratio: Math.round(utilizationRatio * 100) / 100,
            is_overloaded: utilizationRatio > 0.9,
        },
    };
}

function timeToMinutes(time: string): number {
    const parts = time.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}
