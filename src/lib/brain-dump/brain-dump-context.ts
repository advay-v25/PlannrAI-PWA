/**
 * 🧠 PLANNRAI — BRAIN DUMP CONTEXT BUILDER
 * Builds comprehensive context for AI brain dump processing, including
 * schedule, goals, user preferences, bio-data, and quick stats.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, addDays, format } from 'date-fns';

export interface BrainDumpContext {
    dump_text: string;
    template_triggered?: string;

    current_time: string;
    current_date: string;
    day_of_week: string;

    current_schedule: {
        today: ScheduleBlockCtx[];
        tomorrow: ScheduleBlockCtx[];
        upcoming_next?: ScheduleBlockCtx;
    };

    user_preferences: {
        first_name: string;
        wake_time: string;
        sleep_time: string;
        wind_down_mins: number;
        timezone: string;
        brain_dump_style: 'gentle' | 'balanced' | 'directive';
        energy_level: number;
        stress_level: number;
        chronotype: string;
        meals_per_day: number;
        meal_windows: any;
    };

    active_goals: Array<{
        id: string;
        title: string;
        pillar: string;
        weekly_target_minutes: number;
        priority: number;
    }>;

    commitments: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        days_of_week: string[];
    }>;

    quick_stats: {
        blocks_completed_today: number;
        blocks_missed_today: number;
        blocks_remaining_today: number;
        minutes_remaining_today: number;
    };
}

interface ScheduleBlockCtx {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    date: string;
    block_type: string;
    status: string;
    pillar?: string;
    goal_id?: string;
    is_fixed?: boolean;
    commitment_id?: string;
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}

export async function buildBrainDumpContext(
    userId: string,
    supabase: SupabaseClient,
    dumpText: string,
    templateTriggered?: string
): Promise<BrainDumpContext> {
    const now = new Date();
    const today = format(startOfDay(now), 'yyyy-MM-dd');
    const tomorrow = format(addDays(startOfDay(now), 1), 'yyyy-MM-dd');
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Parallel fetch
    const [profileRes, scheduleRes, goalsRes, commitmentsRes] = await Promise.all([
        // 1. User profile
        supabase.from('profiles')
            .select('first_name, sleep_start, sleep_end, wind_down_mins, timezone, energy_level, stress_level, chronotype, meals_per_day, meal_windows, brain_dump_style')
            .eq('id', userId)
            .single(),

        // 2. Schedule (today + tomorrow)
        supabase.from('schedule_blocks')
            .select('id, title, start_time, end_time, date, block_type, status, pillar, goal_id, is_fixed, commitment_id')
            .eq('user_id', userId)
            .in('date', [today, tomorrow])
            .neq('status', 'cancelled')
            .order('start_time', { ascending: true }),

        // 3. Active goals
        supabase.from('goals')
            .select('id, title, pillar, weekly_target_minutes, priority')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('priority', { ascending: false })
            .limit(10),

        // 4. Commitments (anchors)
        supabase.from('commitments')
            .select('id, title, start_time, end_time, days_of_week')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(20),
    ]);

    const profile: any = profileRes.data || {};
    const allBlocks: ScheduleBlockCtx[] = (scheduleRes.data || []) as any;
    const todayBlocks = allBlocks.filter(b => b.date === today);
    const tomorrowBlocks = allBlocks.filter(b => b.date === tomorrow);

    // Compute quick stats
    const nowMinutes = timeToMinutes(currentTime);
    const completed = todayBlocks.filter(b => b.status === 'completed').length;
    const missed = todayBlocks.filter(b => b.status === 'missed').length;
    const remaining = todayBlocks.filter(b =>
        b.status === 'planned' && timeToMinutes(b.start_time) > nowMinutes
    );
    const minutesRemaining = remaining.reduce((sum, b) =>
        sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0
    );

    // Find upcoming next block
    const upcomingNext = remaining.length > 0 ? remaining[0] : undefined;

    return {
        dump_text: dumpText,
        template_triggered: templateTriggered,

        current_time: currentTime,
        current_date: today,
        day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),

        current_schedule: {
            today: todayBlocks,
            tomorrow: tomorrowBlocks,
            upcoming_next: upcomingNext,
        },

        user_preferences: {
            first_name: profile.first_name || 'there',
            wake_time: profile.sleep_end || '07:00',
            sleep_time: profile.sleep_start || '23:00',
            wind_down_mins: profile.wind_down_mins || 30,
            timezone: profile.timezone || 'UTC',
            brain_dump_style: profile.brain_dump_style || 'gentle',
            energy_level: profile.energy_level || 5,
            stress_level: profile.stress_level || 3,
            chronotype: profile.chronotype || 'bear',
            meals_per_day: profile.meals_per_day || 3,
            meal_windows: profile.meal_windows || {},
        },

        active_goals: (goalsRes.data || []).map((g: any) => ({
            id: g.id,
            title: g.title,
            pillar: g.pillar || 'mind',
            weekly_target_minutes: g.weekly_target_minutes || 120,
            priority: g.priority || 1,
        })),

        commitments: (commitmentsRes.data || []).map((c: any) => ({
            id: c.id,
            title: c.title,
            start_time: c.start_time,
            end_time: c.end_time,
            days_of_week: c.days_of_week || [],
        })),

        quick_stats: {
            blocks_completed_today: completed,
            blocks_missed_today: missed,
            blocks_remaining_today: remaining.length,
            minutes_remaining_today: minutesRemaining,
        },
    };
}
