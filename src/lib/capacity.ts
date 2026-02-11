import { Goal, Commitment, Profile } from '@/types/database';

interface CapacityResult {
    totalGoalMinutes: number;
    maxCapacityMinutes: number;
    percentage: number;
    isOvercommitted: boolean;
    breakdown: {
        wakeMinutes: number;
        sleepMinutes: number;
        anchorMinutes: number;
        bioOverhead: number;
    };
}

export function calculateGoalCapacity(
    profile: Partial<Profile>,
    goals: Goal[],
    commitments: Commitment[]
): CapacityResult {
    // 1. Calculate Demand (Goals)
    // Only active goals count. Weight by days_per_week to get daily average.
    const activeGoals = goals.filter(g => g.status === 'active' && !g.is_paused);
    const totalGoalMinutes = activeGoals.reduce((sum, g) => {
        const daysPerWeek = (g as any).days_per_week || 7;
        return sum + Math.round((g.minutes_per_day || 0) * daysPerWeek / 7);
    }, 0);

    // 2. Calculate Supply (Capacity)
    const sleepStart = profile.sleep_start || '23:00';
    const sleepEnd = profile.sleep_end || '07:00';

    const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    // A. Reality Window (Wake up until 45 mins before sleep)
    const rawWakeMinutes = parseTime(sleepStart) - parseTime(sleepEnd);
    const wakeWindowMinutes = rawWakeMinutes < 0 ? rawWakeMinutes + 1440 : rawWakeMinutes;

    // Safety buffer: 45 mins before sleep is unusable
    const usableWakeMinutes = Math.max(0, wakeWindowMinutes - 45);

    // B. Anchors / Fixed Commitments (Daily Average)
    const anchorMinutesPerWeek = commitments.reduce((weekSum, c) => {
        if (!c.is_active) return weekSum;
        const start = parseTime(c.start_time);
        const end = parseTime(c.end_time);
        let duration = end - start;
        if (duration < 0) duration += 1440;

        const daysCount = c.days_of_week?.length || 0;
        return weekSum + (duration * daysCount);
    }, 0);

    const avgAnchorMinutes = Math.round(anchorMinutesPerWeek / 7);

    // C. Biological Overhead
    // 2 Meals (30m each) + 1 Routine/Buffer (30m) = 90m total unusable
    const bioOverhead = 90;

    // D. Available Time
    const maxCapacityMinutes = Math.max(0, usableWakeMinutes - avgAnchorMinutes - bioOverhead);

    // 3. Result
    const percentage = maxCapacityMinutes > 0
        ? Math.round((totalGoalMinutes / maxCapacityMinutes) * 100)
        : (totalGoalMinutes > 0 ? 200 : 0);

    return {
        totalGoalMinutes,
        maxCapacityMinutes,
        percentage,
        isOvercommitted: percentage > 100,
        breakdown: {
            wakeMinutes: usableWakeMinutes,
            sleepMinutes: 1440 - wakeWindowMinutes,
            anchorMinutes: avgAnchorMinutes,
            bioOverhead
        }
    };
}

