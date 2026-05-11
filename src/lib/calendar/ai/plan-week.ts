/**
 * 🗓️ PLANNRAI — PLAN WEEK DETERMINISTIC GENERATOR
 * Generates 3 weekly schedule variants using strict mathematical constraints.
 * Replaces unreliable LLM bin-packing with guaranteed day/minute accuracy.
 */

import type { CalendarContext } from '@/lib/calendar/context-builder';
import { addDays, format, parseISO } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────

export interface WeekPlanVariant {
    id: string;
    label: string;
    description: string;
    philosophy: string;
    blocks: PlanBlock[];
    stats: {
        total_blocks: number;
        total_hours: number;
        days_with_work: number;
        unscheduled_minutes: Record<string, number>;
    };
}

export interface PlanBlock {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    block_type: string;
    goal_id?: string;
    pillar?: string;
    checklist?: Array<{ text: string }>;
}

// ── Utilities ────────────────────────────────────────────────────

function calculateWindDown(ctx: CalendarContext): string {
    const sleepMins = timeToMinutes(ctx.user.sleep_start);
    const windDownStart = sleepMins - (ctx.user.wind_down_mins || 30);
    const h = Math.floor((windDownStart + 1440) % 1440 / 60);
    const m = (windDownStart + 1440) % 1440 % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function safeAddMins(hhmm: string, mins: number) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + mins) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

// ── Main Deterministic Generator ─────────────────────────────────

export async function generateWeekPlan(
    context: CalendarContext,
    weekStartDate: string,
    mode: 'balanced' | 'momentum' | 'recovery' = 'balanced',
    allowWeekend: boolean = true
): Promise<WeekPlanVariant[]> {
    const windDown = calculateWindDown(context);
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const windDownMins = timeToMinutes(windDown);

    // 1. Build Base Bio Blocks
    const bioTemplates = [];
    const mealsPerDay = context.user.meals_per_day || 3;
    const mealWindows = context.user.meal_windows || {};
    
    bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: '00:00', end: context.user.sleep_end || '07:00' });
    bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: context.user.sleep_start || '22:30', end: '23:59' });

    if (mealsPerDay >= 1) {
        const start = (mealWindows as any)?.breakfast?.start || '08:00';
        bioTemplates.push({ title: 'Breakfast', block_type: 'meal', start, end: safeAddMins(start, 30) });
    }
    if (mealsPerDay >= 2) {
        let start = (mealWindows as any)?.lunch?.start || '12:30';
        const startMins = timeToMinutes(start);
        if (startMins < 690 || startMins > 870) start = '12:30';
        bioTemplates.push({ title: 'Lunch', block_type: 'meal', start, end: safeAddMins(start, 45) });
    }
    if (mealsPerDay >= 3) {
        let start = '19:30';
        bioTemplates.push({ title: 'Dinner', block_type: 'meal', start, end: safeAddMins(start, 45) });
    }

    const commitmentsByDay = new Map<number, Array<{ start: number; end: number; title: string, type: string }>>();
    for (let i = 1; i <= 7; i++) commitmentsByDay.set(i, []);

    // Load anchors into exclusion zones
    for (const cmt of context.commitments) {
        if (!cmt.is_active) continue;
        const days = ((cmt.days_of_week || []) as any[]).map(Number);
        for (let d of days) {
            if (d === 0) d = 7;
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(cmt.start_time) - 15, // 15m buffer before
                end: timeToMinutes(cmt.end_time) + 15,   // 15m buffer after
                title: cmt.title,
                type: 'anchor'
            });
        }
    }

    // Load bio blocks into exclusion zones
    for (let d = 1; d <= 7; d++) {
        for (const bio of bioTemplates) {
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(bio.start),
                end: timeToMinutes(bio.end) + (bio.block_type === 'meal' ? 15 : 0), // 15m after meals
                title: bio.title,
                type: bio.block_type
            });
        }
    }

    // NEW: Load existing schedule blocks (fixed or done) into exclusion zones to prevent overwrites
    for (const block of context.schedule.this_week) {
        if (block.status === 'done' || block.is_fixed || block.commitment_id) {
            const date = parseISO(block.date);
            let d = date.getDay(); // 0=Sun
            if (d === 0) d = 7;
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(block.start_time),
                end: timeToMinutes(block.end_time),
                title: block.title,
                type: 'existing_block'
            });
        }
    }

    // Generate Variants
    const variants: WeekPlanVariant[] = [];

    if (mode === 'balanced') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Standard Balanced', 'Optimized distribution based on your current goal progress.', 'Consistency builds momentum.'));
        if (allowWeekend) {
            variants.push(generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Workday Focus', 'Balanced but strictly within weekdays to protect your recovery time.', 'Protects your weekends entirely.'));
        }
    } else if (mode === 'momentum') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'High Momentum', 'Aggressive front-loading to finish your weekly targets by Thursday.', 'Tackle the hardest things first.'));
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Hyper-Productive', 'Packs tasks with zero buffers for maximum efficiency.', 'Maximum output.', false, true));
    } else if (mode === 'recovery') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Gentle Recovery', 'Maximized gaps between sessions for mental resets.', 'Slow and steady.'));
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Quiet Weekend Recovery', 'Light load with a strict 4PM weekend cutoff.', 'Prioritizes weekend rest.', true));
    }

    return variants;
}

function generateVariant(
    ctx: CalendarContext,
    weekStart: string,
    allowWeekend: boolean,
    wakeMins: number,
    windDownMins: number,
    bioTemplates: any[],
    baseExclusions: Map<number, Array<{ start: number; end: number; title: string, type: string }>>,
    strategyId: string,
    label: string,
    description: string,
    philosophy: string,
    forceLightWeekend: boolean = false,
    forceBonusFill: boolean = false
): WeekPlanVariant {
    const blocks: PlanBlock[] = [];
    const unscheduled_minutes: Record<string, number> = {};

    // Track workload per day to intelligently distribute goals
    const workloadPerDay = new Map<number, number>();
    for (let i = 1; i <= 7; i++) workloadPerDay.set(i, 0);

    // 1. Add bio blocks directly to the schedule
    for (let day = 0; day < 7; day++) {
        const date = format(addDays(parseISO(weekStart), day), 'yyyy-MM-dd');
        for (const tmpl of bioTemplates) {
            blocks.push({
                date,
                start_time: tmpl.start,
                end_time: tmpl.end,
                title: tmpl.title,
                block_type: tmpl.block_type
            });
        }
    }

    // Deep copy exclusions so we can modify them per variant
    const exclusions = new Map<number, Array<{ start: number; end: number; title: string, type: string }>>();
    const weekendIntensity = forceLightWeekend ? 'light' : (ctx.user.weekend_intensity || 'normal');
    // Light weekend = hard 4PM (960 mins) cutoff on Sat/Sun
    const LIGHT_WEEKEND_CUTOFF = 960; // 16:00

    for (let [d, ex] of baseExclusions.entries()) {
        exclusions.set(d, ex.map(e => ({ ...e })));
    }

    // Sort goals: Largest Total Time first, then by importance
    const sortedGoals = [...ctx.goals].sort((a, b) => {
        const aTotal = (a.days_per_week || 5) * (a.minutes_per_day || 60);
        const bTotal = (b.days_per_week || 5) * (b.minutes_per_day || 60);
        if (bTotal !== aTotal) return bTotal - aTotal;
        return (b.importance || 5) - (a.importance || 5);
    });

    for (const goal of sortedGoals) {
        // NEW: Progress-aware scheduling. How much is ACTUALLY left to do?
        const progress = ctx.goalProgress?.find(p => p.goal_id === goal.id);
        const remainingMins = progress ? progress.remaining_minutes : (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
        
        if (remainingMins <= 0) continue; // Goal already reached for the week!

        const targetMinsPerDay = goal.minutes_per_day || 60;
        const targetDays = Math.max(1, Math.ceil(remainingMins / targetMinsPerDay));
        let daysPlaced = 0;

        // Determine preferred days based on strategy
        let preferredDays = [1, 2, 3, 4, 5, 6, 7];
        if (!allowWeekend) preferredDays = [1, 2, 3, 4, 5];

        if (strategyId === 'momentum') {
            // Front load: prioritize Mon-Sun. If workloads are equal, go early.
            // If Mon is full, Tue is next best.
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                // Primary sort by day index, but allow some load balancing if one day is already extremely heavy
                const weightA = a * 1000 + loadA;
                const weightB = b * 1000 + loadB;
                return weightA - weightB;
            });
        } else if (strategyId === 'recovery') {
            // Space out: prioritize days with the absolute LEAST workload.
            // This spreads 5 tasks across 7 days with massive gaps.
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return b - a; // Tie breaker: later in the week
            });
        } else if (strategyId === 'balanced') {
            // Balanced: sort by workload, then by day index to keep it standard.
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return a - b;
            });
        }

        let failedMins = 0;

        for (const isoDay of preferredDays) {
            if (daysPlaced >= targetDays) break;

            const isWeekend = isoDay >= 6;
            const dailyMins = targetMinsPerDay;

            // For light weekends, cap the scheduling window at 4PM
            const dayWindDown = (isWeekend && weekendIntensity === 'light') ? LIGHT_WEEKEND_CUTOFF : windDownMins;

            const dayExclusions = exclusions.get(isoDay)!;
            const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');

            // Check if there is already a block for this goal on this day (to avoid double-booking the same goal on same day)
            const alreadyHasGoal = blocks.some(b => b.date === dateStr && b.goal_id === goal.id);
            if (alreadyHasGoal) continue;

            // Find available windows
            dayExclusions.sort((a, b) => a.start - b.start);
            const windows: Array<{ start: number; end: number }> = [];
            let cursor = wakeMins;

            for (const ex of dayExclusions) {
                // Buffer logic: if goal is body pillar, need 30m buffer after meals
                let exEnd = ex.end;
                if (goal.pillar === 'body' && ex.type === 'meal') {
                    exEnd += 15; // Base meal has 15m buffer, so +15 = 30m buffer total
                }

                if (cursor < ex.start) {
                    windows.push({ start: cursor, end: ex.start });
                }
                cursor = Math.max(cursor, exEnd);
            }
            if (cursor < dayWindDown) {
                windows.push({ start: cursor, end: dayWindDown });
            }

            // Find a window that can fit dailyMins
            let placed = false;
            
            // NEW: Pillar-intelligent window sorting.
            // Mind -> Morning, Body -> Afternoon/Peaks, Craft -> Morning/Afternoon.
            windows.sort((a, b) => {
                if (goal.pillar === 'mind') return a.start - b.start; // Prefer morning
                if (goal.pillar === 'body') {
                    const aIsAfternoon = a.start >= 720; // 12:00
                    const bIsAfternoon = b.start >= 720;
                    if (aIsAfternoon && !bIsAfternoon) return -1;
                    if (!aIsAfternoon && bIsAfternoon) return 1;
                    return a.start - b.start;
                }
                return a.start - b.start;
            });

            for (const win of windows) {
                if (win.end - win.start >= dailyMins) {
                    // Fit it here!
                    let start = win.start;
                    
                    // Pillar-specific placement within window
                    if (goal.pillar === 'mind' && win.start < 720) {
                         // Mind goals in morning windows should be pushed to the start
                    } else if (goal.pillar === 'body') {
                         // Body goals can be pushed slightly later in the window for digestion
                         if (win.end - win.start > dailyMins + 30) start += 15;
                    }
                    
                    // Dynamic Buffer based on strategy (affects footprint on the calendar)
                    let buffer = 10;
                    if (strategyId === 'momentum') buffer = 0;
                    else if (strategyId === 'balanced') buffer = 30;
                    else if (strategyId === 'recovery') buffer = 90;

                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + dailyMins),
                        title: goal.title,
                        block_type: 'goal',
                        goal_id: goal.id,
                        pillar: goal.pillar,
                        checklist: goal.ai_strategy?.checklist || [{text: "Focus session"}, {text: "Review progress"}]
                    });

                    // Add to exclusions for this day with strategy-specific buffer
                    dayExclusions.push({
                        start: start,
                        end: start + dailyMins + buffer,
                        title: goal.title,
                        type: 'goal'
                    });

                    // Update workload tracker
                    workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + dailyMins);

                    daysPlaced++;
                    placed = true;
                    break;
                }
            }
        }

        if (daysPlaced < targetDays) {
            failedMins += (targetDays - daysPlaced) * targetMinsPerDay;
            unscheduled_minutes[goal.title] = failedMins;
        }
    }

    // Phase 2: Bonus Fill — REMOVED
    // Previously, this loop kept cramming additional blocks for each goal into every
    // free window, causing goals set to 90 min/day to fill 5-6 slots per day.
    // Each goal is now placed exactly once per day (at minutes_per_day duration)
    // up to days_per_week times. No bonus blocks.

    // Post-process blocks: reorder body goals for each day to place them at the ends of the day
    const processedBlocks: PlanBlock[] = [];
    const dates = Array.from(new Set(blocks.map(b => b.date)));

    for (const d of dates) {
        const dayBlocks = blocks.filter(b => b.date === d);

        const bodyBlocks = dayBlocks.filter(b => b.pillar === 'body' || b.block_type === 'body' || (b.title && (b.title.toLowerCase().includes('workout') || b.title.toLowerCase().includes('gym') || b.title.toLowerCase().includes('exercise') || b.title.toLowerCase().includes('football'))));
        if (bodyBlocks.length < 2) {
            processedBlocks.push(...dayBlocks);
            continue;
        }

        const activeBodyBlocks = bodyBlocks.slice(0, 2);
        const extraBodyBlocks = bodyBlocks.slice(2);
        extraBodyBlocks.forEach(b => {
            b.pillar = 'mind'; // convert extra to mind
        });

        const nonBodyBlocks = dayBlocks.filter(b => !activeBodyBlocks.includes(b));
        const goalSlots = nonBodyBlocks.filter(b => b.block_type === 'goal' || b.block_type === 'flex');

        if (goalSlots.length === 0) {
            processedBlocks.push(...dayBlocks);
            continue;
        }

        goalSlots.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

        const orderedGoals = [activeBodyBlocks[0], ...goalSlots, activeBodyBlocks[1]];
        const allGoalTimes = [
            ...goalSlots.map(g => ({ start: g.start_time, end: g.end_time })),
            ...activeBodyBlocks.map(g => ({ start: g.start_time, end: g.end_time }))
        ].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

        for (let i = 0; i < orderedGoals.length; i++) {
            if (i < allGoalTimes.length) {
                orderedGoals[i].start_time = allGoalTimes[i].start;
                orderedGoals[i].end_time = allGoalTimes[i].end;
            }
        }

        const otherBlocks = nonBodyBlocks.filter(b => b.block_type !== 'goal' && b.block_type !== 'flex');
        const finalDayBlocks = [...otherBlocks, ...orderedGoals].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
        processedBlocks.push(...finalDayBlocks);
    }

    const finalBlocks = processedBlocks.length > 0 ? processedBlocks : blocks;

    const totalMins = finalBlocks.reduce((sum, b) => {
        if (b.block_type === 'sleep' || b.block_type === 'meal') return sum;
        return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0);

    const uniqueDays = new Set(finalBlocks.filter(b => b.block_type === 'goal').map(b => b.date));

    return {
        id: strategyId,
        label,
        description,
        philosophy,
        blocks: finalBlocks,
        stats: {
            total_blocks: finalBlocks.length,
            total_hours: Math.round(totalMins / 60 * 10) / 10,
            days_with_work: uniqueDays.size,
            unscheduled_minutes,
        }
    };
}
