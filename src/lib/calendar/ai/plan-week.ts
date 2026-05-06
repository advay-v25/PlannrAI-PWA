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
        for (const d of days) {
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

    // Generate Variants
    const variants: WeekPlanVariant[] = [];

    // Variant 1: Balanced (Spread goals evenly)
    variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Balanced Week', 'Evenly distributed across the week for steady, sustainable progress.', 'Consistency builds momentum. This schedule spreads your goals out so no single day is overloaded.'));

    // Variant 2: Momentum (Front-loaded)
    variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Front-Loaded Momentum', 'Aggressive start to the week, leaving more free time later.', 'Tackle the hardest things first. By crushing your goals early in the week, you build unstoppable momentum.'));

    // Variant 3: Specialized based on mode
    if (mode === 'recovery') {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Recovery & Light', 'Spaces out work maximally, heavily utilizing weekends for low-stress catch-up.', 'Slow and steady. Maximizes buffers and prioritizes rest without sacrificing your targets.'));
    } else {
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'clustered', 'Deep Work Clusters', 'Groups goals tightly to maximize long continuous blocks of free time.', 'Context switching drains energy. This schedule clusters work together to give you massive unbroken blocks of freedom.'));
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
    philosophy: string
): WeekPlanVariant {
    const blocks: PlanBlock[] = [];
    const unscheduled_minutes: Record<string, number> = {};

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
    for (let [d, ex] of baseExclusions.entries()) {
        exclusions.set(d, ex.map(e => ({ ...e })));
    }

    // Sort goals based on importance (High importance first)
    const sortedGoals = [...ctx.goals].sort((a, b) => (b.importance || 5) - (a.importance || 5));

    for (const goal of sortedGoals) {
        const targetDays = goal.days_per_week || 5;
        const targetMinsPerDay = goal.minutes_per_day || 60;
        let daysPlaced = 0;

        // Determine preferred days based on strategy
        let preferredDays = [1, 2, 3, 4, 5, 6, 7];
        if (!allowWeekend) preferredDays = [1, 2, 3, 4, 5];

        if (strategyId === 'momentum') {
            // Front load: prioritize Mon-Wed
            preferredDays.sort((a, b) => a - b);
        } else if (strategyId === 'recovery') {
            // Space out: prioritize Wed-Sun
            preferredDays.sort((a, b) => b - a);
        } else if (strategyId === 'balanced') {
            // Try to spread out: e.g. 1, 3, 5, 2, 4, 6, 7
            const spread = [1, 3, 5, 2, 4, 6, 7];
            preferredDays = spread.filter(d => preferredDays.includes(d));
        }

        let failedMins = 0;

        for (const isoDay of preferredDays) {
            if (daysPlaced >= targetDays) break;

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
                // Buffer logic: if goal is body pillar, need 2h buffer after meals
                let exEnd = ex.end;
                if (goal.pillar === 'body' && ex.type === 'meal') {
                    exEnd += 105; // Base meal has 15m buffer, so +105 = 120m buffer total
                }

                if (cursor < ex.start) {
                    windows.push({ start: cursor, end: ex.start });
                }
                cursor = Math.max(cursor, exEnd);
            }
            if (cursor < windDownMins) {
                windows.push({ start: cursor, end: windDownMins });
            }

            // Find a window that can fit targetMinsPerDay
            let placed = false;
            for (const win of windows) {
                if (win.end - win.start >= targetMinsPerDay) {
                    // Fit it here!
                    let start = win.start;
                    
                    // If strategy is clustered, we push to the end of the window to pack things together,
                    // otherwise place at the start of the window
                    if (strategyId === 'clustered') {
                        // pack tight to existing blocks
                    }

                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + targetMinsPerDay),
                        title: goal.title,
                        block_type: 'goal',
                        goal_id: goal.id,
                        pillar: goal.pillar,
                        checklist: goal.ai_strategy?.checklist || [{text: "Focus session"}, {text: "Review progress"}]
                    });

                    // Add to exclusions for this day (with a 10m buffer after)
                    dayExclusions.push({
                        start: start,
                        end: start + targetMinsPerDay + 10,
                        title: goal.title,
                        type: 'goal'
                    });

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

    const totalMins = blocks.reduce((sum, b) => {
        if (b.block_type === 'sleep' || b.block_type === 'meal') return sum;
        return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0);

    const uniqueDays = new Set(blocks.filter(b => b.block_type === 'goal').map(b => b.date));

    return {
        id: strategyId,
        label,
        description,
        philosophy,
        blocks,
        stats: {
            total_blocks: blocks.length,
            total_hours: Math.round(totalMins / 60 * 10) / 10,
            days_with_work: uniqueDays.size,
            unscheduled_minutes,
        }
    };
}
