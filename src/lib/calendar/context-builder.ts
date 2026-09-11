/**
 * 📊 PLANNRAI — CALENDAR CONTEXT BUILDER
 * Gathers all user data needed for AI calendar decisions.
 * Reads from existing tables WITHOUT modifying them.
 */

import { createClient } from '@/lib/supabase/server';
import { computeWeekCapacity, describeCapacity, type WeekCapacity } from '@/lib/scheduling/capacity';
import { format, startOfWeek, endOfWeek, addWeeks, subDays, addDays } from 'date-fns';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

// ── Normalization Helpers ───────────────────────────────────────
// Goals are stored with string enum values ('low'/'medium'/'high' importance,
// 'light'/'medium'/'heavy' energy_demand from the onboarding UI) but the
// scheduling engine needs numeric importance and a canonical 'low'/'medium'/
// 'high' energy vocabulary. Without this, importance sorting silently
// no-ops (string subtraction => NaN) and 'heavy'-demand goals (the actual
// onboarding UI value) never match any 'high'-energy check anywhere in the
// engine. Normalize ONCE here — the single ingestion boundary for goals
// into the deterministic scheduler — so no downstream code needs to guess.
const IMPORTANCE_MAP: Record<string, number> = { low: 2, medium: 5, high: 9 };
function normalizeImportance(raw: unknown): number {
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
    return IMPORTANCE_MAP[String(raw ?? 'medium').toLowerCase()] ?? 5;
}

/**
 * Where a user's day actually starts and ends.
 *
 * Onboarding writes some of these to `profile_preferences` and some to
 * `profiles`, with preferences winning. Anything that computes capacity has to
 * apply the SAME precedence or it measures a different week than the generator
 * plans — which is exactly how the weekly review came to choose a scheduling
 * mode from a nine-hour night while the planner was building an eight-hour one.
 */
export function resolveDaySettings(profileRaw: any = {}, prefs: any = {}) {
    return {
        sleep_start: prefs.sleep_start || profileRaw.sleep_start || '23:00',
        sleep_end: prefs.wake_time || profileRaw.sleep_end || '07:00',
        wind_down_mins:
            prefs.wind_down_min || profileRaw.wind_down_mins || profileRaw.wind_down_minutes || 30,
        morning_routine_mins: prefs.morning_routine_min || profileRaw.morning_routine_mins || 0,
        meals_per_day: profileRaw.meals_per_day || prefs.meals_per_day || 3,
    };
}

const ENERGY_DEMAND_MAP: Record<string, 'low' | 'medium' | 'high'> = {
    light: 'low', low: 'low',
    medium: 'medium',
    heavy: 'high', high: 'high',
};
function normalizeEnergyDemand(raw: unknown): 'low' | 'medium' | 'high' {
    return ENERGY_DEMAND_MAP[String(raw ?? 'medium').toLowerCase()] ?? 'medium';
}

// ── Types ────────────────────────────────────────────────────────

export interface CalendarContext {
    user: {
        id: string;
        first_name: string;
        sleep_start: string;
        sleep_end: string;
        wind_down_mins: number;
        morning_routine_mins: number;
        energy_level: number;
        stress_level: number;
        meals_per_day: number;
        meal_windows: any;
        body_preferences: any;
        bio_data: any;
        chronotype: string;
        weekend_intensity: string;
        timezone?: string; // e.g., 'America/New_York', defaults to 'UTC'
        default_buffer_duration?: number;
        failure_modes?: string[];
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
        preferred_time_of_day?: 'morning' | 'afternoon' | 'evening';
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
        target_week: ScheduleBlock[];
    };

    capacity: {
        daily_awake_hours: number;
        weekly_available_hours: number;
        weekly_committed_hours: number;
        weekly_goal_hours_needed: number;
        is_overcommitted: boolean;
    };

    /**
     * The full, unrounded capacity breakdown from the single shared
     * implementation. `capacity` above is the rounded, hours-based summary the
     * AI prompts have always read; anything that needs to reason about the
     * numbers (the weekly-review dry run, the mode choice) should use this.
     */
    weekCapacity?: WeekCapacity;

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

    // ── New: Behavioral Intelligence ─────────────────────────────

    coachLearnings: Array<{
        learning: string;
        category: string;
        confidence: number;
    }>;

    behaviorPatterns: {
        preferred_windows: Record<string, string[]>;
        completion_rates: Record<string, number>;
        avoidance_data: Record<string, string[]>;
        density_tolerance: number;
    } | null;

    dailyEnergyState: {
        energy_level: number;
        emotional_state: string;
    } | null;


    goalProgress: Array<{
        goal_id: string;
        goal_title: string;
        pillar: string;
        weekly_target_minutes: number;
        completed_minutes_target_week: number;
        remaining_minutes: number;
        days_remaining_in_week: number;
        daily_target_today: number;
    }>;
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
    is_locked?: boolean;
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

export async function buildCalendarContext(userId: string, supabase?: any, targetWeekStart?: string): Promise<CalendarContext> {
    // Use provided supabase or create a new client
    const db = supabase || await createClient();

    // "Today" is computed in the app's default timezone (Asia/Kolkata) rather
    // than the server's local clock — Vercel runs UTC, which would otherwise
    const nowIst = nowInTimezone(DEFAULT_TIMEZONE);
    const todayStr = nowIst.date;
    const currentTimeStr = nowIst.time;
    const now = new Date(`${todayStr}T00:00:00`); // anchor for pure calendar-day arithmetic below
    
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const currentWeekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
    
    // Both sides of the guard below, on every call. When Plan Week refuses a
    // week, this is the line that says whether the client sent the wrong Monday
    // or the server computed the wrong "today".
    console.log(
        `[CalendarContext] targetWeekStart=${targetWeekStart ?? '(none → current)'} ` +
        `currentWeekStartStr=${currentWeekStartStr} today=${todayStr} (${DEFAULT_TIMEZONE})`
    );

    if (targetWeekStart && !/^\d{4}-\d{2}-\d{2}$/.test(targetWeekStart)) {
        throw new Error(`Invalid targetWeekStart "${targetWeekStart}": expected YYYY-MM-DD`);
    }

    if (targetWeekStart && targetWeekStart < currentWeekStartStr) {
        throw new Error(`Planning a past week is refused: ${targetWeekStart} is before current week ${currentWeekStartStr}`);
    }

    const weekStartStr = targetWeekStart || currentWeekStartStr;
    const weekStart = new Date(`${weekStartStr}T00:00:00`);
    if (Number.isNaN(weekStart.getTime())) {
        // Otherwise this reaches date-fns and comes back as a bare
        // `RangeError: Invalid time value` from whichever format() call runs first.
        throw new Error(`Invalid week start "${weekStartStr}" — could not be parsed as a date`);
    }
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    const sevenDaysAgo = format(subDays(now, 7), 'yyyy-MM-dd');

    // ── Parallel Fetch ───────────────────────────────────────────

    const [profileRes, profilePrefsRes, goalsRes, commitmentsRes, habitStacksRes, todayBlocksRes, weekBlocksRes, perfBlocksRes, coachLearningsRes, behaviorPatternsRes, energyStateRes] = await Promise.all([
        // 1. Profile
        db.from('profiles')
            // `full_name`, not `first_name` — the latter does not exist on this
            // table, and PostgREST rejects the WHOLE select when one column is
            // unknown. That failure was invisible: `profileRes.data` came back
            // null and the `||` fallback below quietly substituted 23:00–07:00
            // defaults, so every plan was built against a profile that wasn't
            // the user's.
            .select('id, full_name, preferred_name, sleep_start, sleep_end, wind_down_mins, wind_down_minutes, morning_routine_mins, energy_level, stress_level, meals_per_day, meal_windows, meal_times, body_preferences, bio_data, peak_windows, low_windows, weekend_intensity, timezone')
            .eq('id', userId)
            .maybeSingle(),

        // 1b. Profile Preferences (onboarding may write here)
        db.from('profile_preferences')
            .select('wake_time, sleep_start, meal_windows, meals_per_day, buffer_min, preferred_windows, workout_preference, workout_min_per_day, wind_down_min, morning_routine_min, is_workout_protected, weekend_intensity')
            .eq('user_id', userId)
            .maybeSingle(),

        // 2. Active Goals
        //
        // is_paused MUST be filtered here. Pausing a goal (from the goals page
        // or an accepted weekly review) sets is_paused and leaves status as
        // 'active', so a status-only filter scheduled paused goals anyway —
        // the planner was the one place in the app that didn't check it.
        //
        // The null branch is deliberate: rows predating the column would be
        // excluded outright by .eq('is_paused', false), silently emptying a
        // user's whole plan.
        db.from('goals')
            .select('id, title, pillar, category, importance, minutes_per_day, days_per_week, energy_demand, status, is_paused, ai_strategy, preferred_windows')
            .eq('user_id', userId)
            .eq('status', 'active')
            .or('is_paused.is.null,is_paused.eq.false')
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

        // 5. Today's Blocks
        db.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, status, block_type, goal_id, is_fixed, commitment_id, pillar, is_locked')
            .eq('user_id', userId)
            .eq('date', todayStr)
            .neq('status', 'cancelled')
            .order('start_time'),

        // 6. This Week's Blocks
        db.from('schedule_blocks')
            .select('id, date, start_time, end_time, title, status, block_type, goal_id, is_fixed, commitment_id, pillar, is_locked')
            .eq('user_id', userId)
            .gte('date', weekStartStr)
            .lte('date', weekEndStr)
            .neq('status', 'cancelled')
            .order('start_time')
            .limit(200),

        // 7. Performance (last 7 days blocks)
        db.from('schedule_blocks')
            .select('id, status')
            .eq('user_id', userId)
            .gte('date', sevenDaysAgo)
            .lte('date', todayStr)
            .neq('status', 'cancelled'),

        // 8. Coach Learnings (behavioral intelligence)
        db.from('coach_learnings')
            .select('learning, category, confidence_score')
            .eq('user_id', userId)
            .order('confidence_score', { ascending: false })
            .limit(10),

        // 9. Behavior Patterns (scheduling intelligence)
        db.from('behavior_patterns')
            .select('preferred_windows, completion_rates, avoidance_data, density_tolerance')
            .eq('user_id', userId)
            .maybeSingle(),

        // 10. Today's Energy Check-in
        db.from('user_states')
            .select('energy_level, emotional_state')
            .eq('user_id', userId)
            .maybeSingle(),
    ]);

    // ── Process Results ──────────────────────────────────────────

    // A query error and "this user has no profile row" are not the same thing,
    // and collapsing both into the defaults below is how a bad column name went
    // unnoticed. A broken query is a bug; say so rather than planning the week
    // for a fictional user.
    if (profileRes.error) {
        throw new Error(`Profile query failed: ${profileRes.error.message}`);
    }
    if (profilePrefsRes.error) {
        console.warn(`[CalendarContext] profile_preferences query failed: ${profilePrefsRes.error.message}`);
    }
    if (goalsRes.error) {
        throw new Error(`Goals query failed: ${goalsRes.error.message}`);
    }
    if (!profileRes.data) {
        console.warn(`[CalendarContext] no profile row for ${userId} — using defaults`);
    }

    const profileRaw = profileRes.data || {
        id: userId,
        full_name: 'User',
        sleep_start: '23:00',
        sleep_end: '07:00',
        wind_down_mins: 30,
    };

    // The context exposes `first_name`; the table stores `full_name`. Prefer the
    // name the user asked to be called by.
    const displayFirstName =
        (profileRaw as any).preferred_name?.trim() ||
        String((profileRaw as any).full_name || '').trim().split(/\s+/)[0] ||
        'User';

    // Merge profile_preferences (onboarding may write here)
    const prefs = profilePrefsRes.data || {};



    const profile = {
        ...profileRaw,
        // profile_preferences overrides when they exist
        ...resolveDaySettings(profileRaw, prefs),
        meal_windows: profileRaw.meal_windows || prefs.meal_windows || null,
        // Extract from bio_data
        meal_timing: (profileRaw.bio_data as any)?.meal_timing || 'normal',
        failure_modes: (profileRaw.bio_data as any)?.failure_modes || [],
        default_buffer_duration: prefs.buffer_min || (profileRaw.bio_data as any)?.default_buffer_duration || 10,
        weekend_intensity: prefs.weekend_intensity || profileRaw.weekend_intensity || 'light',
    };

    const goals = (goalsRes.data || []).map((g: any) => ({
        id: g.id,
        title: g.title,
        pillar: g.pillar || 'craft',
        category: g.category || 'general',
        importance: normalizeImportance(g.importance),
        minutes_per_day: g.minutes_per_day || 60,
        days_per_week: g.days_per_week || 5,
        weekly_target_minutes: (g.minutes_per_day || 60) * (g.days_per_week || 5),
        energy_demand: normalizeEnergyDemand(g.energy_demand),
        is_paused: g.is_paused === true,
        // Derived, not hardcoded: a paused goal is not active.
        is_active: g.is_paused !== true && g.status === 'active',
        ai_strategy: g.ai_strategy,
        preferred_time_of_day: (g.preferred_windows as any)?.time_of_day || undefined,
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

    // Computed by the single shared implementation, so the generator, the
    // plan-week route and the weekly-review proposals all describe the same
    // week. The old inline version omitted meals and the morning routine and
    // guessed buffers at 10% of the waking day.
    const weekCapacity = computeWeekCapacity(
        {
            sleep_start: profile.sleep_start,
            sleep_end: profile.sleep_end,
            wind_down_mins: profile.wind_down_mins,
            morning_routine_mins: profile.morning_routine_mins,
            meals_per_day: profile.meals_per_day,
        },
        goals.map((g: any) => ({
            minutes_per_day: g.minutes_per_day,
            days_per_week: g.days_per_week,
            is_paused: g.is_paused,
            status: 'active',
        })),
        commitments
    );

    const dailyAwakeHours = weekCapacity.awakeMinsPerWeek / 7 / 60;
    const weeklyCommittedHours = weekCapacity.commitmentMins / 60;
    const weeklyGoalHours = weekCapacity.targetedMins / 60;
    const weeklyAvailable = weekCapacity.availableMins / 60;

    console.log(`[Capacity] ${describeCapacity(weekCapacity)}`);

    // ── Performance ──────────────────────────────────────────────

    const allPerfBlocks = perfBlocksRes.data || [];
    const completedBlocks = allPerfBlocks.filter((b: any) => b.status === 'done' || b.status === 'completed');
    const totalBlocks = allPerfBlocks.length;
    const completionRate = totalBlocks > 0 ? (completedBlocks.length / totalBlocks) * 100 : 0;

    // ── New: Process behavioral intelligence ─────────────────────

    const coachLearnings = (coachLearningsRes.data || []).map((l: any) => ({
        learning: l.learning || '',
        category: l.category || 'general',
        confidence: l.confidence_score || 0.5,
    }));

    const behaviorPatternsRaw = behaviorPatternsRes.data;
    const behaviorPatterns = behaviorPatternsRaw ? {
        preferred_windows: (behaviorPatternsRaw.preferred_windows as any) || {},
        completion_rates: (behaviorPatternsRaw.completion_rates as any) || {},
        avoidance_data: (behaviorPatternsRaw.avoidance_data as any) || {},
        density_tolerance: (behaviorPatternsRaw.density_tolerance as any) || 8,
    } : null;

    const energyStateRaw = energyStateRes.data;
    const isFutureWeek = targetWeekStart && targetWeekStart > currentWeekStartStr;
    const dailyEnergyState = (energyStateRaw && !isFutureWeek) ? {
        energy_level: energyStateRaw.energy_level || 3,
        emotional_state: energyStateRaw.emotional_state || 'neutral',
    } : {
        energy_level: profile.energy_level || 3,
        emotional_state: 'neutral',
    };


    // ── New: Goal Progress (weekly tracking) ─────────────────────

    const completedWeekBlocks = weekBlocks.filter((b: any) =>
        (b.status === 'done' || b.status === 'completed') && b.goal_id
    );

    // Sum completed minutes per goal this week
    const completedMinutesByGoal = new Map<string, number>();
    for (const block of completedWeekBlocks) {
        if (!block.goal_id) continue;
        const startMins = timeToMinutes(block.start_time);
        const endMins = timeToMinutes(block.end_time);
        const duration = Math.max(0, endMins - startMins);
        completedMinutesByGoal.set(
            block.goal_id,
            (completedMinutesByGoal.get(block.goal_id) || 0) + duration
        );
    }

    // Calculate days remaining in the week (Mon=1 start)
    let daysRemainingInWeek = 7;
    if (isFutureWeek) {
        daysRemainingInWeek = 7;
    } else {
        const todayDow = now.getDay(); // 0=Sun
        daysRemainingInWeek = todayDow === 0 ? 0 : 7 - todayDow; // Sun=0 remaining, Mon=6, etc.
    }

    const goalProgress = goals.map((g: any) => {
        const completed = completedMinutesByGoal.get(g.id) || 0;
        const remaining = Math.max(0, g.weekly_target_minutes - completed);
        const daysLeft = Math.max(1, daysRemainingInWeek); // at least 1 to avoid div/0
        return {
            goal_id: g.id,
            goal_title: g.title,
            pillar: g.pillar,
            weekly_target_minutes: g.weekly_target_minutes,
            completed_minutes_target_week: completed,
            remaining_minutes: remaining,
            days_remaining_in_week: daysRemainingInWeek,
            daily_target_today: Math.ceil(remaining / daysLeft),
        };
    });

    // ── Build Context ────────────────────────────────────────────

    return {
        user: {
            id: userId,
            first_name: displayFirstName,
            sleep_start: profile.sleep_start || '23:00',
            sleep_end: profile.sleep_end || '07:00',
            wind_down_mins: profile.wind_down_mins || 30,
            morning_routine_mins: (profile as any).morning_routine_mins || 0,
            energy_level: profile.energy_level || 5,
            stress_level: profile.stress_level || 3,
            meals_per_day: profile.meals_per_day || 3,
            meal_windows: {
                ...deriveMealWindows(profile.meal_timing, profile.sleep_end),
                ...(typeof profile.meal_windows === 'object' && profile.meal_windows !== null ? profile.meal_windows : {})
            },
            body_preferences: profile.body_preferences || {},
            bio_data: profile.bio_data || {},
            default_buffer_duration: profile.default_buffer_duration || 10,
            chronotype: (profile.body_preferences as any)?.chronotype || 'bear',
            weekend_intensity: prefs?.weekend_intensity || profile.weekend_intensity || 'normal',
            timezone: (profile as any).timezone || DEFAULT_TIMEZONE,
        },

        goals,
        commitments,
        habitStacks,
        schedule: {
            today: todayBlocks,
            target_week: weekBlocks,
        },
        capacity: {
            daily_awake_hours: Math.round(dailyAwakeHours * 10) / 10,
            weekly_available_hours: Math.round(Math.max(0, weeklyAvailable) * 10) / 10,
            weekly_committed_hours: Math.round(weeklyCommittedHours * 10) / 10,
            weekly_goal_hours_needed: Math.round(weeklyGoalHours * 10) / 10,
            is_overcommitted: weekCapacity.isOvercommitted,
        },
        weekCapacity,
        performance: {
            last_7_days_completion_rate: Math.round(completionRate),
            total_blocks_last_7: totalBlocks,
            completed_blocks_last_7: completedBlocks.length,
        },
        current: {
            date: todayStr,
            time: currentTimeStr,
            day_of_week: getDayOfWeek(now),
        },

        // ── Behavioral Intelligence ──────────────────────────────
        coachLearnings,
        behaviorPatterns,
        dailyEnergyState,
        goalProgress,
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
        block_type: b.block_type || 'flex',
        goal_id: b.goal_id || undefined,
        is_fixed: b.is_fixed || false,
        commitment_id: b.commitment_id || undefined,
        pillar: b.pillar || undefined,
    };
}

function deriveMealWindows(mealTiming: string, wakeTime: string) {
    const wakeMins = timeToMinutes(wakeTime || '07:00');
    // Shift meal windows relative to wake time and timing preference
    const offsets: Record<string, { brkfst: number; lunch: number; dinner: number }> = {
        early:  { brkfst: 30,  lunch: 240, dinner: 540 },   // 30min after wake, ~4h, ~9h
        normal: { brkfst: 60,  lunch: 300, dinner: 660 },   // 1h after wake, ~5h, ~11h 
        late:   { brkfst: 120, lunch: 360, dinner: 720 },   // 2h after wake, ~6h, ~12h
    };
    const off = offsets[mealTiming] || offsets.normal;
    const fmt = (mins: number) => {
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    return {
        breakfast: { start: fmt(wakeMins + off.brkfst), end: fmt(wakeMins + off.brkfst + 90) },
        lunch:     { start: fmt(wakeMins + off.lunch),  end: fmt(wakeMins + off.lunch + 90) },
        dinner:    { start: fmt(wakeMins + off.dinner), end: fmt(wakeMins + off.dinner + 90) },
    };
}

