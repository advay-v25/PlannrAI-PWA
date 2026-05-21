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

// ── Protocol Config (from SchedulingProtocol) ───────────────────

export interface ProtocolConfig {
    bufferMinutes?: number;
    maxGoalBlocksPerDay?: number;
    maxDeepWorkMins?: number;
}

// ── Main Deterministic Generator ─────────────────────────────────

export async function generateWeekPlan(
    context: CalendarContext,
    weekStartDate: string,
    mode: 'balanced' | 'momentum' | 'recovery' = 'balanced',
    allowWeekend: boolean = true,
    protocolConfig?: ProtocolConfig
): Promise<WeekPlanVariant[]> {
    const windDown = calculateWindDown(context);
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const windDownMins = timeToMinutes(windDown);
    // We no longer manually constrain windows with wakeMins and windDownMins.
    // Instead, we just let Sleep and Wind Down blocks act as natural bounds.
    
    // 1. Build Base Bio Blocks
    const bioTemplates = [];
    const mealsPerDay = context.user.meals_per_day || 3;
    const mealWindows = context.user.meal_windows || {};
    
    const sleepStart = context.user.sleep_start || '23:00';
    const sleepEnd = context.user.sleep_end || '07:00';

    if (timeToMinutes(sleepStart) < timeToMinutes(sleepEnd)) {
        // Sleep happens entirely within the same calendar day (e.g., 01:00 to 08:00 or 00:00 to 08:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: sleepEnd });
        if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        }
    } else {
        // Sleep crosses midnight (e.g., 23:00 to 07:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: '00:00', end: sleepEnd });
        if (timeToMinutes(sleepStart) < 1439) { // 1439 is 23:59
            bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: '23:59' });
        }
        if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        } else {
            // Wind down crosses midnight
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
            if (timeToMinutes(sleepStart) > 0) {
                bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: '00:00', end: sleepStart });
            }
        }
    }

    if (mealsPerDay >= 1) {
        let start = (mealWindows as any)?.breakfast?.start || '08:00';
        // Ensure breakfast doesn't overlap with sleep
        const wakeTime = context.user.sleep_end || '07:00';
        if (timeToMinutes(start) < timeToMinutes(wakeTime)) {
            start = wakeTime;
        }
        bioTemplates.push({ title: 'Breakfast', block_type: 'meal', start, end: safeAddMins(start, 30) });
    }
    if (mealsPerDay >= 2) {
        let start = (mealWindows as any)?.lunch?.start || '12:30';
        bioTemplates.push({ title: 'Lunch', block_type: 'meal', start, end: safeAddMins(start, 45) });
    }
    if (mealsPerDay >= 3) {
        let start = (mealWindows as any)?.dinner?.start || '19:30';
        let end = safeAddMins(start, 45);
        // Ensure dinner ends before wind down starts to avoid clashing
        const wdMins = timeToMinutes(windDown);
        const endMins = timeToMinutes(end);
        if (wdMins > 720 && endMins > wdMins) {
            // Dinner overlaps with wind down, compress or shift back
            const startMins = timeToMinutes(start);
            if (wdMins - startMins >= 30) {
                end = minutesToTime(wdMins); // Compress to at least 30 mins
            } else {
                start = minutesToTime(wdMins - 45); // Shift back
                end = minutesToTime(wdMins);
            }
        }
        bioTemplates.push({ title: 'Dinner', block_type: 'meal', start, end });
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
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Standard Balanced', 'Evenly distributed tasks to maintain an ultradian rhythm.', 'Consistency builds momentum.', false, false, protocolConfig));
        if (allowWeekend) {
            variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Afternoon Flow', 'Balanced distribution but prioritizes scheduling tasks after lunch.', 'Optimizes for post-lunch energy.', false, false, protocolConfig, 'afternoon'));
        }
    } else if (mode === 'momentum') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Morning Rush', 'Back-to-back blocks tightly packed in the early day.', 'Tackle the hardest things first.', false, false, protocolConfig, 'morning'));
        variants.push(generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Sprint Days', 'Highly compressed Mon-Thu schedule with zero buffers.', 'Maximum output.', false, false, protocolConfig, 'weekday'));
    } else if (mode === 'recovery') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Spaced Out', 'Maximized gaps between sessions for mental resets.', 'Slow and steady.', false, false, protocolConfig));
        if (allowWeekend) {
            variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Weekend Focus', 'Shifts the heavier lifting to the weekend to keep workdays light.', 'Prioritizes workday rest.', false, false, protocolConfig, 'weekend'));
        } else {
            variants.push(generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Quiet Recovery', 'Light load with spaced out blocks.', 'Rest focused.', true, false, protocolConfig));
        }
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
    forceBonusFill: boolean = false,
    protocolConfig?: ProtocolConfig,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday'
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

    // Sort goals: Importance first, then total minutes
    const sortedGoals = [...ctx.goals].sort((a, b) => {
        const aTotal = (a.days_per_week || 5) * (a.minutes_per_day || 60);
        const bTotal = (b.days_per_week || 5) * (b.minutes_per_day || 60);
        const aImportance = a.importance || 5;
        const bImportance = b.importance || 5;
        if (bImportance !== aImportance) return bImportance - aImportance;
        return bTotal - aTotal;
    });

    for (const goal of sortedGoals) {
        // NEW: Progress-aware scheduling. How much is ACTUALLY left to do?
        const progress = ctx.goalProgress?.find(p => p.goal_id === goal.id);
        const remainingMins = progress ? progress.remaining_minutes : (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
        
        if (remainingMins <= 0) continue; // Goal already reached for the week!

        const targetMinsPerDay = goal.minutes_per_day || 60;
        let remainingWeeklyMins = remainingMins;

        // Determine preferred days based on strategy
        let preferredDays = [1, 2, 3, 4, 5, 6, 7];
        if (!allowWeekend) preferredDays = [1, 2, 3, 4, 5];

        if (timeFocus === 'weekend') {
            preferredDays.sort((a, b) => {
                const aIsWeekend = a >= 6 ? 1 : 0;
                const bIsWeekend = b >= 6 ? 1 : 0;
                if (aIsWeekend !== bIsWeekend) return bIsWeekend - aIsWeekend; // Weekend first
                return (workloadPerDay.get(a) || 0) - (workloadPerDay.get(b) || 0);
            });
        } else if (timeFocus === 'weekday' || strategyId === 'momentum') {
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

        for (const isoDay of preferredDays) {
            if (remainingWeeklyMins <= 0) break;

            const isWeekend = isoDay >= 6;
            // Cap daily placement to targetMinsPerDay to prevent cramming, unless we only have a bit left
            let remainingMinsForDay = Math.min(targetMinsPerDay, remainingWeeklyMins);

            // For light weekends, cap the scheduling window at 4PM
            const dayWindDown = (isWeekend && weekendIntensity === 'light') ? LIGHT_WEEKEND_CUTOFF : 1440;

            const dayExclusions = exclusions.get(isoDay)!;
            const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');

            // Check if there is already a block for this goal on this day
            const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
            if (blocksThisDayForGoal.length > 0) {
                if (blocksThisDayForGoal.length >= 2) continue; // Max 2 blocks per day for any goal
                
                if (goal.pillar === 'body') {
                    // Allow 2 body blocks per day if they are on opposite ends of the day
                    // The placement constraint is enforced in the window filtering step
                } else {
                    // Only allow double booking if total weekly target is high (>120 mins)
                    if ((goal.days_per_week || 5) * (goal.minutes_per_day || 60) <= 120) continue;
                }
            }

            // Find available windows
            dayExclusions.sort((a, b) => a.start - b.start);
            let windows: Array<{ start: number; end: number }> = [];
            let cursor = 0;

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

            // Body stacking constraint: if we already have a body block today, filter windows to opposite end
            if (goal.pillar === 'body' && blocksThisDayForGoal.length === 1) {
                const existingStartMins = timeToMinutes(blocksThisDayForGoal[0].start_time);
                if (existingStartMins < 720) { // Morning block exists -> only allow evening windows (>17:00 or 1020 mins)
                    windows = windows.filter(w => w.end > 1020).map(w => ({ start: Math.max(w.start, 1020), end: w.end }));
                } else { // Afternoon/Evening block exists -> only allow morning windows (<12:00 or 720 mins)
                    windows = windows.filter(w => w.start < 720).map(w => ({ start: w.start, end: Math.min(w.end, 720) }));
                }
                windows = windows.filter(w => w.end > w.start);
            }

            // NEW: TimeFocus sorting
            windows.sort((a, b) => {
                if (timeFocus === 'morning') return a.start - b.start;
                if (timeFocus === 'afternoon') {
                    // Try to be close to 13:00 (780 mins)
                    return Math.abs(a.start - 780) - Math.abs(b.start - 780);
                }
                if (timeFocus === 'evening') return b.start - a.start;
                
                // Default Pillar-intelligent window sorting
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
                if (remainingMinsForDay <= 0) break;
                if (win.end - win.start < 30) continue; // Enforce minimum block duration of 30 mins!

                const minsToPlace = Math.min(remainingMinsForDay, win.end - win.start);

                let start = win.start;
                
                // Pillar-specific placement within window
                if (goal.pillar === 'mind' && win.start < 720) {
                     // Mind goals in morning windows should be pushed to the start
                } else if (goal.pillar === 'body') {
                     // Body goals can be pushed slightly later in the window for digestion
                     if (win.end - win.start > minsToPlace + 30) start += 15;
                }
                
                let buffer = protocolConfig?.bufferMinutes ?? 10;
                if (!protocolConfig?.bufferMinutes) {
                    if (strategyId === 'momentum') buffer = 0; // Zero buffers, tightly packed
                    else if (strategyId === 'balanced') buffer = (ctx.user as any).default_buffer_duration || 15;
                    else if (strategyId === 'recovery') buffer = Math.max(30, ((ctx.user as any).default_buffer_duration || 15) * 2);
                }

                blocks.push({
                    date: dateStr,
                    start_time: minutesToTime(start),
                    end_time: minutesToTime(start + minsToPlace),
                    title: minsToPlace < targetMinsPerDay ? `${goal.title} (Part)` : goal.title,
                    block_type: 'goal',
                    goal_id: goal.id,
                    pillar: goal.pillar,
                    checklist: goal.ai_strategy?.checklist || [{text: "Focus session"}, {text: "Review progress"}]
                });

                // Add to exclusions for this day with strategy-specific buffer
                dayExclusions.push({
                    start: start,
                    end: start + minsToPlace + buffer,
                    title: goal.title,
                    type: 'goal'
                });

                // Update workload tracker
                workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + minsToPlace);

                remainingMinsForDay -= minsToPlace;
                remainingWeeklyMins -= minsToPlace;
            }
        }

        if (remainingWeeklyMins > 0) {
            unscheduled_minutes[goal.title] = remainingWeeklyMins;
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
