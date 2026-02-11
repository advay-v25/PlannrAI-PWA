
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { addDays, startOfDay, endOfDay, addMinutes, format, parseISO, isSameDay } from 'date-fns';
import { Profile, Goal, Commitment, ScheduleBlock } from '@/types/database';
import { v4 as uuidv4 } from 'uuid';
import { AnchorService } from './anchor-service';
import { MealPlanner } from './meal-planner';
import { ScoringEngine } from './scoring-engine';

export interface SchedulerContext {
    userId: string;
    weekStart: Date;
    profile: Profile;
    goals: Goal[];
    commitments: Commitment[];
    existingBlocks: ScheduleBlock[];
}

export interface TimeSlot {
    start: Date;
    end: Date;
    isBlocked: boolean;
    blockReason?: 'sleep' | 'anchor' | 'meal' | 'buffer' | 'existing';
}

export class PlanWeekService {

    static async generateWeek(userId: string, startDate: Date, supabase: SupabaseClient) {
        // 1. Fetch Data
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active');
        const { data: existingBlocks } = await supabase.from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', format(startDate, 'yyyy-MM-dd'))
            .lte('date', format(addDays(startDate, 6), 'yyyy-MM-dd'));

        // Fetch Commitments (Anchors)
        const { data: commitments } = await supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true);

        if (!profile || !goals) throw new Error("Missing profile or goals");

        const ctx: SchedulerContext = {
            userId,
            weekStart: startOfDay(startDate),
            profile,
            goals: goals || [],
            commitments: commitments || [],
            existingBlocks: existingBlocks || []
        };

        return this.generateScheduleFromContext(ctx, startDate);
    }

    static async generateScheduleFromContext(ctx: SchedulerContext, startDate: Date) {
        // 2. Initialize Grid
        const grid = this.initializeGrid(ctx.weekStart, 7);

        // 3. Apply Hard Constraints & Anchors (Phase 7 Upgrade)
        // A. Sleep & Existing
        this.applyBasicConstraints(grid, ctx);

        // B. Expand Recurring Anchors
        const expandedAnchors = await AnchorService.expandAnchors(ctx.userId, startDate, 7, ctx.commitments);
        this.applyExternalBlocksToGrid(grid, expandedAnchors);

        // C. Place Meals
        let mealBlocks: Partial<ScheduleBlock>[] = [];
        for (let i = 0; i < 7; i++) {
            const day = addDays(ctx.weekStart, i);
            // We need current day's existing + anchors to avoid overlaps
            // Combine true existing + expanded anchors
            const dayBlocks = [
                ...ctx.existingBlocks.filter(b => b.date === format(day, 'yyyy-MM-dd')),
                ...expandedAnchors.filter(b => b.date === format(day, 'yyyy-MM-dd')) as ScheduleBlock[]
            ];

            const dailyMeals = MealPlanner.placeMealsForDay(ctx.userId, day, dayBlocks, ctx.profile);
            mealBlocks.push(...dailyMeals);
        }
        this.applyExternalBlocksToGrid(grid, mealBlocks);


        // 4. Place Goals (Scoring Engine)
        const goalBlocks = this.placeGoals(grid, ctx, [...expandedAnchors, ...mealBlocks]);

        // 5. Generate Patch
        // Collect ALL new blocks: Anchors (expanded), Meals, and Goals
        const allNewBlocks = [...expandedAnchors, ...mealBlocks, ...goalBlocks];

        return {
            patch: {
                undoable: true,
                changes: allNewBlocks.map(b => ({
                    op: 'create_event',
                    payload: b
                }))
            },
            summary: {
                total_blocks: allNewBlocks.length,
                anchors: expandedAnchors.length,
                meals: mealBlocks.length,
                goals: goalBlocks.length
            }
        };
    }

    private static initializeGrid(startDate: Date, days: number): TimeSlot[] {
        const slots: TimeSlot[] = [];
        const gridStart = startOfDay(startDate);
        const totalSlots = days * 24 * 12; // 5-min slots

        for (let i = 0; i < totalSlots; i++) {
            slots.push({
                start: addMinutes(gridStart, i * 5),
                end: addMinutes(gridStart, (i * 5) + 5),
                isBlocked: false
            });
        }
        return slots;
    }

    private static applyBasicConstraints(grid: TimeSlot[], ctx: SchedulerContext) {
        // A. Sleep Window
        const sleepStartStr = ctx.profile.sleep_start || '23:00';
        const sleepEndStr = ctx.profile.sleep_end || '07:00';

        const toMins = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const sleepStartMins = toMins(sleepStartStr);
        const sleepEndMins = toMins(sleepEndStr);
        const crossesMidnight = sleepStartMins > sleepEndMins;

        // B. Existing Database Blocks (Locked/Fixed)
        // We do NOT overwrite existing DB blocks.
        const relevantExisting = ctx.existingBlocks.filter(b => b.start_time && b.end_time);

        grid.forEach(slot => {
            const mins = slot.start.getHours() * 60 + slot.start.getMinutes();

            // Sleep
            let isSleep = false;
            if (crossesMidnight) {
                if (mins >= sleepStartMins || mins < sleepEndMins) isSleep = true;
            } else {
                if (mins >= sleepStartMins && mins < sleepEndMins) isSleep = true;
            }
            if (isSleep) {
                slot.isBlocked = true;
                slot.blockReason = 'sleep';
                return;
            }

            // Existing
            // Optimization: Checking every block every slot is slow (O(Slots * Blocks)).
            // Better: Pre-map blocks to grid indices. 
            // MVP: Iterate check is fine for < 100 blocks.
            const overlap = relevantExisting.some(b => {
                const bStart = parseISO(`${b.date}T${b.start_time}`);
                const bEnd = parseISO(`${b.date}T${b.end_time}`);
                return slot.start < bEnd && slot.end > bStart;
            });

            if (overlap) {
                slot.isBlocked = true;
                slot.blockReason = 'existing';
            }
        });
    }

    private static applyExternalBlocksToGrid(grid: TimeSlot[], blocks: Partial<ScheduleBlock>[]) {
        if (blocks.length === 0) return;

        // This helper assumes blocks have date, start_time, end_time
        blocks.forEach(b => {
            if (!b.date || !b.start_time || !b.end_time) return;
            const start = parseISO(`${b.date}T${b.start_time}`);
            const end = parseISO(`${b.date}T${b.end_time}`);

            // Find slots efficiently?
            // Brute force grid is safe for MVP correctness.
            grid.forEach(slot => {
                if (slot.start < end && slot.end > start) {
                    slot.isBlocked = true;
                    slot.blockReason = (b.source as any) || 'anchor';
                }
            });
        });
    }

    private static placeGoals(grid: TimeSlot[], ctx: SchedulerContext, currentPlacedBlocks: Partial<ScheduleBlock>[]): Partial<ScheduleBlock>[] {
        const newlyPlaced: Partial<ScheduleBlock>[] = [];
        const placedSoFar = [...currentPlacedBlocks];

        // Sort Priority High -> Low
        const sortedGoals = [...ctx.goals].sort((a, b) => {
            const pMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
            return (pMap[b.priority || b.importance || 'medium'] || 1) - (pMap[a.priority || a.importance || 'medium'] || 1);
        });

        const days = 7;
        for (let d = 0; d < days; d++) {
            const currentDate = addDays(ctx.weekStart, d);
            const dayOfWeek = currentDate.getDay(); // 0-6

            // Weekend & Intensity Check
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const intensity = ctx.profile.weekend_intensity || 'normal';
            if (isWeekend && intensity === 'off') continue;

            // Preferred Workdays Check
            if (ctx.profile.preferred_workdays && !ctx.profile.preferred_workdays.includes(dayOfWeek)) continue;


            const dayContext = {
                blocks: placedSoFar.filter(b => b.date === format(currentDate, 'yyyy-MM-dd')),
                startOfDay: startOfDay(currentDate),
                endOfDay: endOfDay(currentDate)
            };

            for (const goal of sortedGoals) {
                // Determine session duration (cap at 90m or goal daily mins)
                const dailyTarget = goal.minutes_per_day || 60;
                // Weekend Light Mode: 60% duration
                const durationFactor = (isWeekend && intensity === 'light') ? 0.6 : 1.0;
                const sessionDuration = Math.max(15, Math.ceil((dailyTarget * durationFactor) / 5) * 5); // quantize to 5m

                // Only place if we haven't met goal for this day? 
                // MVP: Try to place 1 session per goal per valid day.

                const bestSlot = this.findBestSlotForDay(grid, currentDate, sessionDuration, goal, ctx, dayContext);

                if (bestSlot) {
                    // Block Grid
                    this.markRangeBlocked(grid, bestSlot.startIndex, bestSlot.endIndex);

                    const newBlock: Partial<ScheduleBlock> = {
                        id: uuidv4(),
                        user_id: ctx.userId,
                        goal_id: goal.id,
                        title: goal.title,
                        date: format(currentDate, 'yyyy-MM-dd'),
                        start_time: format(bestSlot.start, 'HH:mm:ss'),
                        end_time: format(bestSlot.end, 'HH:mm:ss'),
                        block_type: goal.category || 'task',
                        pillar: goal.pillar,
                        is_fixed: false,
                        status: 'planned',
                        source: 'planner',
                        meta: { score: bestSlot.score, penalties: bestSlot.penalties }
                    };

                    newlyPlaced.push(newBlock);
                    placedSoFar.push(newBlock);
                    dayContext.blocks.push(newBlock); // Update context for next goal
                }
            }
        }

        return newlyPlaced;
    }

    private static findBestSlotForDay(
        grid: TimeSlot[],
        date: Date,
        durationMins: number,
        goal: Goal,
        ctx: SchedulerContext,
        dayContext: any
    ) {
        const slotsNeeded = Math.ceil(durationMins / 5);
        const dayIndex = Math.floor((date.getTime() - ctx.weekStart.getTime()) / (1000 * 60 * 60 * 24));
        if (dayIndex < 0 || dayIndex >= 7) return null;

        const startIdx = dayIndex * 288;
        const endIdx = (dayIndex + 1) * 288;

        let bestSlot = null;
        let bestScore = -Infinity;
        let bestPenalties: string[] = [];

        // Simple Scan
        for (let i = startIdx; i <= endIdx - slotsNeeded; i++) {
            let valid = true;
            for (let j = 0; j < slotsNeeded; j++) {
                if (grid[i + j].isBlocked) {
                    valid = false;
                    break;
                }
            }

            if (valid) {
                const slotStart = grid[i].start;
                const slotEnd = grid[i + slotsNeeded - 1].end;

                const result = ScoringEngine.scoreSlot(slotStart, slotEnd, goal, ctx.profile, dayContext);

                if (result.score > bestScore) {
                    bestScore = result.score;
                    bestPenalties = result.penalties;
                    bestSlot = {
                        startIndex: i,
                        endIndex: i + slotsNeeded - 1,
                        start: slotStart,
                        end: slotEnd,
                        score: result.score,
                        penalties: result.penalties
                    };
                }
            }
        }

        // Threshold: Don't place if score is terrible?
        // if (bestScore < 0) return null; 

        return bestSlot;
    }

    private static markRangeBlocked(grid: TimeSlot[], startIndex: number, endIndex: number) {
        for (let i = startIndex; i <= endIndex; i++) {
            grid[i].isBlocked = true;
        }
    }
}
