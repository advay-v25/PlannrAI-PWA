import { computeDayCapacities, busiestDay, computeWeekCapacity } from '../capacity';

const profile = {
    sleep_start: '23:00', sleep_end: '07:00',
    wind_down_mins: 45, morning_routine_mins: 45, meals_per_day: 3,
};

describe('§3 computeDayCapacities', () => {
    it('reports seven days, Monday first', () => {
        const days = computeDayCapacities(profile, [], []);
        expect(days).toHaveLength(7);
        expect(days.map(d => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        expect(days[0].isoDay).toBe(1);
    });

    it('gives a day with anchors less free time than one without', () => {
        const commitments = [{ start_time: '09:00', end_time: '17:00', days_of_week: [2] }]; // Tuesday
        const days = computeDayCapacities(profile, [], commitments);
        const tue = days.find(d => d.isoDay === 2)!;
        const wed = days.find(d => d.isoDay === 3)!;
        expect(tue.freeMins).toBe(wed.freeMins - 480);
    });

    it('surfaces a heavy day that the weekly average hides', () => {
        // Five goals that only run on Tuesday: the week looks light, Tuesday
        // does not. This is the case the average cannot show.
        const goals = Array.from({ length: 5 }, () => ({ minutes_per_day: 180, days_per_week: 1 }));
        const days = computeDayCapacities(profile, goals, []);
        const busy = busiestDay(days);

        const week = computeWeekCapacity(profile, goals, []);
        const weeklyAveragePct = Math.round(
            (week.targetedMins / 7) / (week.availableMins / 7) * 100
        );

        expect(weeklyAveragePct).toBeLessThan(100);      // the week looks fine
        expect(busy.plannedMins).toBeGreaterThan(0);
        expect(busy.loadPercentage).toBeGreaterThan(weeklyAveragePct); // the day does not
    });

    it('flags a day whose planned minutes exceed its free minutes', () => {
        // One goal too big for any single day. Two separate 1-day goals would
        // be spread to different days by the least-loaded assignment, which is
        // the correct behaviour and would not demonstrate anything.
        const goals = [{ minutes_per_day: 700, days_per_week: 1 }];
        const days = computeDayCapacities(profile, goals, []);
        const busy = busiestDay(days);
        expect(busy.isOver).toBe(true);
        expect(busy.plannedMins).toBeGreaterThan(busy.freeMins);
    });

    it('spreads a 7-day goal across all seven days', () => {
        const days = computeDayCapacities(profile, [{ minutes_per_day: 60, days_per_week: 7 }], []);
        expect(days.every(d => d.plannedMins > 0)).toBe(true);
    });

    it('ignores paused and non-active goals, exactly as the week-level function does', () => {
        const goals = [
            { minutes_per_day: 120, days_per_week: 7, is_paused: true },
            { minutes_per_day: 120, days_per_week: 7, status: 'archived' },
        ];
        const days = computeDayCapacities(profile, goals, []);
        expect(days.every(d => d.plannedMins === 0)).toBe(true);
        expect(computeWeekCapacity(profile, goals, []).targetedMins).toBe(0);
    });

    it('agrees with the week-level function on total free time', () => {
        const commitments = [{ start_time: '09:00', end_time: '11:00', days_of_week: [1, 3] }];
        const days = computeDayCapacities(profile, [], commitments);
        const week = computeWeekCapacity(profile, [], commitments);
        const perDayTotal = days.reduce((s, d) => s + d.freeMins, 0);
        // Both models remove the same fixed costs; the only difference is that
        // the week-level figure also subtracts per-goal buffers, and there are
        // no goals here.
        expect(perDayTotal).toBe(week.availableMins);
    });
});
