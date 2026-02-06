import { addDays, format, parse, setHours, setMinutes, startOfDay, endOfDay, isSameDay, addMinutes } from 'date-fns';
import { findNextAvailableSlot } from './solver';
import { CalendarPatch } from '@/lib/validation/calendar-contract';
import { Goal } from '@/types/database';

export class GoalScheduler {

    private static parseScheduleTime(date: Date, timeStr: string): Date {
        const [h, m] = timeStr.split(':').map(Number);
        return setMinutes(setHours(date, h), m);
    }

    private static attemptSchedule(
        itemsToSchedule: number,
        duration: number,
        stride: number,
        preferredTime: string,
        currentSchedule: any[]
    ): { changes: any[], slotsFound: number } {
        const changes: any[] = [];
        let dayOffset = 0;
        let attemptedDays = 0;
        let slotsFound = 0; // Initialize

        while (slotsFound < itemsToSchedule && attemptedDays < 14) {
            const date = addDays(new Date(), dayOffset);
            if (date < startOfDay(new Date())) {
                dayOffset++;
                attemptedDays++;
                continue;
            }

            let minTime = setMinutes(setHours(date, 8), 0);
            let maxTime = setMinutes(setHours(date, 22), 0);

            if (preferredTime === 'morning') {
                minTime = setMinutes(setHours(date, 5), 0);
                maxTime = setMinutes(setHours(date, 12), 0);
            } else if (preferredTime === 'afternoon') {
                minTime = setMinutes(setHours(date, 12), 0);
                maxTime = setMinutes(setHours(date, 17), 0);
            } else if (preferredTime === 'evening') {
                minTime = setMinutes(setHours(date, 17), 0);
                maxTime = setMinutes(setHours(date, 23), 0);
            }

            const dayContext = currentSchedule
                .filter(s => isSameDay(parse(s.start_time, 'HH:mm', date), date))
                .map(s => ({
                    id: s.id || 'existing',
                    start: this.parseScheduleTime(date, s.start_time),
                    end: this.parseScheduleTime(date, s.end_time),
                    type: (s.is_fixed || s.block_type === 'anchor' ? 'fixed' : 'flexible') as 'fixed' | 'flexible'
                }));

            const effectiveContext = dayContext.filter((x: any) => x.type === 'fixed');

            const slot = findNextAvailableSlot(
                effectiveContext,
                duration,
                date,
                { workStartHour: minTime.getHours(), workEndHour: maxTime.getHours() }
            );

            if (slot) {
                changes.push({
                    op: 'CREATE_ANCHOR',
                    title: 'Goal Session',
                    start_ts: slot.start.toISOString(),
                    end_ts: slot.end.toISOString(),
                    locked: false,
                    block_type: 'goal',
                });
                slotsFound++;
                dayOffset += stride;
            } else {
                dayOffset++;
            }
            attemptedDays++;
        }

        return { changes, slotsFound };
    }

    /**
     * Propose a schedule for a specific Goal over the next N days.
     */
    static proposeGoalSchedule(
        goal: Goal,
        currentSchedule: any[],
        preferences?: {
            preferredTime?: 'morning' | 'afternoon' | 'evening';
            days?: number[];
        }
    ): CalendarPatch {
        const duration = goal.minutes_per_day;
        const perWeek = goal.days_per_week || 3;
        const preferredTime = preferences?.preferredTime || (goal.constraints as any)?.preferred_time || 'any';

        const stride = Math.max(1, Math.floor(7 / perWeek));

        const warnings: string[] = [];

        // 1. Attempt Perfect Match
        let result = this.attemptSchedule(perWeek, duration, stride, preferredTime, currentSchedule);

        // 2. Fallback: Relaxed Time Window
        if (result.slotsFound === 0 && preferredTime !== 'any') {
            warnings.push(`Could not find slots in the ${preferredTime}. Switched to any time.`);
            result = this.attemptSchedule(perWeek, duration, stride, 'any', currentSchedule);
        }

        // 3. Fallback: Reduced Duration
        if (result.slotsFound === 0) {
            const reducedDuration = Math.max(15, Math.floor(duration * 0.75));
            warnings.push(`Squeezed duration from ${duration}m to ${reducedDuration}m to fit.`);
            result = this.attemptSchedule(perWeek, reducedDuration, stride, 'any', currentSchedule);
        }

        // 4. Fallback: Aggressive
        if (result.slotsFound === 0) {
            warnings.push(`Couldn't find space even with reduced duration. Packed sessions tightly.`);
            result = this.attemptSchedule(perWeek, Math.max(15, Math.floor(duration * 0.5)), 1, 'any', currentSchedule);
        }

        const finalChanges = result.changes.map(c => ({
            ...c,
            title: goal.title,
            goal_id: goal.id,
            notes: `Auto-scheduled. ${warnings.join(' ')}`
        }));

        if (finalChanges.length === 0) {
            // 5. Ultimate Fallback: Sacrifice
            const forcedDate = addDays(new Date(), 1);
            const forcedStart = setHours(startOfDay(forcedDate), 8);

            return {
                summary: `No free space found. I've placed a candidate slot for you to review.`,
                affected_date: format(forcedDate, 'yyyy-MM-dd'),
                changes: [{
                    op: 'CREATE_ANCHOR',
                    title: `[Review] ${goal.title}`,
                    start_ts: forcedStart.toISOString(),
                    end_ts: addMinutes(forcedStart, duration).toISOString(),
                    locked: false,
                    goal_id: goal.id,
                    block_type: 'goal',
                    notes: "Forces schedule logic. Please adjust."
                }],
                requires_confirmation: true,
                reasoning: "Your schedule is completely full. I had to force a slot.",
                warnings: ["Schedule Full", "Forced Slot"],
                sacrifices: [],
                source: 'system'
            };
        }

        return {
            summary: `Scheduled "${goal.title}" ${result.slotsFound} times.`,
            affected_date: format(new Date(), 'yyyy-MM-dd'),
            changes: finalChanges,
            requires_confirmation: true,
            reasoning: warnings.length ? `Adjusted strategy: ${warnings.join(', ')}` : "Fits with your preferences.",
            warnings: warnings,
            sacrifices: [],
            source: 'system'
        };
    }
}
