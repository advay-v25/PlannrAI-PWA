/**
 * Coach Context Builder
 *
 * Assembles the full tactical context the coach LLM needs to produce
 * executable patch options.  Keeps it lean — the prompt is long enough.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, addDays, format } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────
export interface CoachContext {
    now: string;                   // ISO
    timezone: string;
    profile: {
        buffer_minutes: number;
        meal_windows: Record<string, { start: string; end: string }>;
        meal_duration_minutes: number;
        weekend_intensity: string;
        pillar_preferences: Record<string, any>;
    };
    goals: Array<{
        id: string;
        title: string;
        pillar: string | null;
        minutes_per_day: number;
        days_per_week: number;
        priority: string;
        energy: string;
    }>;
    schedule: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        block_type: string | null;
        source: string | null;
        is_locked: boolean;
        goal_id: string | null;
        energy_cost: string | null;
        pillar: string | null;
    }>;
    anchors: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        days_of_week: number[];
    }>;
    thread: Array<{
        role: string;
        content: string | null;
        content_json: any | null;
        created_at: string;
    }>;
}

// ── Builder ──────────────────────────────────────────────────────────
export async function buildCoachContext(
    userId: string,
    supabase: SupabaseClient
): Promise<CoachContext> {
    const now = new Date();
    const rangeStart = startOfDay(now);
    const rangeEnd = endOfDay(addDays(now, 7));

    // Fire all queries in parallel
    const [profileRes, goalsRes, scheduleRes, anchorsRes, threadRes] = await Promise.all([
        // 1. Profile preferences
        supabase
            .from('profiles')
            .select('timezone, buffer_minutes, meal_windows, meal_duration_minutes, weekend_intensity, pillar_preferences')
            .eq('id', userId)
            .single(),

        // 2. Active goals
        supabase
            .from('goals')
            .select('id, title, pillar, minutes_per_day, days_per_week, priority, energy')
            .eq('user_id', userId)
            .eq('status', 'active'),

        // 3. Schedule blocks (today + 7 days)
        supabase
            .from('schedule_blocks')
            .select('id, title, start_time, end_time, block_type, source, is_locked, goal_id, energy_cost, pillar')
            .eq('user_id', userId)
            .gte('start_time', rangeStart.toISOString())
            .lte('start_time', rangeEnd.toISOString())
            .order('start_time', { ascending: true }),

        // 4. Anchors (commitments)
        supabase
            .from('commitments')
            .select('id, title, start_time, end_time, days_of_week')
            .eq('user_id', userId)
            .eq('is_active', true),

        // 5. Thread history (last 20 messages), get-or-create thread
        getThreadHistory(userId, supabase),
    ]);

    const profile = profileRes.data;

    return {
        now: now.toISOString(),
        timezone: profile?.timezone || 'Asia/Kolkata',
        profile: {
            buffer_minutes: profile?.buffer_minutes ?? 10,
            meal_windows: profile?.meal_windows ?? {
                breakfast: { start: '07:00', end: '10:00' },
                lunch: { start: '12:00', end: '15:00' },
                dinner: { start: '18:30', end: '21:30' },
            },
            meal_duration_minutes: profile?.meal_duration_minutes ?? 30,
            weekend_intensity: profile?.weekend_intensity ?? 'normal',
            pillar_preferences: profile?.pillar_preferences ?? {},
        },
        goals: (goalsRes.data || []).map(g => ({
            id: g.id,
            title: g.title,
            pillar: g.pillar,
            minutes_per_day: g.minutes_per_day ?? 30,
            days_per_week: g.days_per_week ?? 7,
            priority: g.priority ?? 'medium',
            energy: g.energy ?? 'medium',
        })),
        schedule: (scheduleRes.data || []).map(b => ({
            id: b.id,
            title: b.title,
            start_time: b.start_time,
            end_time: b.end_time,
            block_type: b.block_type,
            source: b.source,
            is_locked: b.is_locked ?? false,
            goal_id: b.goal_id,
            energy_cost: b.energy_cost,
            pillar: b.pillar,
        })),
        anchors: (anchorsRes.data || []).map(a => ({
            id: a.id,
            title: a.title,
            start_time: a.start_time,
            end_time: a.end_time,
            days_of_week: a.days_of_week ?? [],
        })),
        thread: threadRes,
    };
}

// ── Thread helper ────────────────────────────────────────────────────

/**
 * Get-or-create a default thread for the user, then return last 20 messages.
 */
export async function getOrCreateThread(
    userId: string,
    supabase: SupabaseClient
): Promise<string> {
    // Try to find existing thread
    const { data: existing } = await supabase
        .from('coach_threads')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (existing?.id) return existing.id;

    // Create new thread
    const { data: thread, error } = await supabase
        .from('coach_threads')
        .insert({ user_id: userId, title: 'Coach' })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create coach thread: ${error.message}`);
    return thread!.id;
}

async function getThreadHistory(
    userId: string,
    supabase: SupabaseClient
): Promise<Array<{ role: string; content: string | null; content_json: any | null; created_at: string }>> {
    const threadId = await getOrCreateThread(userId, supabase);

    const { data } = await supabase
        .from('coach_messages')
        .select('role, content, content_json, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(20);

    // Return chronological order (was DESC for limit, now reverse)
    return (data || []).reverse();
}

/**
 * Persist a message to the coach thread.
 */
export async function saveCoachMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string | null,
    supabase: SupabaseClient,
    contentJson?: any
): Promise<void> {
    const threadId = await getOrCreateThread(userId, supabase);

    await supabase.from('coach_messages').insert({
        thread_id: threadId,
        user_id: userId,
        role,
        content,
        content_json: contentJson
    });
}
