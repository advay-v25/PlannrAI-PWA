// @ts-nocheck
import { SupabaseClient } from '@supabase/supabase-js';
import { runAI } from '@/lib/ai/run-ai';


export interface WeekPlanResult {
    plan: {
        schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id: string; type: string }>>;
        reasoning: any;
        flexibility?: any[];
        tips: string[];
    };
    source: 'ai' | 'template' | 'empty';
    message: string;
    analysis?: any; // To store the Constitution-compliant response metadata
}

/**
 * Generates an AI-powered week plan using the Neural Synthesis engine.
 */
export async function generateAIWeekPlan(
    userId: string,
    goals: Array<{ id: string; title: string; category: string; minutes_per_day: number; importance: string }>,
    profile: {
        preferred_name?: string;
        sleep_end?: string;
        sleep_start?: string;
        low_energy_mode?: boolean;
        energy_level?: number;
        stress_level?: number;
        workValues?: any;
        biologicalValues?: any;
    } | null,
    commitments: Array<{ days_of_week: number[]; start_time: string; end_time: string; title?: string }>
): Promise<WeekPlanResult> {

    // Construct simplified context
    const onboardingContext = {
        role: 'planner',
        goals: goals.map(g => ({ title: g.title, category: g.category, minutes: g.minutes_per_day, importance: g.importance })),
        preferences: profile,
        constraints: {
            work_start: profile?.workValues?.workStartHours,
            work_end: profile?.workValues?.workEndHours,
            sleep_start: profile?.biologicalValues?.sleepTarget || profile?.sleep_start
        },
        commitments: commitments.map(c => ({ title: c.title, days: c.days_of_week, start: c.start_time, end: c.end_time }))
    };

    try {
        const response = await runAI({
            channel: 'onboarding',
            input: "Generate initial week plan",
            context: onboardingContext,
            userId,
            twoPass: true,
            maxTokens: 4000,
        });

        if (response.mode === 'refuse') {
            return {
                plan: generateStaticWeekPlan(goals, profile, commitments),
                source: 'template',
                message: `AI_REFUSAL: ${response.summary}`,
                analysis: response
            };
        }

        // The Constitution returns a Patch (via options). 
        // We need to convert this Patch (list of create_event ops) back into the 
        // structure expected by the UI.

        const plan: any = { schedule: {} };
        const dayMap: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

        const option = response.options?.[0]; // Take the first option/plan
        let hasAiSchedule = false;

        if (option && option.patch && option.patch.ops) {
            for (const op of option.patch.ops) {
                if (op.op === 'create_event') {
                    // payload: { day_offset: 0-6, start: "09:00", end: "10:00", title: "Work" }
                    const pl = op.payload as any;
                    const dayName = dayMap[pl.day_offset ?? 0] || 'mon';
                    if (!plan.schedule[dayName]) plan.schedule[dayName] = [];

                    plan.schedule[dayName].push({
                        time: pl.start,
                        end_time: pl.end,
                        title: pl.title || 'Focus Block',
                        goal_id: pl.goal_id || 'AI_GEN',
                        type: 'goal'
                    });
                    hasAiSchedule = true;
                }
            }
        }

        // Fill empty days
        ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(d => {
            if (!plan.schedule[d]) plan.schedule[d] = [];
        });

        if (!hasAiSchedule) {
            console.warn("AI returned no schedule ops, falling back to static.");
            return {
                plan: generateStaticWeekPlan(goals, profile, commitments),
                source: 'template',
                message: response.summary,
                analysis: response
            };
        }

        return {
            plan: {
                schedule: plan.schedule,
                reasoning: { overview: response.summary },
                tips: ["Review your plan", "Adjust as needed"]
            },
            source: 'ai',
            message: response.summary,
            analysis: response
        };

    } catch (e) {
        console.error("Onboarding Generation Error", e);
        return {
            plan: generateStaticWeekPlan(goals, profile, commitments),
            source: 'template',
            message: "AI generation failed, used fallback.",
        };
    }
}

/**
 * Generates a static week plan based on goals and profile.
 * This is deterministic and safe for immediate onboarding generation.
 */
export function generateStaticWeekPlan(
    goals: Array<{ id: string; title: string; category: string; minutes_per_day: number; importance: string }>,
    profile: {
        sleep_end?: string; sleep_start?: string; low_energy_mode?: boolean;
        wind_down_mins?: number; meals_per_day?: number;
        meal_windows?: { breakfast?: string; lunch?: string; dinner?: string };
        buffer_config?: { gap_mins?: number; type?: string };
    } | null,
    commitments: Array<{ days_of_week: number[]; start_time: string; end_time: string; title?: string }>
) {
    const wakeTime = profile?.sleep_end || '07:00';
    const sleepTime = profile?.sleep_start || '23:00';
    const lowEnergy = profile?.low_energy_mode || false;
    const windDownMins = profile?.wind_down_mins || 30;
    const morningRoutineMins = (profile as any)?.morning_routine_mins || 0;
    const mealWindows = profile?.meal_windows || { breakfast: '08:00', lunch: '12:30', dinner: '19:00' };
    const bufferGapMins = profile?.buffer_config?.gap_mins || 15;

    // Time slots by category preference (start search here)
    const categoryTimes: Record<string, string> = {
        body: '07:30',
        mind: '09:00',
        craft: '14:00', // Moved to afternoon to spread load
        routine: '07:00'
    };

    const periodMap = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    // 0=Sun in DB/JS, but we want 0=Mon for array indexing convenience? 
    // Actually existing code maps 0->sun, 1->mon. Let's stick to consistent key map.
    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    const schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id: string; type: string }>> = {
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
    };

    // Track state per day
    const dayState: Record<string, {
        occupied: Array<{ start: number; end: number }>; // minutes from midnight
        categories: Set<string>;
        anchors: Set<string>; // Titles of anchors
    }> = {};

    periodMap.forEach(d => {
        dayState[d] = { occupied: [], categories: new Set(), anchors: new Set() };
    });

    // Helper: Time string to minutes
    const toMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    // Helper: Minutes to Time string
    const toTime = (m: number) => {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };

    // Block morning routine time at the start of every day (invisible constraint)
    if (morningRoutineMins > 0) {
        const wakeMinsNum = toMins(wakeTime);
        const mrEnd = wakeMinsNum + morningRoutineMins;
        periodMap.forEach(d => {
            dayState[d].occupied.push({ start: wakeMinsNum, end: mrEnd });
        });
    }

    // 1. Place Anchors
    commitments.forEach(anchor => {
        anchor.days_of_week.forEach(dayIndex => {
            const dayKey = keyMap[dayIndex];
            if (schedule[dayKey]) {
                const s = toMins(anchor.start_time);
                const e = toMins(anchor.end_time);

                schedule[dayKey].push({
                    time: anchor.start_time,
                    end_time: anchor.end_time,
                    title: anchor.title || 'Fixed Commitment',
                    goal_id: 'ANCHOR',
                    type: 'anchor'
                });

                dayState[dayKey].occupied.push({ start: s, end: e });
                if (anchor.title) dayState[dayKey].anchors.add(anchor.title.toLowerCase());

                // Heuristic: Infer category from title for exclusivity
                if (anchor.title?.match(/gym|workout|run|fitness/i)) dayState[dayKey].categories.add('body');
                if (anchor.title?.match(/study|class|learn/i)) dayState[dayKey].categories.add('mind');
            }
        });
    });

    // 2. Sort Goals by Importance
    const sortedGoals = [...goals].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.importance as keyof typeof order] || 1) - (order[b.importance as keyof typeof order] || 1);
    });

    // 3. Schedule Goals
    sortedGoals.forEach(goal => {
        // A. Filter out days where Anchor satisfies this goal
        const daysRequired = goal.importance === 'high' ? 6 : goal.importance === 'medium' ? 5 : 3; // Reduced Low to 3 for breathing room

        // Check if anchor title partially matches (naive dedupe)
        // Count how many days this goal is ALREADY covered by anchors
        let coveredDays = 0;
        periodMap.forEach(d => {
            if (dayState[d].anchors.has(goal.title.toLowerCase())) coveredDays++;
        });

        const remainingDays = Math.max(0, daysRequired - coveredDays);
        if (remainingDays === 0) return; // Fully covered by anchors

        const duration = lowEnergy ? Math.round(goal.minutes_per_day * 0.7) : goal.minutes_per_day;

        // B. Select Candidate Days
        // Score days: 
        // +100 if day has this category already (Bad)
        // +10  if day is crowded (occupied time)
        // +0   if free
        const scoredDays = periodMap.map(day => {
            let score = 0;
            // Exclusivity: Mute score if category exists
            if (dayState[day].categories.has(goal.category)) score += 100;

            // Load Balance: Add score for used minutes
            const usedMins = dayState[day].occupied.reduce((sum, s) => sum + (s.end - s.start), 0);
            score += usedMins / 10;

            // Anchor Conflict: If exact title anchor exists, score is Infinite (don't duplicate)
            if (dayState[day].anchors.has(goal.title.toLowerCase())) score += 10000;

            return { day, score };
        });

        // Sort by score ascending (Prefer empty, non-clashing days)
        scoredDays.sort((a, b) => a.score - b.score);

        // Pick top N days
        const targetDays = scoredDays.slice(0, remainingDays).map(d => d.day);

        // C. Place in Day
        targetDays.forEach(day => {
            const dayEnd = toMins(sleepTime);
            const dayStartCap = toMins(wakeTime);
            const buffer = 15;

            // Biological Rhythm Scoring
            // Higher is better for this goal
            const getEnergyFit = (timeMins: number) => {
                const hour = timeMins / 60;
                if (goal.category === 'mind') {
                    // Peak Focus: 8 AM - 12 PM
                    if (hour >= 8 && hour <= 12) return 100;
                    if (hour > 12 && hour <= 15) return 50;
                    return 0;
                }
                if (goal.category === 'body') {
                    // Physical Peak: Morning (7-9) or Early Evening (16-18)
                    if (hour >= 7 && hour <= 9) return 80;
                    if (hour >= 16 && hour <= 18) return 100;
                    return 20;
                }
                if (goal.category === 'craft') {
                    // Afternoon flow: 13 PM - 17 PM
                    if (hour >= 13 && hour <= 17) return 100;
                    return 30;
                }
                return 50;
            };

            // Find Gap
            const occupied = dayState[day].occupied.sort((a, b) => a.start - b.start);
            let bestSlot = -1;
            let highestEnergyScore = -1;

            // Scan slots to find the one with the best biological fit
            let current = dayStartCap;

            // Check all potential slots in 15min increments
            while (current + duration <= dayEnd) {
                if (isFree(occupied, current, current + duration)) {
                    const score = getEnergyFit(current);
                    if (score > highestEnergyScore) {
                        highestEnergyScore = score;
                        bestSlot = current;
                    }
                }
                current += 15;
            }

            if (bestSlot !== -1) {
                const sStr = toTime(bestSlot);
                const eStr = toTime(bestSlot + duration);

                schedule[day].push({
                    time: sStr,
                    end_time: eStr,
                    title: goal.title,
                    goal_id: goal.id,
                    type: 'goal',
                });

                dayState[day].occupied.push({ start: bestSlot, end: bestSlot + duration });
                dayState[day].categories.add(goal.category);
            }
        });
    });

    // 4. Flex Zones (Smartly placed)
    periodMap.forEach(day => {
        const duration = 60;
        const target = toMins('16:00');
        const occupied = dayState[day].occupied.sort((a, b) => a.start - b.start);

        let start = -1;
        if (isFree(occupied, target, target + duration)) {
            start = target;
        } else {
            const last = occupied[occupied.length - 1];
            if (last && (toMins(sleepTime) - last.end > 90)) {
                start = last.end + 30;
            }
        }

        if (start !== -1) {
            schedule[day].push({
                time: toTime(start),
                end_time: toTime(start + duration),
                title: 'Flex Zone',
                goal_id: 'FLEX',
                type: 'flex'
            });
            dayState[day].occupied.push({ start, end: start + duration });
        }
    });

    // 5. Meal Blocks
    const mealSlots = [
        { key: 'breakfast', label: 'Breakfast', time: mealWindows.breakfast || '08:00' },
        { key: 'lunch', label: 'Lunch', time: mealWindows.lunch || '12:30' },
        { key: 'dinner', label: 'Dinner', time: mealWindows.dinner || '19:00' },
    ];

    periodMap.forEach(day => {
        mealSlots.forEach(meal => {
            const mStart = toMins(meal.time);
            const mDuration = 30;
            const occupied = dayState[day].occupied;
            if (isFree(occupied, mStart, mStart + mDuration)) {
                schedule[day].push({
                    time: toTime(mStart),
                    end_time: toTime(mStart + mDuration),
                    title: meal.label,
                    goal_id: 'MEAL',
                    type: 'meal'
                });
                dayState[day].occupied.push({ start: mStart, end: mStart + mDuration });
            }
        });
    });

    // 6. Wind-down Block (before sleep)
    periodMap.forEach(day => {
        const sleepMins = toMins(sleepTime);
        const rawWdStart = sleepMins - windDownMins;
        // Handle midnight sleep (sleepTime = '00:00' → sleepMins = 0): wind down wraps to end of previous day
        const wdStart = rawWdStart >= 0 ? rawWdStart : rawWdStart + 1440;
        const wdEnd = sleepMins === 0 ? 1439 : sleepMins;
        const wdEndStr = sleepMins === 0 ? '23:59' : sleepTime;
        if (wdStart > 0 && wdStart < wdEnd && isFree(dayState[day].occupied, wdStart, wdEnd)) {
            schedule[day].push({
                time: toTime(wdStart),
                end_time: wdEndStr,
                title: 'Wind Down',
                goal_id: 'WIND_DOWN',
                type: 'wind_down'
            });
            dayState[day].occupied.push({ start: wdStart, end: wdEnd });
        }
    });

    // 7. Sleep Block
    periodMap.forEach(day => {
        schedule[day].push({
            time: sleepTime,
            end_time: wakeTime,
            title: 'Sleep',
            goal_id: 'SLEEP',
            type: 'sleep'
        });
    });

    return {
        schedule,
        reasoning: {
            overview: `Scheduled ${goals.length} goals with meals, buffers, wind-down, and sleep blocks.`,
            energy_considerations: lowEnergy
                ? 'Reduced durations by 30% due to low energy mode'
                : 'Normal energy levels assumed',
            balance: 'Distributed body/mind tasks to separate days where possible.',
        },
        flexibility: periodMap.flatMap(day =>
            schedule[day].map(slot => ({
                day,
                time: slot.time,
                moveable: slot.type === 'goal',
                alternatives: [],
            }))
        ),
        tips: [
            'Start with the most important task when your energy is highest',
            'Take short breaks between sessions',
            'Review and adjust the schedule based on what works for you',
        ],
    };
}

function isFree(occupied: Array<{ start: number; end: number }>, start: number, end: number) {
    for (const slot of occupied) {
        if (Math.max(start, slot.start) < Math.min(end, slot.end)) return false;
    }
    return true;
}

function addMinutesToTime(time: string, minutes: number): string {
    const [hours, mins] = time.split(':').map(Number);
    const totalMins = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMins / 60) % 24;
    const newMins = totalMins % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

// Sentinel goal_ids used by static plan — not real goals
const SENTINEL_IDS = new Set(['ANCHOR', 'MEAL', 'SLEEP', 'WIND_DOWN', 'FLEX', 'BUFFER']);

/**
 * Persists a plan to the database.
 * Snapshots current schedule into schedule_versions before writing.
 */
export async function persistWeekPlan(
    userId: string,
    plan: { schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id?: string; type?: string }>> },
    weekStart: string,
    supabase: SupabaseClient,
    source: 'onboarding' | 'ai_optimize' | 'manual' = 'onboarding'
): Promise<{ blocksInserted: number; versionId: string | null }> {
    if (!plan?.schedule || !weekStart) {
        throw new Error('Plan and week_start are required');
    }

    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const endDateStr = endDate.toISOString().split('T')[0];

    // 1. Snapshot existing blocks for undo
    let versionId: string | null = null;
    try {
        const { data: existingBlocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', endDateStr);

        if (existingBlocks && existingBlocks.length > 0) {
            const { data: version } = await supabase
                .from('schedule_versions')
                .insert({
                    user_id: userId,
                    week_start: weekStart,
                    source,
                    snapshot: existingBlocks,
                })
                .select('id')
                .single();
            versionId = version?.id || null;
        }
    } catch (e) {
        console.warn('[persistWeekPlan] Failed to snapshot — schedule_versions table may not exist yet', e);
    }

    // 2. Build blocks array
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const blocks: Array<{
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
        goal_id: string | null;
        title: string;
        context: string;
        status: string;
        block_type: string;
    }> = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dayName = dayMap[date.getDay()];
        const daySchedule = plan.schedule[dayName] || [];

        for (const slot of daySchedule) {
            // Skip anchors — they are persisted as commitments
            if (slot.goal_id === 'ANCHOR' || slot.type === 'anchor') continue;

            const blockType = slot.type || 'goal';
            const goalId = SENTINEL_IDS.has(slot.goal_id || '') ? null : (slot.goal_id || null);

            blocks.push({
                user_id: userId,
                date: date.toISOString().split('T')[0],
                start_time: slot.time.trim(),
                end_time: slot.end_time.trim(),
                goal_id: goalId,
                title: slot.title,
                context: slot.title,
                status: 'planned',
                block_type: blockType,
            });
        }
    }

    if (blocks.length === 0) return { blocksInserted: 0, versionId };

    // 3. Clear existing planned blocks (protect done/anchor/fixed)
    await supabase
        .from('schedule_blocks')
        .delete()
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', endDateStr)
        .eq('status', 'planned')
        .neq('is_fixed', true);

    // 4. Insert new blocks
    const { data, error } = await supabase
        .from('schedule_blocks')
        .insert(blocks)
        .select();

    if (error) throw error;

    return { blocksInserted: data?.length || 0, versionId };
}
