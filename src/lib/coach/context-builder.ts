export interface CoachContext {
    user: {
        id: string;
        first_name: string;
        sleep_start: string;
        sleep_end: string;
        wind_down_mins: number;
        timezone: string;
    };

    goals: Array<{
        id: string;
        title: string;
        pillar: 'mind' | 'body' | 'craft';
        weekly_target_minutes: number;
        current_streak_days: number;
        priority: number;
        is_active: boolean;
    }>;

    commitments: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        days_of_week: string[];
        is_locked: boolean;
    }>;

    schedule: {
        today: ScheduleBlock[];
        tomorrow: ScheduleBlock[];
        this_week: ScheduleBlock[];
    };

    user_state: {
        is_minimal_mode: boolean;
        last_energy_checkin?: string;
        recent_missed_blocks: number;
    };

    learned_preferences: Array<{
        category: string;
        preference_key: string;
        preference_value: any;
        natural_language: string;
    }>;

    current: {
        date: string;
        time: string;
        day_of_week: string;
    };

    // Set by response generator
    last_user_message?: string;
    last_applied_patch_version_id?: string;
}

interface ScheduleBlock {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    context: string;
    block_type: string;
    energy_level_required?: number;
    goal_id?: string;
    is_locked?: boolean;
    priority?: number;
}

export async function buildCoachContext(
    userId: string,
    supabase: any
): Promise<CoachContext> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get week boundaries
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);

    // Parallel fetch all data
    const [
        profileRes,
        goalsRes,
        commitmentsRes,
        todayBlocksRes,
        tomorrowBlocksRes,
        weekBlocksRes,
        energyRes,
        preferencesRes,
        missedBlocksRes
    ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),

        supabase.from('goals')
            .select('id, title, pillar, weekly_target_minutes, current_streak_days, priority, is_active')
            .eq('user_id', userId)
            .eq('is_active', true),

        supabase.from('commitments')
            .select('id, title, start_time, end_time, days_of_week, is_active')
            .eq('user_id', userId)
            .eq('is_active', true),

        supabase.from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .order('start_time'),

        supabase.from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', tomorrow)
            .order('start_time'),

        supabase.from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .order('date')
            .order('start_time'),

        supabase.from('energy_checkins')
            .select('level')
            .eq('user_id', userId)
            .order('checked_at', { ascending: false })
            .limit(1)
            .maybeSingle(),

        supabase.from('coach_learned_preferences')
            .select('category, preference_key, preference_value, natural_language')
            .eq('user_id', userId)
            .eq('is_active', true),

        // Count missed blocks in last 24 hours
        supabase.from('schedule_blocks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'missed')
            .gte('date', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    ]);

    const profile = profileRes.data || {};
    const goals = goalsRes.data || [];
    const commitments = commitmentsRes.data || [];
    const todayBlocks = todayBlocksRes.data || [];
    const tomorrowBlocks = tomorrowBlocksRes.data || [];
    const weekBlocks = weekBlocksRes.data || [];
    const lastEnergy = energyRes.data;
    const preferences = preferencesRes.data || [];
    const missedCount = missedBlocksRes.count || 0;

    const isMinimalMode = determineMinimalMode(lastEnergy?.level, missedCount);

    const todayWithLocks = markLockedBlocks(todayBlocks, commitments, today);
    const tomorrowWithLocks = markLockedBlocks(tomorrowBlocks, commitments, tomorrow);

    return {
        user: {
            id: userId,
            first_name: profile.first_name || 'there',
            sleep_start: profile.sleep_start || '23:00',
            sleep_end: profile.sleep_end || '07:00',
            wind_down_mins: profile.wind_down_mins || 60,
            timezone: profile.timezone || 'UTC',
        },
        goals,
        commitments: commitments.map((c: any) => ({
            ...c,
            is_locked: true,
        })),
        schedule: {
            today: todayWithLocks,
            tomorrow: tomorrowWithLocks,
            this_week: weekBlocks,
        },
        user_state: {
            is_minimal_mode: isMinimalMode,
            last_energy_checkin: lastEnergy?.level,
            recent_missed_blocks: missedCount,
        },
        learned_preferences: preferences,
        current: {
            date: today,
            time: currentTime,
            day_of_week: getDayOfWeek(today),
        },
    };
}

function determineMinimalMode(energyLevel?: string, missedBlocks?: number): boolean {
    if (energyLevel === 'exhausted' || energyLevel === 'low') {
        return true;
    }
    if (missedBlocks && missedBlocks >= 4) {
        return true;
    }
    return false;
}

function markLockedBlocks(
    blocks: ScheduleBlock[],
    commitments: any[],
    date: string
): ScheduleBlock[] {
    const dayOfWeek = getDayOfWeek(date);

    const lockedTimes = commitments
        .filter(c => c.days_of_week.includes(dayOfWeek))
        .map(c => ({ start: c.start_time, end: c.end_time }));

    return blocks.map(block => {
        const isLocked = lockedTimes.some(lt =>
            block.start_time === lt.start && block.end_time === lt.end
        );
        return { ...block, is_locked: isLocked };
    });
}

function getWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function getWeekEnd(date: Date): string {
    const start = new Date(getWeekStart(date));
    start.setDate(start.getDate() + 6);
    return start.toISOString().split('T')[0];
}

function getDayOfWeek(date: string): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date(date).getDay()];
}
