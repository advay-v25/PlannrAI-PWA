export interface CoachContext {
    user: {
        id: string;
        first_name: string;
        sleep_start: string;
        sleep_end: string;
        wind_down_mins: number;
        morning_routine_mins: number;
        timezone: string;
        meals_per_day: number;
        buffer_min: number;
        weekend_intensity: string;
        failure_modes: string[];
    };

    goals: Array<{
        id: string;
        title: string;
        pillar: 'mind' | 'body' | 'craft' | null;
        category: 'mind' | 'body' | 'craft' | null;   // primary pillar field in DB
        weekly_target_minutes: number;
        current_streak_days: number;
        priority: number | string | null;              // legacy/alternate priority column
        importance: 'low' | 'medium' | 'high' | null; // primary importance field in DB
        is_active: boolean;
        minutes_per_day?: number;
        days_per_week?: number;
    }>;

    commitments: Array<{
        id: string;
        title: string;
        start_time: string;
        end_time: string;
        days_of_week: number[];
        is_locked: boolean;
    }>;

    todos: Array<{
        id: string;
        title: string;
        is_completed: boolean;
        due_date?: string | null;
        priority?: string;
    }>;

    habit_stacks: Array<{
        id: string;
        name: string;
        steps: any;
        preferred_window: string;
        current_streak: number;
        is_active: boolean;
    }>;

    schedule: {
        today: ScheduleBlock[];
        tomorrow: ScheduleBlock[];
        this_week: ScheduleBlock[];
    };

    user_state: {
        is_minimal_mode: boolean;
        last_energy_checkin?: number;
        emotional_state?: string;
        recent_missed_blocks: number;
        free_slots_today?: string[] | number;
    };

    bio_rhythm_trend: Array<{
        date: string;
        energy_level: number;
        mood: string;
        notes: string;
    }>;

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
        exact_iso_timestamp?: string;
        exact_timezone?: string;
        in_active_wake_cycle: boolean;
    };

    // Set by response generator
    last_user_message?: string;
    last_applied_patch_version_id?: string;
    
    analytics?: {
        weekly_completion_rate: number;
        current_streak: number;
        pillar_balance: {
            mind: number;
            body: number;
            craft: number;
        };
        most_productive_window?: string;
        today_progress: number;
    };
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
    supabase: any,
    clientIsoTimestamp?: string,
    clientTimezoneFallback?: string
): Promise<CoachContext> {
    // 1. Fetch profile first to get the user's timezone
    const profileRes = await supabase.from('profiles').select('*').eq('id', userId).single();
    const profile = profileRes.data || {};
    const timezone = profile.timezone || clientTimezoneFallback || 'UTC';

    // 2. Calculate dates and times relative to the user's timezone
    const now = clientIsoTimestamp ? new Date(clientIsoTimestamp) : new Date();
    
    // Temporal Grounding: Behavioral Sleep-Boundary
    const hour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now));
    let logicalNow = now;
    let in_active_wake_cycle = false;
    
    // If it's early morning (0:00 - 5:59 AM), check if the user has officially ended their day
    // We check for a recent 'daily_logs' entry (which acts as a terminal 'Sleep Log' event).
    if (hour >= 0 && hour < 6) {
        // Look for a daily log created within the last 12 hours
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
        const { data: recentLog } = await supabase
            .from('daily_logs')
            .select('id, created_at')
            .eq('user_id', userId)
            .gte('created_at', twelveHoursAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // If no log was found, the user hasn't ended their day yet
        if (!recentLog) {
            logicalNow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            in_active_wake_cycle = true;
        }
    }

    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    
    const today = dateFormatter.format(logicalNow);
    const currentTime = timeFormatter.format(now);
    
    const tomorrowDate = new Date(logicalNow.getTime() + 24 * 60 * 60 * 1000);
    const tomorrow = dateFormatter.format(tomorrowDate);

    // Get week boundaries (can remain in general date sync, but best to align relative to the local date)
    // Get week boundaries (can remain in general date sync, but best to align relative to the local date)
    const weekStart = getWeekStart(today);
    const weekEnd = getWeekEnd(today);

    // 3. Parallel fetch all remaining data using the localized dates
    const [
        goalsRes,
        habitStacksRes,
        commitmentsRes,
        todayBlocksRes,
        tomorrowBlocksRes,
        weekBlocksRes,
        energyRes,
        dailyLogsRes,
        preferencesRes,
        missedBlocksRes,
        todosRes,
        profilePrefsRes
    ] = await Promise.all([
        supabase.from('goals')
            .select('id, title, pillar, category, weekly_target_minutes, current_streak_days, priority, importance, status, energy_demand, minutes_per_day, days_per_week, ai_strategy')
            .eq('user_id', userId)
            .eq('status', 'active'),

        Promise.resolve({ data: [] }), // Disconnected habit_stacks for now
        // supabase.from('habit_stacks')
        //     .select('id, name, steps, preferred_window, current_streak, is_active')
        //     .eq('user_id', userId)
        //     .eq('enabled', true),

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

        // Full week's blocks for comprehensive AI Coach context
        supabase.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, context, block_type, status, goal_id')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .order('date')
            .order('start_time'),

        supabase.from('energy_checkins')
            .select('energy_level, emotional_state')
            .eq('user_id', userId)
            .order('checked_in_at', { ascending: false })
            .limit(1)
            .maybeSingle(),

        // Fetch last 3 days of daily logs for trend analysis
        supabase.from('daily_logs')
            .select('log_date, energy_level, mood, notes')
            .eq('user_id', userId)
            .lte('log_date', today)
            .gte('log_date', dateFormatter.format(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)))
            .order('log_date', { ascending: true }),

        // coach_learned_preferences doesn't exist — use memory_facts for behavioral intelligence
        supabase.from('memory_facts')
            .select('key, value, kind')
            .eq('user_id', userId)
            .eq('kind', 'preference')
            .limit(5),

        // Count missed blocks in last 24 hours (relative to local today)
        supabase.from('schedule_blocks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'missed')
            .gte('date', dateFormatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))),

        supabase.from('todos')
            .select('id, title, is_completed, due_date, priority')
            .eq('user_id', userId)
            .eq('is_completed', false)
            .order('order_index', { ascending: true })
            .limit(5),
            
        supabase.from('profile_preferences')
            .select('morning_routine_min, meals_per_day, buffer_min, weekend_intensity')
            .eq('user_id', userId)
            .maybeSingle()
    ]);


    const goals = goalsRes.data || [];
    const habit_stacks = habitStacksRes.data || [];
    const commitments = commitmentsRes.data || [];
    const todayBlocks = todayBlocksRes.data || [];
    const tomorrowBlocks = tomorrowBlocksRes.data || [];
    const weekBlocks = weekBlocksRes.data || [];
    const lastEnergy = energyRes.data;
    const dailyLogs = dailyLogsRes.data || [];
    
    const bioTrend = dailyLogs.map((log: any) => ({
        date: log.log_date,
        energy_level: log.energy_level || 5,
        mood: log.mood || 'neutral',
        notes: log.notes || ''
    }));

    // Transform memory_facts into the learned_preferences shape the Coach expects
    const rawFacts = preferencesRes.data || [];
    const preferences = rawFacts.map((f: any) => ({
        category: f.kind || 'general',
        preference_key: f.key || '',
        preference_value: f.value,
        natural_language: typeof f.value === 'string' ? f.value : (f.value?.description || f.key || ''),
    }));
    const missedCount = missedBlocksRes.count || 0;
    const todos = todosRes.data || [];
    const profilePrefs = profilePrefsRes?.data || {};

    const isMinimalMode = determineMinimalMode(lastEnergy?.energy_level, missedCount);

    const todayWithLocks = markLockedBlocks(todayBlocks, commitments, today);
    const tomorrowWithLocks = markLockedBlocks(tomorrowBlocks, commitments, tomorrow);

    // Compute Analytics
    let weeklyCompletionRate = 0;
    let todayProgress = 0;
    let mindMins = 0, bodyMins = 0, craftMins = 0;
    const windowCounts: Record<string, number> = {};
    
    if (weekBlocks.length > 0) {
        const completed = weekBlocks.filter((b: any) => b.status === 'done').length;
        weeklyCompletionRate = Math.round((completed / weekBlocks.length) * 100);
        
        weekBlocks.forEach((b: any) => {
            if (b.status === 'done') {
                const hour = parseInt(b.start_time.split(':')[0], 10);
                let window = 'evening';
                if (hour >= 5 && hour < 12) window = 'morning';
                else if (hour >= 12 && hour < 17) window = 'afternoon';
                windowCounts[window] = (windowCounts[window] || 0) + 1;
            }
            if (b.goal_id) {
                const goal = goals.find((g: any) => g.id === b.goal_id);
                if (goal) {
                    const startMins = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
                    const endMins = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1]);
                    const dur = endMins - startMins;
                    if (goal.pillar === 'mind') mindMins += dur;
                    else if (goal.pillar === 'body') bodyMins += dur;
                    else if (goal.pillar === 'craft') craftMins += dur;
                }
            }
        });
    }

    if (todayBlocks.length > 0) {
        const completedToday = todayBlocks.filter((b: any) => b.status === 'done').length;
        todayProgress = Math.round((completedToday / todayBlocks.length) * 100);
    }

    const mostProductiveWindow = Object.keys(windowCounts).sort((a, b) => windowCounts[b] - windowCounts[a])[0] || 'morning';

    // Calculate total momentum (streak) by summing active goal streaks
    const currentStreak = goals.reduce((acc: number, g: any) => acc + (g.current_streak_days || 0), 0);

    return {
        user: {
            id: userId,
            first_name: profile.first_name || 'there',
            sleep_start: profile.sleep_start || '23:00',
            sleep_end: profile.sleep_end || '07:00',
            wind_down_mins: profile.wind_down_mins || 60,
            morning_routine_mins: profilePrefs.morning_routine_min || profile.morning_routine_mins || 0,
            timezone: profile.timezone || 'UTC',
            meals_per_day: profilePrefs.meals_per_day || profile.meals_per_day || 3,
            buffer_min: profilePrefs.buffer_min || 10,
            weekend_intensity: profilePrefs.weekend_intensity || profile.weekend_intensity || 'light',
            failure_modes: (profile.bio_data as any)?.failure_modes || [],
        },
        goals,
        habit_stacks,
        todos,
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
            last_energy_checkin: lastEnergy?.energy_level,
            emotional_state: lastEnergy?.emotional_state,
            recent_missed_blocks: missedCount,
            free_slots_today: computeFreeSlots(todayWithLocks, currentTime, profile.sleep_start || '23:00'),
        },
        bio_rhythm_trend: bioTrend,
        learned_preferences: preferences,
        current: {
            date: today,
            time: currentTime,
            day_of_week: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }),
            exact_iso_timestamp: clientIsoTimestamp || now.toISOString(),
            exact_timezone: timezone,
            in_active_wake_cycle: in_active_wake_cycle
        },
        analytics: {
            weekly_completion_rate: weeklyCompletionRate,
            current_streak: currentStreak,
            pillar_balance: {
                mind: mindMins,
                body: bodyMins,
                craft: craftMins
            },
            most_productive_window: mostProductiveWindow,
            today_progress: todayProgress
        }
    };
}

function determineMinimalMode(energyLevel?: number, missedBlocks?: number): boolean {
    // energy_level is stored as 1-10; ≤3 = low energy, trigger minimal mode
    if (energyLevel !== undefined && energyLevel !== null && energyLevel <= 3) {
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
        const isCommitmentLocked = lockedTimes.some(lt =>
            block.start_time === lt.start && block.end_time === lt.end
        );
        const isLocked = isCommitmentLocked || block.block_type === 'anchor' || (block as any).is_locked === true;
        return { 
            ...block, 
            is_locked: isLocked,
            context: isLocked ? `[LOCKED/IMMUTABLE] ${(block as any).context || ''}` : (block as any).context
        };
    });
}

function getWeekStart(date: string): string {
    const d = new Date(date + 'T12:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekEnd(date: string): string {
    const d = new Date(getWeekStart(date) + 'T12:00:00');
    d.setDate(d.getDate() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeek(date: string): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date(date + 'T12:00:00').getDay()];
}

function computeFreeSlots(blocks: any[], currentTime: string, sleepStart: string): string[] {
    const timeToMin = (t: string) => {
        const [h, m] = (t || '0:0').split(':').map(Number);
        return (h * 60) + (m || 0);
    };
    const minToTime = (m: number) => {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    };

    const sortedBlocks = [...blocks].sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time));
    const currentMin = timeToMin(currentTime);
    const endOfDayMin = timeToMin(sleepStart) < 12 * 60 ? timeToMin(sleepStart) + 24 * 60 : timeToMin(sleepStart);

    let freeSlots: string[] = [];
    let currentMarker = currentMin;

    for (const block of sortedBlocks) {
        const startMin = timeToMin(block.start_time);
        let endMin = timeToMin(block.end_time);
        if (endMin <= startMin) endMin += 24 * 60;

        if (startMin > currentMarker) {
            freeSlots.push(`${minToTime(currentMarker % 1440)}-${minToTime(startMin % 1440)} (${startMin - currentMarker}m)`);
        }
        if (endMin > currentMarker) {
            currentMarker = endMin;
        }
    }

    if (currentMarker < endOfDayMin) {
        freeSlots.push(`${minToTime(currentMarker % 1440)}-${minToTime(endOfDayMin % 1440)} (${endOfDayMin - currentMarker}m)`);
    }

    return freeSlots;
}
