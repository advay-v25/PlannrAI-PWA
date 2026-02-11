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
    // Only active goals count
    const activeGoals = goals.filter(g => g.status === 'active');
    const totalGoalMinutes = activeGoals.reduce((sum, g) => sum + (g.minutes_per_day || 0), 0);

    // 2. Calculate Supply (Capacity)

    // A. Wake Window
    const sleepStart = profile.sleep_start || '23:00';
    const sleepEnd = profile.sleep_end || '07:00';

    const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    let wakeMinutes = parseTime(sleepStart) - parseTime(sleepEnd);
    if (wakeMinutes < 0) wakeMinutes += 24 * 60; // Handle overnight

    const sleepMinutes = 1440 - wakeMinutes;

    // B. Anchors (Average Daily Impact)
    // Sum duration of all commitment instances in a week, divide by 7
    const anchorMinutesPerWeek = commitments.reduce((weekSum, c) => {
        if (!c.is_active) return weekSum;
        const start = parseTime(c.start_time);
        const end = parseTime(c.end_time);
        let duration = end - start;
        if (duration < 0) duration += 24 * 60;

        const daysCount = c.days_of_week?.length || 0;
        return weekSum + (duration * daysCount);
    }, 0);

    const avgAnchorMinutes = Math.round(anchorMinutesPerWeek / 7);

    // C. Bio-Overhead (Fixed assumptions for now)
    // Meals: 3 * 30m = 90m
    // Wind Down: 45m
    // Buffer: 0 (or implicit in wind down)
    const mealsMinutes = 90;
    const windDownMinutes = 45;
    const bioOverhead = mealsMinutes + windDownMinutes;

    // D. Max Capacity
    // Cap at 0 to avoid negative capacity
    const maxCapacityMinutes = Math.max(0, wakeMinutes - avgAnchorMinutes - bioOverhead);

    // 3. Result
    // Cap percentage at 200% for display sanity
    const rawPercentage = maxCapacityMinutes > 0
        ? Math.round((totalGoalMinutes / maxCapacityMinutes) * 100)
        : 100; // If 0 capacity and 0 goals -> 0%. If 0 capacity and >0 goals -> infinite (100+).
    // Actually if maxCapacity is 0, any goal is infinite overcommitment. 
    // Let's cap at 200% as requested.

    const percentage = Math.min(rawPercentage, 200);

    return {
        totalGoalMinutes,
        maxCapacityMinutes,
        percentage,
        isOvercommitted: totalGoalMinutes > maxCapacityMinutes,
        breakdown: {
            wakeMinutes,
            sleepMinutes,
            anchorMinutes: avgAnchorMinutes,
            bioOverhead
        }
    };
}
