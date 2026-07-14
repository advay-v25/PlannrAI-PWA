import { CoachContext } from '@/lib/coach/context-builder';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

export interface ProactiveSuggestion {
    id: string;
    trigger_type: string;
    trigger_data: any;
    title: string;
    message: string;
    action_label: string;
    priority: 'high' | 'medium' | 'low';
}

export async function checkProactiveTriggers(
    userId: string,
    supabase: any
): Promise<ProactiveSuggestion | null> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('timezone, sleep_start, sleep_end, wind_down_mins')
        .eq('id', userId)
        .single();

    const tz = profile?.timezone || DEFAULT_TIMEZONE;

    // Create localized date strings (YYYY-MM-DD) for today and tomorrow in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = formatter.format(now);

    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrow = formatter.format(tomorrowDate);

    // Check triggers in priority order
    const triggers = [
        () => checkTomorrowOverload(userId, supabase, tomorrow, profile),
        () => checkEnergyMismatch(userId, supabase, today, tz),
        () => checkConsecutiveMisses(userId, supabase),
        () => checkGoalBehind(userId, supabase, tz),
    ];

    for (const checkTrigger of triggers) {
        const suggestion = await checkTrigger();
        if (suggestion) {
            return suggestion;
        }
    }

    return null;
}

async function checkTomorrowOverload(
    userId: string,
    supabase: any,
    tomorrow: string,
    profile: any
): Promise<ProactiveSuggestion | null> {
    const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('start_time, end_time')
        .eq('user_id', userId)
        .eq('date', tomorrow)
        .eq('status', 'planned');

    if (!blocks || blocks.length === 0) return null;

    if (!profile) return null;

    const scheduledMinutes = blocks.reduce((total: number, block: any) => {
        const duration = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
        return total + duration;
    }, 0);

    const sleepEnd = timeToMinutes(profile.sleep_end);
    const sleepStart = timeToMinutes(profile.sleep_start) - (profile.wind_down_mins || 0);
    const availableMinutes = sleepStart - sleepEnd;

    const utilizationRate = scheduledMinutes / availableMinutes;

    if (utilizationRate > 0.8) {
        const overloadMinutes = scheduledMinutes - (availableMinutes * 0.7);

        return {
            id: `overload_${tomorrow}`,
            trigger_type: 'overload_tomorrow',
            trigger_data: {
                date: tomorrow,
                scheduled_minutes: scheduledMinutes,
                available_minutes: availableMinutes,
                overload_minutes: overloadMinutes,
            },
            title: 'Tomorrow looks intense',
            message: `You have ${Math.round(scheduledMinutes / 60)}h scheduled with ${Math.round(availableMinutes / 60)}h available. Want me to rebalance?`,
            action_label: 'Rebalance tomorrow',
            priority: 'high',
        };
    }

    return null;
}

async function checkEnergyMismatch(
    userId: string,
    supabase: any,
    today: string,
    timezone: string = DEFAULT_TIMEZONE
): Promise<ProactiveSuggestion | null> {
    const { data: energy } = await supabase
        .from('energy_checkins')
        .select('level, checked_at')
        .eq('user_id', userId)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!energy || !['exhausted', 'low'].includes(energy.level)) {
        return null;
    }

    // schedule_blocks.start_time is stored as the user's local wall-clock time,
    // so "current time" must be computed in the user's timezone, not the server's.
    const currentTime = nowInTimezone(timezone).time;

    const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('id, context, energy_level_required')
        .eq('user_id', userId)
        .eq('date', today)
        .eq('status', 'planned')
        .gt('start_time', currentTime)
        .gte('energy_level_required', 4);

    if (!blocks || blocks.length === 0) return null;

    return {
        id: `energy_${today}`,
        trigger_type: 'energy_mismatch',
        trigger_data: {
            energy_level: energy.level,
            high_energy_blocks: blocks.length,
        },
        title: "You're running low",
        message: `You have ${blocks.length} high-energy task(s) remaining, but you're feeling ${energy.level}. Want me to adjust?`,
        action_label: 'Lighten my load',
        priority: 'high',
    };
}

async function checkConsecutiveMisses(
    userId: string,
    supabase: any
): Promise<ProactiveSuggestion | null> {
    const { data: recentBlocks } = await supabase
        .from('schedule_blocks')
        .select('goal_id, status, date')
        .eq('user_id', userId)
        .eq('status', 'missed')
        .not('goal_id', 'is', null)
        .order('date', { ascending: false })
        .limit(10);

    if (!recentBlocks || recentBlocks.length < 3) return null;

    const missesByGoal: Record<string, number> = {};

    for (const block of recentBlocks) {
        if (block.goal_id) {
            missesByGoal[block.goal_id] = (missesByGoal[block.goal_id] || 0) + 1;
        }
    }

    const problematicGoal = Object.entries(missesByGoal).find(([_, count]) => count >= 3);

    if (!problematicGoal) return null;

    const { data: goal } = await supabase
        .from('goals')
        .select('title, pillar')
        .eq('id', problematicGoal[0])
        .single();

    if (!goal) return null;

    return {
        id: `misses_${problematicGoal[0]}`,
        trigger_type: 'consecutive_misses',
        trigger_data: {
            goal_id: problematicGoal[0],
            miss_count: problematicGoal[1],
        },
        title: `${goal.title} needs attention`,
        message: `You've missed ${problematicGoal[1]} ${goal.title} sessions recently. Want to adjust the schedule?`,
        action_label: 'Help me get back on track',
        priority: 'medium',
    };
}

async function checkGoalBehind(
    userId: string,
    supabase: any,
    timezone: string = DEFAULT_TIMEZONE
): Promise<ProactiveSuggestion | null> {
    const { data: goals } = await supabase
        .from('goals')
        .select('id, title, pillar, weekly_target_minutes')
        .eq('user_id', userId)
        .eq('is_active', true);

    if (!goals || goals.length === 0) return null;

    const { date: todayInTz, dayOfWeek } = nowInTimezone(timezone);
    const weekStart = getWeekStart(todayInTz, dayOfWeek);

    for (const goal of goals) {
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('start_time, end_time')
            .eq('user_id', userId)
            .eq('goal_id', goal.id)
            .eq('status', 'done')
            .gte('date', weekStart);

        const completedMinutes = (blocks || []).reduce((sum: number, b: any) => {
            return sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
        }, 0);

        const weekProgress = dayOfWeek / 7;
        const expectedMinutes = goal.weekly_target_minutes * weekProgress;

        if (dayOfWeek >= 4 && completedMinutes < expectedMinutes * 0.5) {
            return {
                id: `behind_${goal.id}`,
                trigger_type: 'goal_behind',
                trigger_data: {
                    goal_id: goal.id,
                    completed_minutes: completedMinutes,
                    target_minutes: goal.weekly_target_minutes,
                    expected_minutes: expectedMinutes,
                },
                title: `${goal.title} is behind`,
                message: `You're at ${Math.round(completedMinutes / goal.weekly_target_minutes * 100)}% for the week. Want to add extra sessions?`,
                action_label: 'Catch up this week',
                priority: 'medium',
            };
        }
    }

    return null;
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/** Monday of the week containing `dateStr` (yyyy-MM-dd), given its day-of-week (0=Sun..6=Sat). */
function getWeekStart(dateStr: string, dayOfWeek: number): string {
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const [y, m, d] = dateStr.split('-').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    utcDate.setUTCDate(utcDate.getUTCDate() - daysSinceMonday);
    return utcDate.toISOString().split('T')[0];
}
