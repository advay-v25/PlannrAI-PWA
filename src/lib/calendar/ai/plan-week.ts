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
    protocolConfig?: ProtocolConfig,
    replanFromDate?: string
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
        if (sleepStart === '00:00') {
            // Sleep starts at midnight — wind down occupies the tail end of the active calendar day
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
        } else if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
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
        const start = (mealWindows as any)?.lunch?.start || '12:30';
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

    // Morning routine: invisible scheduling constraint — no calendar block, just blocks the time after wake
    const morningRoutineMins = (context.user as any).morning_routine_mins || 0;
    if (morningRoutineMins > 0) {
        const wakeTimeMins = timeToMinutes(context.user.sleep_end || '07:00');
        const morningRoutineEnd = wakeTimeMins + morningRoutineMins;
        for (let d = 1; d <= 7; d++) {
            commitmentsByDay.get(d)!.push({
                start: wakeTimeMins,
                end: morningRoutineEnd,
                title: 'Morning Routine',
                type: 'morning_routine'
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
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Standard Balanced', 'Evenly distributed tasks to maintain an ultradian rhythm.', 'Consistency builds momentum.', false, false, protocolConfig, undefined, replanFromDate));
        if (allowWeekend) {
            variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Afternoon Flow', 'Balanced distribution but prioritizes scheduling tasks after lunch.', 'Optimizes for post-lunch energy.', false, false, protocolConfig, 'afternoon', replanFromDate));
        }
    } else if (mode === 'momentum') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Morning Rush', 'Back-to-back blocks tightly packed in the early day.', 'Tackle the hardest things first.', false, false, protocolConfig, 'morning', replanFromDate));
        variants.push(generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Sprint Days', 'Highly compressed Mon-Thu schedule with zero buffers.', 'Maximum output.', false, false, protocolConfig, 'weekday', replanFromDate));
    } else if (mode === 'recovery') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Spaced Out', 'Maximized gaps between sessions for mental resets.', 'Slow and steady.', false, false, protocolConfig, undefined, replanFromDate));
        if (allowWeekend) {
            variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Weekend Focus', 'Shifts the heavier lifting to the weekend to keep workdays light.', 'Prioritizes workday rest.', false, false, protocolConfig, 'weekend', replanFromDate));
        } else {
            variants.push(generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Quiet Recovery', 'Light load with spaced out blocks.', 'Rest focused.', true, false, protocolConfig, undefined, replanFromDate));
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
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday',
    replanFromDate?: string
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

    for (const [d, ex] of baseExclusions.entries()) {
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
        
        let remainingWeeklyMins = remainingMins;
        if (replanFromDate) {
            const targetMins = (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
            const minsBeforeReplan = ctx.schedule.this_week
                .filter(b => b.goal_id === goal.id && b.date < replanFromDate && b.status !== 'cancelled' && b.status !== 'missed')
                .reduce((sum, b) => {
                    const duration = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
                    return sum + Math.max(0, duration);
                }, 0);
            remainingWeeklyMins = Math.max(0, targetMins - minsBeforeReplan);
        }
        
        if (remainingWeeklyMins <= 0) continue; // Goal already reached for the week!

        const targetMinsPerDay = goal.minutes_per_day || 60;

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
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                // If it's a secondary variant (e.g. evening focus), reverse the day sweep to force layout diversity
                const direction = timeFocus === 'evening' ? -1 : 1;
                const weightA = a * 1000 * direction + loadA;
                const weightB = b * 1000 * direction + loadB;
                return weightA - weightB;
            });
        } else if (strategyId === 'recovery') {
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                // Secondary variants sweep from end of week to force visual difference
                return timeFocus ? a - b : b - a; 
            });
        } else if (strategyId === 'balanced') {
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                // Reverse the tie-breaker for the secondary "afternoon" option to guarantee a different plan
                return timeFocus === 'afternoon' ? b - a : a - b;
            });
        }

        for (const isoDay of preferredDays) {
            if (remainingWeeklyMins <= 0) break;

            const isWeekend = isoDay >= 6;
            let remainingMinsForDay = Math.min(targetMinsPerDay, remainingWeeklyMins);

            // Prevent leaving tiny fragments on the last day. E.g. if 60 mins left and target is 45, split 30/30 instead of 45/15.
            if (remainingWeeklyMins - remainingMinsForDay > 0 && remainingWeeklyMins - remainingMinsForDay < 30) {
                remainingMinsForDay = Math.ceil((remainingWeeklyMins / 2) / 15) * 15;
            }

            const dayWindDown = (isWeekend && weekendIntensity === 'light')
                ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
                : windDownMins;
            const dayExclusions = exclusions.get(isoDay)!;
            const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');

            if (replanFromDate && dateStr < replanFromDate) {
                continue;
            }

            const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
            if (blocksThisDayForGoal.length > 0) {
                // Body blocks cannot be split — skip this day if ANY block already placed for this goal
                if (goal.pillar === 'body') continue;
                if (blocksThisDayForGoal.length >= 2) continue; // Max 2 blocks per day for mind/craft goals
                if ((goal.days_per_week || 5) * (goal.minutes_per_day || 60) <= 120) continue;
            }

            // Find all other body blocks already scheduled today to prevent back-to-back workouts
            const otherBodyBlocks = blocks.filter(b => b.date === dateStr && b.pillar === 'body' && b.goal_id !== goal.id);

            dayExclusions.sort((a, b) => a.start - b.start);
            let windows: Array<{ start: number; end: number }> = [];
            let cursor = 0;

            for (const ex of dayExclusions) {
                let exEnd = ex.end;
                if (goal.pillar === 'body' && ex.type === 'meal') {
                    exEnd += 15;
                }

                if (cursor < ex.start) {
                    windows.push({ start: cursor, end: ex.start });
                }
                cursor = Math.max(cursor, exEnd);
            }
            if (cursor < dayWindDown) {
                windows.push({ start: cursor, end: dayWindDown });
            }

            // Body stacking constraint 1: Avoid opposite ends for the SAME body goal
            if (goal.pillar === 'body' && blocksThisDayForGoal.length === 1) {
                const existingStartMins = timeToMinutes(blocksThisDayForGoal[0].start_time);
                if (existingStartMins < 720) {
                    windows = windows.filter(w => w.end > 1020).map(w => ({ start: Math.max(w.start, 1020), end: w.end }));
                } else {
                    windows = windows.filter(w => w.start < 720).map(w => ({ start: w.start, end: Math.min(w.end, 720) }));
                }
            }

            // Body stacking constraint 2: Prevent DIFFERENT body goals from being back-to-back
            if (goal.pillar === 'body' && otherBodyBlocks.length > 0) {
                const updatedWindows: typeof windows = [];
                for (const w of windows) {
                    let validStart = w.start;
                    let validEnd = w.end;
                    let isCut = false;
                    
                    for (const ob of otherBodyBlocks) {
                        const obStart = timeToMinutes(ob.start_time);
                        const obEnd = timeToMinutes(ob.end_time);
                        // Require 120 min gap between different body goals
                        const blockZoneStart = obStart - 120;
                        const blockZoneEnd = obEnd + 120;

                        if (validStart >= blockZoneStart && validEnd <= blockZoneEnd) {
                            isCut = true; // completely inside the exclusion zone
                            break;
                        } else if (validStart < blockZoneStart && validEnd > blockZoneEnd) {
                            // split window
                            updatedWindows.push({ start: validStart, end: blockZoneStart });
                            validStart = blockZoneEnd;
                        } else if (validStart >= blockZoneStart && validStart < blockZoneEnd) {
                            validStart = blockZoneEnd;
                        } else if (validEnd > blockZoneStart && validEnd <= blockZoneEnd) {
                            validEnd = blockZoneStart;
                        }
                    }
                    if (!isCut && validEnd > validStart) {
                        updatedWindows.push({ start: validStart, end: validEnd });
                    }
                }
                windows = updatedWindows;
            }
            
            windows = windows.filter(w => w.end > w.start);

            windows.sort((a, b) => {
                if (timeFocus === 'morning') return a.start - b.start;
                if (timeFocus === 'afternoon') return Math.abs(a.start - 780) - Math.abs(b.start - 780);
                if (timeFocus === 'evening') return b.start - a.start;

                if (goal.pillar === 'mind') return a.start - b.start;
                if (goal.pillar === 'body') {
                    if ((goal.importance || 5) >= 8) return a.start - b.start; // Eat the frog
                    const aIsAfternoon = a.start >= 720;
                    const bIsAfternoon = b.start >= 720;
                    if (aIsAfternoon && !bIsAfternoon) return -1;
                    if (!aIsAfternoon && bIsAfternoon) return 1;
                    return a.start - b.start;
                }
                return a.start - b.start;
            });

            // ── BODY PILLAR: No splitting allowed ──────────────────────────────────
            // Body blocks (gym, running, sports, etc.) must be one contiguous session.
            // Find the first window (in preference order) that fits the full daily target.
            // If no such window exists, skip this day and try the next.
            if (goal.pillar === 'body') {
                const fitWindows = windows.filter(w => (w.end - w.start) >= remainingMinsForDay);
                if (fitWindows.length > 0) {
                    const win = fitWindows[0]; // already sorted by pillar/time preference above
                    let start = win.start;
                    // Small inset if the window is significantly larger than the block
                    if ((win.end - win.start) > remainingMinsForDay + 30) {
                        start += 15;
                    }
                    let buffer = protocolConfig?.bufferMinutes ?? 10;
                    if (!protocolConfig?.bufferMinutes) {
                        if (strategyId === 'momentum') buffer = 0;
                        else if (strategyId === 'balanced') buffer = (ctx.user as any).default_buffer_duration || 15;
                        else if (strategyId === 'recovery') buffer = Math.max(30, ((ctx.user as any).default_buffer_duration || 15) * 2);
                    }
                    if ((win.end - start) < remainingMinsForDay + buffer) {
                        buffer = Math.max(0, (win.end - start) - remainingMinsForDay);
                    }
                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + remainingMinsForDay),
                        title: goal.title, // never append "(Part)" for body goals
                        block_type: 'goal',
                        goal_id: goal.id,
                        pillar: goal.pillar,
                        checklist: goal.ai_strategy?.checklist || [{ text: 'Warm up' }, { text: 'Main session' }, { text: 'Cool down' }]
                    });
                    dayExclusions.push({
                        start,
                        end: start + remainingMinsForDay + buffer,
                        title: goal.title,
                        type: 'goal'
                    });
                    workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + remainingMinsForDay);
                    remainingWeeklyMins -= remainingMinsForDay;
                }
                // Whether placed or not, skip the splitting window loop for body goals
                continue;
            }
            // ── END BODY PILLAR ────────────────────────────────────────────────────

            for (const win of windows) {
                if (remainingMinsForDay <= 0) break;
                
                let winStart = win.start;
                let winEnd = win.end;
                let availableInWin = winEnd - winStart;
                
                while (remainingMinsForDay > 0 && availableInWin >= 30) {
                    const MAX_BLOCK = 120;
                    const MIN_BLOCK = 30;
                    let minsToPlace = Math.min(remainingMinsForDay, availableInWin);

                    if (remainingMinsForDay > Math.min(availableInWin, MAX_BLOCK)) {
                        const maxAllowedChunk = Math.min(availableInWin, MAX_BLOCK);
                        if (maxAllowedChunk < MIN_BLOCK) break; 
                        
                        let numSplits = Math.ceil(remainingMinsForDay / maxAllowedChunk);
                        let bestSplitSize = Math.floor(remainingMinsForDay / numSplits);
                        
                        while (numSplits > 1 && bestSplitSize < MIN_BLOCK) {
                            numSplits--;
                            bestSplitSize = Math.floor(remainingMinsForDay / numSplits);
                        }
                        
                        if (bestSplitSize <= availableInWin && bestSplitSize <= MAX_BLOCK) {
                            minsToPlace = bestSplitSize;
                        } else {
                            minsToPlace = Math.min(MAX_BLOCK, availableInWin);
                            if (remainingMinsForDay - minsToPlace > 0 && remainingMinsForDay - minsToPlace < MIN_BLOCK) {
                                minsToPlace = remainingMinsForDay - MIN_BLOCK;
                                if (minsToPlace < MIN_BLOCK) break; 
                            }
                        }
                    }

                    let start = winStart;

                    let buffer = protocolConfig?.bufferMinutes ?? 10;
                    if (!protocolConfig?.bufferMinutes) {
                        if (strategyId === 'momentum') buffer = 0;
                        else if (strategyId === 'balanced') buffer = (ctx.user as any).default_buffer_duration || 15;
                        else if (strategyId === 'recovery') buffer = Math.max(30, ((ctx.user as any).default_buffer_duration || 15) * 2);
                    }

                    if (availableInWin < minsToPlace + buffer) {
                        buffer = availableInWin - minsToPlace;
                    }

                    // Hard minimum: never place a mind/craft chunk shorter than 30 minutes
                    if (minsToPlace < 30) break;

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

                    dayExclusions.push({
                        start: start,
                        end: start + minsToPlace + buffer,
                        title: goal.title,
                        type: 'goal'
                    });

                    workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + minsToPlace);

                    remainingMinsForDay -= minsToPlace;
                    remainingWeeklyMins -= minsToPlace;
                    
                    // Consume time from this window
                    const consumed = minsToPlace + buffer;
                    winStart += consumed;
                    availableInWin -= consumed;
                }
            }
        }

        // Pass 2: Cram Pass (If goals are still not met, bypass preferred days and check ALL days)
        // We still respect the daily maximum limit of targetMinsPerDay.
        if (remainingWeeklyMins > 0) {
            const allDays = [1, 2, 3, 4, 5, 6, 7];
            for (const isoDay of allDays) {
                if (remainingWeeklyMins <= 0) break;
                
                const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
                if (replanFromDate && dateStr < replanFromDate) continue;

                // How many minutes have we already scheduled for this goal today?
                const blocksToday = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
                const scheduledToday = blocksToday.reduce((sum, b) => sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
                
                const remainingMinsForDay = Math.max(0, targetMinsPerDay - scheduledToday);
                if (remainingMinsForDay <= 0) continue; // Reached daily cap

                let remainingToPlace = Math.min(remainingMinsForDay, remainingWeeklyMins);
                if (remainingWeeklyMins - remainingToPlace > 0 && remainingWeeklyMins - remainingToPlace < 30) {
                    remainingToPlace = Math.ceil((remainingWeeklyMins / 2) / 15) * 15;
                }

                // Body goals: skip this day in the cram pass if a block was already placed today
                if (goal.pillar === 'body' && blocksToday.length > 0) continue;

                const dayExclusions = exclusions.get(isoDay)!;
                dayExclusions.sort((a, b) => a.start - b.start);
                let windows: Array<{ start: number; end: number }> = [];
                let cursor = 0;
                for (const ex of dayExclusions) {
                    if (cursor < ex.start) windows.push({ start: cursor, end: ex.start });
                    cursor = Math.max(cursor, ex.end);
                }
                if (cursor < 1440) windows.push({ start: cursor, end: 1440 });

                windows = windows.filter(w => w.end > w.start);

                // Body pillar in cram pass: same no-split rule — find full-fit window or skip
                if (goal.pillar === 'body') {
                    const fitWindows = windows.filter(w => (w.end - w.start) >= remainingToPlace);
                    if (fitWindows.length > 0) {
                        const win = fitWindows[0];
                        const start = win.start;
                        blocks.push({
                            date: dateStr,
                            start_time: minutesToTime(start),
                            end_time: minutesToTime(start + remainingToPlace),
                            title: goal.title,
                            block_type: 'goal',
                            goal_id: goal.id,
                            pillar: goal.pillar,
                            checklist: goal.ai_strategy?.checklist || [{ text: 'Warm up' }, { text: 'Main session' }, { text: 'Cool down' }]
                        });
                        dayExclusions.push({ start, end: start + remainingToPlace, title: goal.title, type: 'goal' });
                        workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + remainingToPlace);
                        remainingWeeklyMins -= remainingToPlace;
                    }
                    continue; // Skip the splitting window loop for body goals
                }

                for (const win of windows) {
                    if (remainingToPlace <= 0) break;
                    
                    let winStart = win.start;
                    let winEnd = win.end;
                    let availableInWin = winEnd - winStart;
                    
                    while (remainingToPlace > 0 && availableInWin >= 30) {
                        const MAX_BLOCK = 120;
                        const MIN_BLOCK = 30;
                        let minsToPlace = Math.min(remainingToPlace, availableInWin);

                        if (remainingToPlace > Math.min(availableInWin, MAX_BLOCK)) {
                            const maxAllowedChunk = Math.min(availableInWin, MAX_BLOCK);
                            if (maxAllowedChunk < MIN_BLOCK) break; 
                            
                            let numSplits = Math.ceil(remainingToPlace / maxAllowedChunk);
                            let bestSplitSize = Math.floor(remainingToPlace / numSplits);
                            
                            while (numSplits > 1 && bestSplitSize < MIN_BLOCK) {
                                numSplits--;
                                bestSplitSize = Math.floor(remainingToPlace / numSplits);
                            }
                            
                            if (bestSplitSize <= availableInWin && bestSplitSize <= MAX_BLOCK) {
                                minsToPlace = bestSplitSize;
                            } else {
                                minsToPlace = Math.min(MAX_BLOCK, availableInWin);
                                if (remainingToPlace - minsToPlace > 0 && remainingToPlace - minsToPlace < MIN_BLOCK) {
                                    minsToPlace = remainingToPlace - MIN_BLOCK;
                                    if (minsToPlace < MIN_BLOCK) break; 
                                }
                            }
                        }

                        let start = winStart;
                        
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

                        dayExclusions.push({
                            start: start,
                            end: start + minsToPlace,
                            title: goal.title,
                            type: 'goal'
                        });

                        workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + minsToPlace);

                        remainingToPlace -= minsToPlace;
                        remainingWeeklyMins -= minsToPlace;
                        
                        const consumed = minsToPlace;
                        winStart += consumed;
                        availableInWin -= consumed;
                    }
                }
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

    const finalBlocks = blocks;

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
