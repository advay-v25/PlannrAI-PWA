import {
    buildProposals,
    buildReshape,
    describeShape,
    evidenceFor,
    makeShape,
    nameDays,
    untouchedGoals,
    vetProposals,
    MAX_FORCED_PROPOSALS,
    MIN_SHAPE_MINUTES,
    MAX_SHAPE_MINUTES,
    MISSED_FLOOR_MINS,
    type GoalUsage,
    type ProposedChange,
} from '../proposals';
import type { WeekCapacity } from '@/lib/scheduling/capacity';

const TODAY = '2026-08-29';

const goal = (over: Partial<GoalUsage> = {}): GoalUsage => ({
    title: 'Deep Work',
    minutesPerDay: 60,
    daysPerWeek: 5,
    weeklyTarget: 300,
    completed: 300,
    activeDays: 5,
    eligibleBlocks: 5,
    completedBlocks: 5,
    createdAt: '2026-01-01',
    importance: 'medium',
    missedDates: ['2026-08-19'],
    ...over,
});

const capacity = (over: Partial<WeekCapacity> = {}): WeekCapacity => ({
    awakeMinsPerWeek: 6510, sleepMins: 3570, morningRoutineMins: 315, windDownMins: 315,
    mealMins: 840, commitmentMins: 360, bufferMins: 540, availableMins: 4140,
    targetedMins: 2300, headroomMins: 1840, isOvercommitted: false, ...over,
});

const weeklyOf = (c: ProposedChange) =>
    c.new_day_minutes ? c.new_day_minutes.reduce((a, b) => a + b, 0) : c.new_weekly_minutes ?? 0;

/** The four cases from Prompt 38's table, as they were actually proposed. */
const REGRESSION_CASES: Array<[string, GoalUsage]> = [
    ['Assignments 60m × 4 (cut to 20m × 2)', goal({
        title: 'Assignments', minutesPerDay: 60, daysPerWeek: 4, weeklyTarget: 240,
        completed: 60, activeDays: 1, eligibleBlocks: 4, completedBlocks: 1,
        missedDates: ['2026-08-19', '2026-08-20', '2026-08-21'],
    })],
    ['Sports 120m × 2 (cut to 20m × 1)', goal({
        title: 'Sports', minutesPerDay: 120, daysPerWeek: 2, weeklyTarget: 240,
        completed: 0, activeDays: 0, eligibleBlocks: 2, completedBlocks: 0,
        missedDates: ['2026-08-19', '2026-08-21'],
    })],
    ['PlannrAI 180m × 7 (cut to 69m × 7)', goal({
        title: 'PlannrAI', minutesPerDay: 180, daysPerWeek: 7, weeklyTarget: 1260,
        completed: 400, activeDays: 4, eligibleBlocks: 7, completedBlocks: 4,
        missedDates: ['2026-08-19', '2026-08-20', '2026-08-21'],
    })],
    ['Stocks 30m × 7 (cut to 24m × 3)', goal({
        title: 'Stocks', minutesPerDay: 30, daysPerWeek: 7, weeklyTarget: 210,
        completed: 60, activeDays: 2, eligibleBlocks: 7, completedBlocks: 2,
        missedDates: ['2026-08-19', '2026-08-20'],
    })],
];

describe('§3 — the review may never reduce a goal\'s hours', () => {
    it.each(REGRESSION_CASES)('%s produces a reshape or nothing, never a cut', (_label, g) => {
        for (const opts of [
            {},
            { capacity: capacity() },
            { capacity: capacity({ headroomMins: -600, isOvercommitted: true }) },
            { dryRun: { ok: true, unscheduledByGoal: { g: 5000 } }, capacity: capacity({ isOvercommitted: true }) },
            { totalMissedMins: 5000, capacity: capacity() },
        ]) {
            for (const c of buildProposals({ g }, TODAY, opts)) {
                expect(c.change_type).toBe('reshape');
                expect(weeklyOf(c)).toBeGreaterThanOrEqual(c.old_weekly_minutes!);
            }
        }
    });

    it('never reduces, for any shortfall in a week of any fullness', () => {
        for (const minutesPerDay of [15, 20, 30, 45, 60, 90, 120, 180, 240]) {
            for (let daysPerWeek = 1; daysPerWeek <= 7; daysPerWeek++) {
                for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 0.95, 1, 1.5]) {
                    const weeklyTarget = minutesPerDay * daysPerWeek;
                    const usage = {
                        g: goal({
                            minutesPerDay, daysPerWeek, weeklyTarget,
                            completed: Math.round(weeklyTarget * fraction),
                            activeDays: Math.min(daysPerWeek, Math.round(daysPerWeek * fraction)),
                            eligibleBlocks: daysPerWeek,
                            completedBlocks: Math.round(daysPerWeek * fraction),
                        }),
                    };
                    for (const overcommitted of [false, true]) {
                        const out = buildProposals(usage, TODAY, {
                            capacity: capacity({ isOvercommitted: overcommitted }),
                            dryRun: { ok: true, unscheduledByGoal: { g: weeklyTarget } },
                            totalMissedMins: weeklyTarget,
                        });
                        for (const c of out) {
                            expect(weeklyOf(c)).toBeGreaterThanOrEqual(weeklyTarget);
                        }
                    }
                }
            }
        }
    });

    it('the guard drops a reducing proposal even if a rule produced one', () => {
        const bad: ProposedChange = {
            goal_id: 'g', title: 'Sports', change_type: 'reshape',
            old_value: '120m/day × 2 days', new_value: '20m/day × 1 day',
            headline: 'x', old_weekly_minutes: 240, new_weekly_minutes: 20,
            rationale: 'x',
            evidence: { missed_minutes: 240, missed_dates: ['2026-08-19'], completed_minutes: 0, target_minutes: 240 },
        };
        expect(vetProposals([bad])).toHaveLength(0);
    });

    it('the guard drops a proposal whose per-day minutes disagree with its total', () => {
        const bad: ProposedChange = {
            goal_id: 'g', title: 'Gym', change_type: 'reshape',
            old_value: '120m/day × 4 days', new_value: '95m/day × 5 days',
            headline: 'x', old_weekly_minutes: 480, new_weekly_minutes: 480,
            new_day_minutes: [95, 95, 95, 95, 95], // 475, not 480
            rationale: 'x',
            evidence: { missed_minutes: 60, missed_dates: ['2026-08-19'], completed_minutes: 420, target_minutes: 480 },
        };
        expect(vetProposals([bad])).toHaveLength(0);
    });
});

describe('§2 — totals are preserved exactly', () => {
    it("Gym's 480 minutes stays 480, as 96 × 5", () => {
        const shape = makeShape(480, 5)!;
        expect(shape.minutes).toEqual([96, 96, 96, 96, 96]);
        expect(shape.minutes.reduce((a, b) => a + b, 0)).toBe(480);
    });

    it('distributes the remainder rather than rounding down', () => {
        expect(makeShape(250, 4)!.minutes).toEqual([65, 65, 60, 60]);
        expect(makeShape(300, 7)!.minutes.reduce((a, b) => a + b, 0)).toBe(300);
    });

    it('every shape it returns sums exactly, for every target and day count', () => {
        for (let weekly = 15; weekly <= 2000; weekly += 1) {
            for (let d = 1; d <= 7; d++) {
                const shape = makeShape(weekly, d);
                if (!shape) continue;
                expect(shape.minutes.reduce((a, b) => a + b, 0)).toBe(weekly);
                expect(shape.minutes).toHaveLength(d);
                for (const m of shape.minutes) {
                    expect(m).toBeGreaterThanOrEqual(MIN_SHAPE_MINUTES);
                    expect(m).toBeLessThanOrEqual(MAX_SHAPE_MINUTES);
                }
                expect(Math.max(...shape.minutes) - Math.min(...shape.minutes)).toBeLessThanOrEqual(5);
            }
        }
    });

    it('every emitted proposal preserves the total exactly', () => {
        for (const [, g] of REGRESSION_CASES) {
            for (const c of buildProposals({ g }, TODAY, { capacity: capacity() })) {
                if (!c.new_day_minutes) continue;
                expect(c.new_day_minutes.reduce((a, b) => a + b, 0)).toBe(c.old_weekly_minutes);
            }
        }
    });

    it('describeShape reads correctly for even and uneven shapes', () => {
        expect(describeShape({ days: 5, minutes: [96, 96, 96, 96, 96] })).toBe('96m/day × 5 days');
        expect(describeShape({ days: 4, minutes: [65, 65, 60, 60] })).toBe('65–60m/day × 4 days');
        expect(describeShape({ days: 1, minutes: [30] })).toBe('30m/day × 1 day');
    });
});

describe('§1 — reduce, increase and applied pause are gone', () => {
    it('a goal untouched for two weeks is prose, not a change', () => {
        const usage = { g: goal({ completed: 0, activeDays: 0, completedBlocks: 0, createdAt: '2026-01-01', missedDates: [] }) };
        expect(buildProposals(usage, TODAY, {})).toHaveLength(0);
        expect(untouchedGoals(usage, TODAY)).toEqual([
            { goal_id: 'g', title: 'Deep Work', weekly_minutes: 300 },
        ]);
    });

    it('a goal that beat its target produces nothing at all', () => {
        const usage = { g: goal({ weeklyTarget: 300, completed: 400, eligibleBlocks: 5, completedBlocks: 5 }) };
        expect(buildProposals(usage, TODAY, {})).toHaveLength(0);
    });

    it('a full week produces nothing', () => {
        const usage = {
            a: goal({ title: 'A', completed: 300, activeDays: 5, missedDates: [] }),
            b: goal({ title: 'B', minutesPerDay: 90, daysPerWeek: 4, weeklyTarget: 360, completed: 360, activeDays: 4, eligibleBlocks: 4, completedBlocks: 4, missedDates: [] }),
        };
        expect(buildProposals(usage, TODAY, { capacity: capacity(), totalMissedMins: 0 })).toHaveLength(0);
    });

    it('an empty week produces nothing', () => {
        expect(buildProposals({}, TODAY, { capacity: capacity(), totalMissedMins: 5000 })).toHaveLength(0);
    });
});

describe('reshape still does its job', () => {
    it('consolidates missed days into fewer, longer ones', () => {
        const usage = {
            g: goal({ minutesPerDay: 60, daysPerWeek: 5, weeklyTarget: 300, completed: 180,
                activeDays: 3, eligibleBlocks: 5, completedBlocks: 3,
                missedDates: ['2026-08-19', '2026-08-21'] }),
        };
        const out = buildProposals(usage, TODAY, { capacity: capacity() });
        expect(out).toHaveLength(1);
        expect(out[0].change_type).toBe('reshape');
        expect(out[0].new_day_minutes).toEqual([100, 100, 100]);
        expect(out[0].rationale).toContain('Wed and Fri');
    });

    it('splits short sessions across more days', () => {
        const usage = {
            g: goal({ minutesPerDay: 60, daysPerWeek: 3, weeklyTarget: 180, completed: 120,
                activeDays: 3, eligibleBlocks: 3, completedBlocks: 3, missedDates: ['2026-08-19'] }),
        };
        const out = buildProposals(usage, TODAY, { capacity: capacity() });
        expect(out[0].new_day_minutes).toEqual([45, 45, 45, 45]);
        expect(out[0].new_day_minutes!.reduce((a, b) => a + b, 0)).toBe(180);
    });

    it('caps the forced fallback and only picks goals that lost time', () => {
        const near = (i: number) => goal({
            title: `G${i}`, minutesPerDay: 120, daysPerWeek: 5, weeklyTarget: 600,
            completed: 575, activeDays: 4, eligibleBlocks: 5, completedBlocks: 4,
            missedDates: ['2026-08-20'],
        });
        const usage: Record<string, GoalUsage> = {};
        for (let i = 0; i < 5; i++) usage[`g${i}`] = near(i);
        usage.clean = goal({ title: 'Clean', completed: 300, activeDays: 5, missedDates: [] });
        const out = buildProposals(usage, TODAY, { capacity: capacity(), totalMissedMins: 125 });
        expect(out.length).toBeLessThanOrEqual(MAX_FORCED_PROPOSALS);
        expect(out.map((c) => c.title)).not.toContain('Clean');
        for (const c of out) expect(weeklyOf(c)).toBe(600);
    });

    it('stays silent under the whole-week floor', () => {
        const usage = { g: goal({ weeklyTarget: 600, completed: 590, minutesPerDay: 120, daysPerWeek: 5,
            activeDays: 4, eligibleBlocks: 5, completedBlocks: 4, missedDates: ['2026-08-20'] }) };
        expect(buildProposals(usage, TODAY, { capacity: capacity(), totalMissedMins: MISSED_FLOOR_MINS })).toHaveLength(0);
    });
});

describe('evidence helpers', () => {
    it('reports the goal\'s own shortfall', () => {
        expect(evidenceFor(goal({ weeklyTarget: 300, completed: 180, missedDates: ['2026-08-19'] }))).toEqual({
            missed_minutes: 120, missed_dates: ['2026-08-19'], completed_minutes: 180, target_minutes: 300,
        });
    });
    it('names days as prose', () => {
        expect(nameDays(['2026-08-17', '2026-08-19', '2026-08-21'])).toBe('Mon, Wed and Fri');
    });
    it('buildReshape and buildProposals agree', () => {
        const g = goal({ minutesPerDay: 60, daysPerWeek: 5, weeklyTarget: 300, completed: 180,
            activeDays: 3, eligibleBlocks: 5, completedBlocks: 3, missedDates: ['2026-08-19'] });
        expect(buildReshape('g', g, capacity())).toEqual(buildProposals({ g }, TODAY, { capacity: capacity() })[0]);
    });
});
