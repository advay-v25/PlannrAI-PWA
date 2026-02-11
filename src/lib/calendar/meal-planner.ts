import { ScheduleBlock, Profile } from '@/types/database';
import { addMinutes, format, parse, startOfDay, isSameDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { TimeSlot } from './plan-week-service';

interface MealConfig {
    windows: {
        breakfast: { start: string; end: string };
        lunch: { start: string; end: string };
        dinner: { start: string; end: string };
    };
    duration: number; // minutes
    buffer: number; // minutes
    mealsPerDay: number;
}

export class MealPlanner {

    /**
     * Determines where to place meals for a single day based on constraints.
     * Returns a list of ScheduleBlocks (Partial).
     * 
     * Strategy:
     * 1. Parse windows into minutes.
     * 2. Check for free slots in the preferred window.
     * 3. Avoid overlaps with fixed blocks (Anchors).
     * 4. Add buffers.
     */
    static placeMealsForDay(
        userId: string,
        date: Date,
        existingBlocks: ScheduleBlock[], // Anchors/Commitments
        profile: Profile
    ): Partial<ScheduleBlock>[] {
        const meals: Partial<ScheduleBlock>[] = [];
        const config = this.getMealConfig(profile);

        // Convert existing blocks to busy ranges [startMins, endMins]
        const busyRanges = existingBlocks.map(b => {
            const start = this.timeToMins(b.start_time);
            const end = this.timeToMins(b.end_time);
            return { start, end };
        });

        // 1. Breakfast (Optional based on mealsPerDay)
        if (config.mealsPerDay >= 3) {
            const slot = this.findSlotInWindow(config.windows.breakfast, config.duration, busyRanges);
            if (slot) {
                meals.push(this.createMealBlock(userId, date, 'Breakfast', slot.start, slot.end));
                busyRanges.push(slot); // Update busy for next meal
            }
        }

        // 2. Lunch (Always)
        const lunchSlot = this.findSlotInWindow(config.windows.lunch, config.duration, busyRanges);
        if (lunchSlot) {
            meals.push(this.createMealBlock(userId, date, 'Lunch', lunchSlot.start, lunchSlot.end));
            busyRanges.push(lunchSlot);
        }

        // 3. Dinner (Always)
        const dinnerSlot = this.findSlotInWindow(config.windows.dinner, config.duration, busyRanges);
        if (dinnerSlot) {
            meals.push(this.createMealBlock(userId, date, 'Dinner', dinnerSlot.start, dinnerSlot.end));
            busyRanges.push(dinnerSlot);
        }

        return meals;
    }

    private static getMealConfig(profile: Profile): MealConfig {
        const defaultWindows = {
            breakfast: { start: "07:00", end: "10:00" },
            lunch: { start: "12:00", end: "15:00" },
            dinner: { start: "18:30", end: "21:30" }
        };

        return {
            windows: (profile.meal_windows as any) || defaultWindows,
            duration: profile.meal_duration_minutes || 30,
            buffer: profile.buffer_minutes || 10,
            mealsPerDay: profile.meals_per_day || 3
        };
    }

    private static findSlotInWindow(
        window: { start: string, end: string },
        duration: number,
        busyRanges: { start: number, end: number }[]
    ): { start: number, end: number } | null {
        const winStart = this.timeToMins(window.start);
        const winEnd = this.timeToMins(window.end);

        // Greedy approach: try to place at start of window, shift by 15 mins if blocked
        for (let time = winStart; time + duration <= winEnd; time += 15) {
            const potentialEnd = time + duration;
            const overlap = busyRanges.some(range =>
                (time < range.end && potentialEnd > range.start) // Standard intersection
            );

            if (!overlap) {
                return { start: time, end: potentialEnd };
            }
        }

        return null; // Could not place meal in window
    }

    private static createMealBlock(userId: string, date: Date, title: string, startMins: number, endMins: number): Partial<ScheduleBlock> {
        return {
            id: uuidv4(),
            user_id: userId,
            title: title,
            date: format(date, 'yyyy-MM-dd'),
            start_time: this.minsToTime(startMins),
            end_time: this.minsToTime(endMins),
            block_type: 'personal',
            source: 'meal',
            is_fixed: true,
            is_locked: false, // User can move meals if needed
            status: 'scheduled',
            meta: { origin: 'meal_planner' }
        };
    }

    private static timeToMins(t: string): number {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    private static minsToTime(m: number): string {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    }
}
