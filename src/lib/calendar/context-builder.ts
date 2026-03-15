/**
 * 📊 PLANNRAI — CALENDAR CONTEXT BUILDER
 * Gathers all user data needed for AI calendar decisions.
 * Reads from existing tables WITHOUT modifying them.
 */

import { createClient } from '@/lib/supabase/server';
import { format, startOfWeek, endOfWeek, addWeeks, subDays, addDays } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────

export interface CalendarContext {
    user: {
        id: string;
        first_name: string;
        sleep_start: string;
        sleep_end: string;
        wind_down_mins: number;
        energy_level: number;
        stress_level: number;
        meals_per_day: number;
        meal_windows: any;
        body_preferences: any;
        bio_data: any;
        chronotype: string;
    };


    goals: Array<{
        id: string;
        title: string;
        pillar: string;
        category: string;
        importance: number;
        minutes_per_day: number;
        days_per_week: number;
        weekly_target_minutes: number;
        energy_demand: string;
        is_active: boolean;
        ai_strategy?: any;
    }>;

    commitments: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        days_of_week: string[];
        is_active: boolean;
    }>;

    habitStacks: Array<{
        id: string;
        trigger_habit: string;
        action_habit: string;
        action_duration_mins: number;
        goal_id?: string;
    }>;

    schedule: {
        today: ScheduleBlock[];
        this_week: ScheduleBlock[];
    };

    capacity: {
        daily_awake_hours: number;
        weekly_available_hours: number;
        weekly_committed_hours: number;
        weekly_goal_hours_needed: number;
        is_overcommitted: boolean;
    };

    performance: {
        last_7_days_completion_rate: number;
        total_blocks_last_7: number;
        completed_blocks_last_7: number;
    };

    current: {
        date: string;
        time: string;
        day_of_week: string;
    };
}

export interface ScheduleBlock {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    status: string;
    block_type: string;
    goal_id?: string;
    is_fixed?: boolean;
    commitment_id?: string;
    pillar?: string;
}

// ── Utilities ────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function getDayOfWeek(date: Date): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
}

// ── Main Builder ─────────────────────────────────────────────────

export async function buildCalendarContext(userId: string, supabase?: any): Promise<CalendarContext> {
    // Use provided supabase or create a new client
    const db = supabase || await createClient();

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    const sevenDaysAgo = format(subDays(now, 7), 'yyyy-MM-dd');

    // ── Parallel Fetch ───────────────────────────────────────────

    const [profileRes, goalsRes, commitmentsRes, habitStacksRes, todayBlocksRes, weekBlocksRes, perfBlocksRes] = await Promise.all([
        // 1. Profile
        db.from('profiles')
            .select('id, first_name, sleep_start, sleep_end, wind_down_mins, energy_level, stress_level, meals_per_day, meal_windows, body_preferences, bio_data')
            .eq('id', userId)
            .maybeSingle(),


        // 2. Active Goals
        db.from('goals')
            .select('id, title, pillar, category, importance, minutes_per_day, days_per_week, energy_demand, status, ai_strategy')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(20),

        // 3. Active Commitments
        db.from('commitments')
            .select('id, title, start_time, end_time, days_of_week, is_active')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(30),

        // 4. Active Habit Stacks
        db.from('habit_stacks')
            .select('id, trigger_habit, action_habit, action_duration_mins, goal_id')
            .eq('user_id', userId)
            .eq('enabled', true)
            .limit(30),

        // 4. Today's Blocks
        db.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, status, block_type, goal_id, is_fixed, commitment_id, pillar')
            .eq('user_id', userId)
            .eq('date', todayStr)
            .neq('status', 'cancelled')
            .order('start_time'),

        // 5. This Week's Blocks
        db.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, status, block_type, goal_id, is_fixed, commitment_id, pillar')
            .eq('user_id', userId)
            .gte('date', weekStartStr)
            .lte('date', weekEndStr)
            .neq('status', 'cancelled')
            .order('start_time')
            .limit(200),

        // 6. Performance (last 7 days blocks)
        db.from('schedule_blocks')
            .select('id, status')
            .eq('user_id', userId)
            .gte('date', sevenDaysAgo)
            .lte('date', todayStr)
            .neq('status', 'cancelled'),
    ]);

    // ── Process Results ──────────────────────────────────────────

    const profile = profileRes.data || {
        id: userId,
        first_name: 'User',
        sleep_start: '23:00',
        sleep_end: '07:00',
        wind_down_mins: 30,
    };

    const goals = (goalsRes.data || []).map((g: any) => ({
        id: g.id,
        title: g.title,
        pillar: g.pillar || 'craft',
        category: g.category || 'general',
        importance: g.importance || 5,
        minutes_per_day: g.minutes_per_day || 60,
        days_per_week: g.days_per_week || 5,
        weekly_target_minutes: (g.minutes_per_day || 60) * (g.days_per_week || 5),
        energy_demand: g.energy_demand || 'medium',
        is_active: true,
        ai_strategy: g.ai_strategy,
    }));

    const commitments = (commitmentsRes.data || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        start_time: c.start_time,
        end_time: c.end_time,
        days_of_week: c.days_of_week || [],
        is_active: c.is_active,
    }));

    const habitStacks = (habitStacksRes.data || []).map((h: any) => ({
        id: h.id,
        trigger_habit: h.trigger_habit,
        action_habit: h.action_habit,
        action_duration_mins: h.action_duration_mins || 15,
        goal_id: h.goal_id || undefined,
    }));

    const todayBlocks: ScheduleBlock[] = (todayBlocksRes.data || []).map(mapBlock);
    const weekBlocks: ScheduleBlock[] = (weekBlocksRes.data || []).map(mapBlock);

    // ── Capacity ─────────────────────────────────────────────────

    const sleepStartMins = timeToMinutes(profile.sleep_start || '23:00');
    const sleepEndMins = timeToMinutes(profile.sleep_end || '07:00');
    const sleepDuration = sleepEndMins < sleepStartMins
        ? (1440 - sleepStartMins) + sleepEndMins
        : sleepEndMins - sleepStartMins;
    const dailyAwakeHours = (1440 - sleepDuration) / 60;
    const windDownHoursDaily = (profile.wind_down_mins || 30) / 60;
    const bufferHoursDaily = dailyAwakeHours * 0.1; // 10% buffer

    const weeklyCommittedHours = commitments.reduce((sum: number, c: { start_time: string; end_time: string; days_of_week: string[] }) => {
        const duration = timeToMinutes(c.end_time) - timeToMinutes(c.start_time);
        return sum + (Math.max(0, duration) / 60) * (c.days_of_week?.length || 0);
    }, 0);

    const weeklyGoalHours = goals.reduce((sum: number, g: { weekly_target_minutes: number }) => sum + g.weekly_target_minutes / 60, 0);
    const weeklyAvailable = (dailyAwakeHours - windDownHoursDaily - bufferHoursDaily) * 7 - weeklyCommittedHours;

    // ── Performance ──────────────────────────────────────────────

    const allPerfBlocks = perfBlocksRes.data || [];
    const completedBlocks = allPerfBlocks.filter((b: any) => b.status === 'done' || b.status === 'completed');
    const totalBlocks = allPerfBlocks.length;
    const completionRate = totalBlocks > 0 ? (completedBlocks.length / totalBlocks) * 100 : 0;

    // ── Build Context ────────────────────────────────────────────

    return {
        user: {
            id: userId,
            first_name: profile.first_name || 'User',
            sleep_start: profile.sleep_start || '23:00',
            sleep_end: profile.sleep_end || '07:00',
            wind_down_mins: profile.wind_down_mins || 30,
            energy_level: profile.energy_level || 5,
            stress_level: profile.stress_level || 3,
            meals_per_day: profile.meals_per_day || 3,
            meal_windows: profile.meal_windows || {
                breakfast: { start: '07:00', end: '10:00' },
                lunch: { start: '12:00', end: '15:00' },
                dinner: { start: '18:30', end: '21:30' },
            },
            body_preferences: profile.body_preferences || {},
            bio_data: profile.bio_data || {},
            chronotype: (profile.body_preferences as any)?.chronotype || 'bear',
        },

        goals,
        commitments,
        habitStacks,
        schedule: {
            today: todayBlocks,
            this_week: weekBlocks,
        },
        capacity: {
            daily_awake_hours: Math.round(dailyAwakeHours * 10) / 10,
            weekly_available_hours: Math.round(Math.max(0, weeklyAvailable) * 10) / 10,
            weekly_committed_hours: Math.round(weeklyCommittedHours * 10) / 10,
            weekly_goal_hours_needed: Math.round(weeklyGoalHours * 10) / 10,
            is_overcommitted: weeklyGoalHours > weeklyAvailable,
        },
        performance: {
            last_7_days_completion_rate: Math.round(completionRate),
            total_blocks_last_7: totalBlocks,
            completed_blocks_last_7: completedBlocks.length,
        },
        current: {
            date: todayStr,
            time: format(now, 'HH:mm'),
            day_of_week: getDayOfWeek(now),
        },
    };
}

// ── Helper ───────────────────────────────────────────────────────

function mapBlock(b: any): ScheduleBlock {
    return {
        id: b.id,
        date: b.date,
        start_time: b.start_time,
        end_time: b.end_time,
        title: b.title || b.context || 'Untitled',
        status: b.status || 'planned',
        block_type: b.block_type || 'task',
        goal_id: b.goal_id || undefined,
        is_fixed: b.is_fixed || false,
        commitment_id: b.commitment_id || undefined,
        pillar: b.pillar || undefined,
    };
}
