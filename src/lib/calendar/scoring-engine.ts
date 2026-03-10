import { ScheduleBlock, Goal, Profile } from '@/types/database';

export interface ScoredSlot {
    start: Date;
    end: Date;
    score: number;
    penalties: string[];
}

export class ScoringEngine {

    /**
     * Scores a candidate slot for a specific goal.
     * Higher score = better fit.
     * 
     * Factors:
     * 1. Preferred Windows (Profile & Goal)
     * 2. Energy Matching (Goal Energy vs User Energy Curve)
     * 3. Spacing (Time since last block of same pillar)
     * 4. Variety (Penalty for back-to-back same pillar)
     * 5. Day Span (Use the whole day)
     */
    static scoreSlot(
        slotStart: Date,
        slotEnd: Date,
        goal: Goal,
        profile: Profile,
        dayContext: {
            blocks: Partial<ScheduleBlock>[];
            startOfDay: Date;
            endOfDay: Date;
        }
    ): ScoredSlot {
        let score = 100;
        const penalties: string[] = [];

        // 1. Variety / Back-to-Back Penalty
        // Check immediate previous block
        const prevBlock = this.findPreviousBlock(slotStart, dayContext.blocks);
        if (prevBlock && prevBlock.pillar === goal.pillar) {
            score -= 50;
            penalties.push('back_to_back_pillar');
        }

        // 2. Spacing Penalty (Same Pillar Fatigue)
        // If we have had a lot of this pillar recently
        const recentPillarBlocks = dayContext.blocks.filter(b =>
            b.pillar === goal.pillar &&
            this.getMinutesBetween(new Date((b.end_time as string)), slotStart) < 120
        );
        if (recentPillarBlocks.length > 0) {
            score -= 20 * recentPillarBlocks.length;
            penalties.push('pillar_fatigue');
        }

        // 3. Energy Matching (Simple proxy: Morning/Afternoon/Evening)
        // Todo: Use biological prime time from profile if available
        const hour = slotStart.getHours();
        const energyDemand = goal.energy || 'medium';

        // Late Night Penalty for Heavy Work
        if (hour >= 20 && energyDemand === 'heavy') {
            score -= 40;
            penalties.push('late_heavy_work');
        }

        // 4. Preferred Windows (Goal Specific)
        if (goal.preferred_windows && Array.isArray(goal.preferred_windows) && goal.preferred_windows.length > 0) {
            const isInWindow = goal.preferred_windows.some((w: any) => this.isTimeInWindow(slotStart, w as string));
            if (isInWindow) score += 30;
            else score -= 10;
        }

        // 5. Pillar Preferences (Profile)
        // E.g. Mind in morning, Body in evening
        const pillarPrefs = profile.pillar_preferences as any;
        if (pillarPrefs && goal.pillar && pillarPrefs[goal.pillar]) {
            const pref = pillarPrefs[goal.pillar];
            if (this.matchesPreference(slotStart, pref.preferred)) {
                score += 20;
            }
            if (this.matchesPreference(slotStart, pref.avoid)) {
                score -= 30;
                penalties.push('avoid_time_preference');
            }
        }

        // 6. Day Distribution (Avoid clumping at start of day)
        // Light bonus for later slots to spread things out if day is empty?
        // Actually, we usually want to pack front-to-back unless spaced.
        // Let's leave this neutral for now, spacing rules handle density.

        return {
            start: slotStart,
            end: slotEnd,
            score,
            penalties
        };
    }

    private static findPreviousBlock(time: Date, blocks: Partial<ScheduleBlock>[]): Partial<ScheduleBlock> | undefined {
        // Sort blocks by end time desc, find first one that ends <= time
        // Note: blocks might not be sorted in context, so we filter then sort
        const valid = blocks.filter(b => {
            const end = this.parseTime(b.end_time as string, time);
            return end <= time;
        });
        return valid.sort((a, b) => b.end_time!.localeCompare(a.end_time!))[0];
    }

    private static getMinutesBetween(d1: Date, d2: Date): number {
        return Math.abs(d1.getTime() - d2.getTime()) / 60000;
    }

    private static isTimeInWindow(date: Date, windowStr: string): boolean {
        let start = "00:00";
        let end = "23:59";

        if (windowStr === 'morning') { start = "06:00"; end = "12:00"; }
        else if (windowStr === 'afternoon') { start = "12:00"; end = "17:00"; }
        else if (windowStr === 'evening') { start = "17:00"; end = "21:00"; }
        else if (windowStr === 'night') { start = "21:00"; end = "04:00"; } // Crosses midnight handled differently?
        else if (windowStr.includes('-')) {
            [start, end] = windowStr.split('-');
        } else {
            return false;
        }

        const t = date.getHours() * 60 + date.getMinutes();
        const s = this.timeToMins(start);
        const e = this.timeToMins(end);

        // Handle midnight crossing
        if (s > e) return t >= s || t <= e;
        return t >= s && t <= e;
    }

    private static matchesPreference(date: Date, windows: string[]): boolean {
        if (!windows) return false;
        return windows.some(w => this.isTimeInWindow(date, w));
    }

    private static timeToMins(t: string): number {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    private static parseTime(t: string, refDate: Date): Date {
        const [h, m] = t.split(':').map(Number);
        const d = new Date(refDate);
        d.setHours(h, m, 0, 0);
        return d;
    }
}
