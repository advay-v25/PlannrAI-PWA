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

    // Time slots by category preference
    const categoryTimes: Record<string, string> = {
        body: '07:30',
        mind: '09:00',
        craft: '19:00',
    };

    const schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id: string; type: string }>> = {
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
    };

    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    // Initialize Schedule with Anchors
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // 0-6 index matches JS Date.getDay()
    // But our schedule keys are 'mon'...'sun'.
    // Mapping: 0->sun, 1->mon, etc.
    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    commitments.forEach(anchor => {
        anchor.days_of_week.forEach(dayIndex => {
            // specific day index (0=Sun, 1=Mon...)
            const dayKey = keyMap[dayIndex];
            if (schedule[dayKey]) {
                schedule[dayKey].push({
                    time: anchor.start_time,
                    end_time: anchor.end_time,
                    title: anchor.title || 'Fixed Commitment', // Ensure title exists
                    goal_id: 'ANCHOR', // Special ID
                    type: 'anchor'
                });
            }
        });
    });

    // Sort goals by importance
    const sortedGoals = [...goals].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.importance as keyof typeof order] || 1) - (order[b.importance as keyof typeof order] || 1);
    });

    // Assign each goal to appropriate days
    sortedGoals.forEach(goal => {
        const startTime = categoryTimes[goal.category] || '09:00';
        const duration = lowEnergy ? Math.round(goal.minutes_per_day * 0.7) : goal.minutes_per_day;
        const endTime = addMinutesToTime(startTime, duration);

        // High priority: 6 days, medium: 5 days, low: 4 days
        const activeDays = goal.importance === 'high' ? 6 : goal.importance === 'medium' ? 5 : 4;

        days.slice(0, activeDays).forEach(day => {
            schedule[day].push({
                time: startTime,
                end_time: endTime,
                title: goal.title,
                goal_id: goal.id,
                type: 'goal',
            });
        });
    });

    // Post-MVP: Insert Flex Zones (16:00-17:00)
    // We do this AFTER goals for now to ensure we don't block high priority work, 
    // BUT strictly, flex zones should be protected.
    // For static plan, let's just add them.
    days.forEach(day => {
        schedule[day].push({
            time: '16:00',
            end_time: '17:00',
            title: 'Flex Zone',
            goal_id: 'FLEX',
            type: 'flex'
        });
    });

    return {
        schedule,
        reasoning: {
            overview: `Scheduled ${goals.length} goals across the week based on category and priority`,
            energy_considerations: lowEnergy
                ? 'Reduced durations by 30% due to low energy mode'
                : 'Normal energy levels assumed',
            balance: 'Morning for body, mid-morning for mind, evening for future goals',
        },
        flexibility: days.flatMap(day =>
            schedule[day].map(slot => ({
                day,
                time: slot.time,
                moveable: true,
                alternatives: [addMinutesToTime(slot.time, 60), addMinutesToTime(slot.time, 120)],
            }))
        ),
        tips: [
            'Start with the most important task when your energy is highest',
            'Take short breaks between sessions',
            'Review and adjust the schedule based on what works for you',
        ],
    };
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
