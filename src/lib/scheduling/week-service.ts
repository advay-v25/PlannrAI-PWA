import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

export interface WeekPlanResult {
    plan: {
        schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id: string; type: string }>>;
        reasoning: any;
        flexibility: any[];
        tips: string[];
    };
    source: 'ai' | 'template' | 'empty';
    message: string;
}

/**
 * Generates a static week plan based on goals and profile.
 * This is deterministic and safe for immediate onboarding generation.
 */
export function generateStaticWeekPlan(
    goals: Array<{ id: string; title: string; category: string; minutes_per_day: number; importance: string }>,
    profile: { sleep_end?: string; sleep_start?: string; low_energy_mode?: boolean } | null,
    commitments: Array<{ days_of_week: number[]; start_time: string; end_time: string; title?: string }>
) {
    const wakeTime = profile?.sleep_end || '07:00';
    const sleepTime = profile?.sleep_start || '23:00';
    const lowEnergy = profile?.low_energy_mode || false;

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
        let daysRequired = goal.importance === 'high' ? 6 : goal.importance === 'medium' ? 5 : 3; // Reduced Low to 3 for breathing room

        // Check if anchor title partially matches (naive dedupe)
        // Count how many days this goal is ALREADY covered by anchors
        let coveredDays = 0;
        periodMap.forEach(d => {
            if (dayState[d].anchors.has(goal.title.toLowerCase())) coveredDays++;
        });

        let remainingDays = Math.max(0, daysRequired - coveredDays);
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
            const preferredStart = toMins(categoryTimes[goal.category] || '09:00');
            const dayEnd = toMins(sleepTime);
            const dayStartCap = toMins(wakeTime);

            // Find Gap
            // Sort occupied slots
            const occupied = dayState[day].occupied.sort((a, b) => a.start - b.start);

            let bestSlot = -1;

            // Try preferred time first
            if (isFree(occupied, preferredStart, preferredStart + duration)) {
                bestSlot = preferredStart;
            } else {
                // Scan for ANY free slot starting from wake time
                let candidate = dayStartCap;
                // Add tiny buffer between tasks (e.g. 15 mins)
                const buffer = 15;

                for (let i = 0; i < occupied.length; i++) {
                    const slot = occupied[i];
                    // Check gap before this slot
                    if (slot.start - candidate >= duration + buffer) {
                        bestSlot = candidate + buffer; // Add buffer
                        break;
                    }
                    candidate = Math.max(candidate, slot.end);
                }
                // Check gap after last slot
                if (bestSlot === -1 && (dayEnd - candidate >= duration + buffer)) {
                    bestSlot = candidate + buffer;
                }
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
        // Try to place flex zone at 16:00, else find room
        const duration = 60;
        const target = toMins('16:00');
        const occupied = dayState[day].occupied.sort((a, b) => a.start - b.start);

        let start = -1;
        if (isFree(occupied, target, target + duration)) {
            start = target;
        } else {
            // Find end of day slot
            const last = occupied[occupied.length - 1];
            if (last && (toMins(sleepTime) - last.end > 90)) {
                start = last.end + 30; // 30 min after last task
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
        }
    });

    return {
        schedule,
        reasoning: {
            overview: `Smartly scheduled ${goals.length} goals, balancing categories and avoiding weekend overload.`,
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

/**
 * Persists a plan to the database.
 */
export async function persistWeekPlan(
    userId: string,
    plan: { schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id?: string }>> },
    weekStart: string,
    supabase: SupabaseClient
) {
    if (!plan?.schedule || !weekStart) {
        throw new Error('Plan and week_start are required');
    }

    const startDate = new Date(weekStart);
    const blocks: Array<{
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
        goal_id: string | null;
        context: string;
        status: string;
    }> = [];

    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    // Generate blocks for each day
    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dayName = dayMap[date.getDay()];
        const daySchedule = plan.schedule[dayName] || [];

        for (const slot of daySchedule) {
            blocks.push({
                user_id: userId,
                date: date.toISOString().split('T')[0],
                start_time: slot.time,
                end_time: slot.end_time,
                goal_id: slot.goal_id || null,
                context: slot.title,
                status: 'planned'
            });
        }
    }

    if (blocks.length === 0) return 0;

    // Clear existing blocks for this week first (Safety check: don't delete history if run late?)
    // Onboarding runs for "Next Monday" or "Tomorrow"? Usually "From Today".
    // Let's assume safe delete for future blocks.
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    await supabase
        .from('schedule_blocks')
        .delete()
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', endDate.toISOString().split('T')[0])
        .eq('status', 'planned')
        .neq('block_type', 'routine')
        .neq('block_type', 'anchor') // V5: Protect Anchors
        .neq('is_fixed', true);      // V5: Protect Locked Blocks

    // Insert new blocks (Filter out anchors, they are already there!)
    const validBlocks = blocks.filter(b => b.goal_id !== 'ANCHOR' && (b as any).type !== 'anchor');

    const { data, error } = await supabase
        .from('schedule_blocks')
        .insert(validBlocks)
        .select();

    if (error) throw error;

    return data?.length || 0;
}
