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
        days_of_week: number[];
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
    // 1. Fetch profile first to get the user's timezone
    const profileRes = await supabase.from('profiles').select('*').eq('id', userId).single();
    const profile = profileRes.data || {};
    const timezone = profile.timezone || 'UTC';

    // 2. Calculate dates and times relative to the user's timezone
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    
    const today = dateFormatter.format(now);
    const currentTime = timeFormatter.format(now);
    
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrow = dateFormatter.format(tomorrowDate);

    // Get week boundaries (can remain in general date sync, but best to align relative to the local date)
    const weekStart = getWeekStart(new Date(today));
    const weekEnd = getWeekEnd(new Date(today));

    // 3. Parallel fetch all remaining data using the localized dates
    const [
        goalsRes,
        commitmentsRes,
        todayBlocksRes,
        tomorrowBlocksRes,
        energyRes,
        preferencesRes,
        missedBlocksRes
    ] = await Promise.all([
        supabase.from('goals')
            .select('id, title, pillar, weekly_target_minutes, current_streak_days, priority, status, energy_demand, minutes_per_day, days_per_week, ai_strategy')
            .eq('user_id', userId)
            .eq('status', 'active'),

        supabase.from('commitments')
            .select('id, title, start_time, end_time, days_of_week, is_active')
            .eq('user_id', userId)
            .eq('is_active', true),

        supabase.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, context, block_type, status, goal_id')
            .eq('user_id', userId)
            .eq('date', today)
            .order('start_time'),

        supabase.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, context, block_type, status, goal_id')
            .eq('user_id', userId)
            .eq('date', tomorrow)
            .order('start_time'),

        supabase.from('energy_checkins')
            .select('energy_level, emotional_state')
            .eq('user_id', userId)
            .order('checked_in_at', { ascending: false })
            .limit(1)
            .maybeSingle(),

        // coach_learned_preferences doesn't exist — use memory_facts for behavioral intelligence
        supabase.from('memory_facts')
            .select('key, value, kind')
            .eq('user_id', userId)
            .eq('kind', 'preference')
            .limit(20),

        // Count missed blocks in last 24 hours (relative to local today)
        supabase.from('schedule_blocks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'missed')
            .gte('date', dateFormatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
    ]);


    const goals = goalsRes.data || [];
    const commitments = commitmentsRes.data || [];
    const todayBlocks = todayBlocksRes.data || [];
    const tomorrowBlocks = tomorrowBlocksRes.data || [];
    const lastEnergy = energyRes.data;
    // Transform memory_facts into the learned_preferences shape the Coach expects
    const rawFacts = preferencesRes.data || [];
    const preferences = rawFacts.map((f: any) => ({
        category: f.kind || 'general',
        preference_key: f.key || '',
        preference_value: f.value,
        natural_language: typeof f.value === 'string' ? f.value : (f.value?.description || f.key || ''),
    }));
    const missedCount = missedBlocksRes.count || 0;

    const isMinimalMode = determineMinimalMode(lastEnergy?.energy_level?.toString(), missedCount);

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
            this_week: [], // Trimmed for performance/token budget
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
    // DB stores days_of_week as number[]: Sun=0, Mon=1...Sat=6
    const dayNum = new Date(date + 'T12:00:00').getDay();

    const lockedTimes = commitments
        .filter(c => (c.days_of_week || []).includes(dayNum))
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
