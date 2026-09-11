import {
    findBlockDefects,
    mergeAdjacentGoalBlocks,
    retitleGoalBlocks,
    freeIntervalsOn,
    runSwapPass,
    MAX_SWAP_RELOCATIONS,
} from '../plan-week';

const B = (over: any) => ({
    date: '2026-08-31', start_time: '09:00', end_time: '10:00',
    title: 'X', block_type: 'goal', goal_id: 'g1', ...over,
});

describe('§3 findBlockDefects', () => {
    it('accepts a clean day', () => {
        expect(findBlockDefects([
            B({ start_time: '09:00', end_time: '10:00' }),
            B({ start_time: '10:00', end_time: '11:00', goal_id: 'g2' }),
        ])).toEqual([]);
    });

    it('catches an overlap', () => {
        const d = findBlockDefects([
            B({ start_time: '09:00', end_time: '10:00', title: 'A' }),
            B({ start_time: '09:45', end_time: '10:45', title: 'B', goal_id: 'g2' }),
        ]);
        expect(d).toHaveLength(1);
        expect(d[0]).toMatch(/OVERLAP "A" 09:00–10:00 overlaps "B" 09:45–10:45/);
    });

    it('catches end_time not after start_time — the "15:30–" class of bug', () => {
        expect(findBlockDefects([B({ start_time: '15:30', end_time: '15:30' })])[0])
            .toMatch(/end_time 15:30 is not after start_time 15:30/);
        // The wraparound `minutesToTime` used to produce: 23:30 + 60min = "00:30".
        expect(findBlockDefects([B({ start_time: '23:30', end_time: '00:30' })])[0])
            .toMatch(/end_time 00:30 is not after start_time 23:30/);
    });

    it('catches a missing or malformed end_time', () => {
        expect(findBlockDefects([B({ end_time: undefined })])[0]).toMatch(/invalid end_time/);
        expect(findBlockDefects([B({ end_time: '' })])[0]).toMatch(/invalid end_time/);
        expect(findBlockDefects([B({ end_time: '25:00' })])[0]).toMatch(/invalid end_time/);
    });

    it('does not flag blocks on different days', () => {
        expect(findBlockDefects([
            B({ date: '2026-08-31', start_time: '09:00', end_time: '10:00' }),
            B({ date: '2026-09-01', start_time: '09:00', end_time: '10:00' }),
        ])).toEqual([]);
    });
});

describe('§1 mergeAdjacentGoalBlocks', () => {
    it('merges two blocks of the same goal separated by less than the buffer', () => {
        const { blocks, merges } = mergeAdjacentGoalBlocks([
            B({ start_time: '09:30', end_time: '10:30', title: 'PlannrAI (Part)' }),
            B({ start_time: '10:45', end_time: '11:15', title: 'PlannrAI (Part)' }),
        ], 30, 'test');
        expect(merges).toBe(1);
        const goal = blocks.filter(b => b.goal_id === 'g1');
        expect(goal).toHaveLength(1);
        expect(goal[0].start_time).toBe('09:30');
        expect(goal[0].end_time).toBe('11:15');
    });

    it('leaves genuinely separate sessions alone', () => {
        const { blocks, merges } = mergeAdjacentGoalBlocks([
            B({ start_time: '09:00', end_time: '10:00' }),
            B({ start_time: '15:00', end_time: '16:00' }),
        ], 15, 'test');
        expect(merges).toBe(0);
        expect(blocks.filter(b => b.goal_id === 'g1')).toHaveLength(2);
    });

    it('never merges across goals or across days', () => {
        const { merges } = mergeAdjacentGoalBlocks([
            B({ start_time: '09:00', end_time: '10:00', goal_id: 'g1' }),
            B({ start_time: '10:05', end_time: '11:00', goal_id: 'g2' }),
            B({ date: '2026-09-01', start_time: '10:05', end_time: '11:00', goal_id: 'g1' }),
        ], 30, 'test');
        expect(merges).toBe(0);
    });

    it('preserves non-goal blocks untouched', () => {
        const { blocks } = mergeAdjacentGoalBlocks([
            B({ block_type: 'meal', goal_id: undefined, title: 'Lunch' }),
        ], 30, 'test');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].title).toBe('Lunch');
    });
});

describe('§1 retitleGoalBlocks — (Part) only on genuine parts', () => {
    const targets = new Map([['g1', 120]]);

    it('drops (Part) from a single block that meets the daily target', () => {
        const out = retitleGoalBlocks(
            [B({ start_time: '09:00', end_time: '11:00', title: 'PlannrAI (Part)' })],
            targets
        );
        expect(out[0].title).toBe('PlannrAI');
    });

    it('marks a single short block as (Shortened) when the goal ends the week short', () => {
        const out = retitleGoalBlocks(
            [B({ start_time: '09:00', end_time: '09:45', title: 'PlannrAI' })],
            targets,
            new Set(['g1'])
        );
        expect(out[0].title).toBe('PlannrAI (Shortened)');
    });

    it('does NOT mark the week\'s final smaller session as (Shortened)', () => {
        // A 315min goal at 90min/day ends on a 45min block. That is the
        // remainder, not a shortfall, and calling it "(Shortened)" made the
        // importance-ordering invariant look violated when it was not.
        const out = retitleGoalBlocks(
            [B({ start_time: '09:00', end_time: '09:45', title: 'PlannrAI' })],
            targets,
            new Set() // weekly target fully met
        );
        expect(out[0].title).toBe('PlannrAI');
    });

    it('marks genuinely split blocks as (Part)', () => {
        const out = retitleGoalBlocks([
            B({ start_time: '09:00', end_time: '10:00', title: 'PlannrAI' }),
            B({ start_time: '15:00', end_time: '16:00', title: 'PlannrAI' }),
        ], targets);
        expect(out.map(b => b.title)).toEqual(['PlannrAI (Part)', 'PlannrAI (Part)']);
    });
});

describe('§4 freeIntervalsOn', () => {
    const blocks = [
        B({ block_type: 'meal', goal_id: undefined, start_time: '12:00', end_time: '13:00' }),
        B({ start_time: '09:00', end_time: '10:00' }),
    ];

    it('reports the real gaps left after everything placed', () => {
        expect(freeIntervalsOn(blocks, '2026-08-31', 480, 900)).toEqual([
            { start: 480, end: 540 },   // 08:00–09:00
            { start: 600, end: 720 },   // 10:00–12:00
            { start: 780, end: 900 },   // 13:00–15:00
        ]);
    });

    it('can ignore goal blocks — the view the swap pass needs', () => {
        expect(freeIntervalsOn(blocks, '2026-08-31', 480, 900, { ignoreGoalBlocks: true })).toEqual([
            { start: 480, end: 720 },
            { start: 780, end: 900 },
        ]);
    });
});

describe('§2b runSwapPass — flexible yields to constrained', () => {
    const dayBounds = new Map([
        ['2026-08-31', { lower: 540, upper: 690 }],  // 09:00–11:30, the only body-viable day
        ['2026-09-01', { lower: 540, upper: 780 }],  // 09:00–13:00, wide open
    ]);
    const bodyUpper = new Map([['2026-08-31', 690], ['2026-09-01', 780]]);

    it('moves a flexible craft block so a rigid body block can be placed whole', () => {
        const blocks: any[] = [
            B({ date: '2026-08-31', start_time: '09:00', end_time: '10:00', title: 'SiteSmith', goal_id: 'craft', pillar: 'craft' }),
        ];
        const { relocations, placed } = runSwapPass({
            blocks, label: 'test',
            needs: [{ goalId: 'gym', title: 'Gym', pillar: 'body', sessionMins: 120, dates: ['2026-08-31'] }],
            dayBounds, bodyUpperBound: bodyUpper, bufferMins: 15,
        });

        expect(relocations).toBe(1);
        expect(placed).toBe(120);

        const craft = blocks.find(b => b.goal_id === 'craft')!;
        expect(craft.date).toBe('2026-09-01'); // moved out of the way
        const gym = blocks.find(b => b.goal_id === 'gym')!;
        expect(gym.date).toBe('2026-08-31');
        expect(gym.start_time).toBe('09:00');
        expect(gym.end_time).toBe('11:00');   // whole session, not shortened

        expect(findBlockDefects(blocks)).toEqual([]);
    });

    it('never relocates a body block to make room for something else', () => {
        const blocks: any[] = [
            B({ date: '2026-08-31', start_time: '09:00', end_time: '10:00', title: 'Sports', goal_id: 'sports', pillar: 'body' }),
        ];
        const { relocations } = runSwapPass({
            blocks, label: 'test',
            needs: [{ goalId: 'study', title: 'Studying', pillar: 'craft', sessionMins: 120, dates: ['2026-08-31'] }],
            dayBounds, bodyUpperBound: bodyUpper, bufferMins: 15,
        });
        expect(relocations).toBe(0);
        expect(blocks.find(b => b.goal_id === 'sports')!.date).toBe('2026-08-31');
    });

    it('does nothing when the occupant has nowhere else to go', () => {
        const onlyDay = new Map([['2026-08-31', { lower: 540, upper: 690 }]]);
        const blocks: any[] = [
            B({ date: '2026-08-31', start_time: '09:00', end_time: '10:00', goal_id: 'craft', pillar: 'craft' }),
        ];
        const { relocations, placed } = runSwapPass({
            blocks, label: 'test',
            needs: [{ goalId: 'gym', title: 'Gym', pillar: 'body', sessionMins: 120, dates: ['2026-08-31'] }],
            dayBounds: onlyDay, bodyUpperBound: new Map([['2026-08-31', 690]]), bufferMins: 15,
        });
        expect(relocations).toBe(0);
        expect(placed).toBe(0);
    });

    it('is bounded at MAX_SWAP_RELOCATIONS', () => {
        expect(MAX_SWAP_RELOCATIONS).toBe(8);
        // Nine occupants in the target window can never be cleared within the bound.
        const blocks: any[] = Array.from({ length: 9 }, (_, i) =>
            B({
                date: '2026-08-31', goal_id: `c${i}`, pillar: 'craft',
                start_time: `${String(9 + i).padStart(2, '0')}:00`,
                end_time: `${String(9 + i).padStart(2, '0')}:30`,
            })
        );
        const wide = new Map([
            ['2026-08-31', { lower: 540, upper: 1140 }],
            ['2026-09-01', { lower: 540, upper: 1140 }],
        ]);
        const { relocations } = runSwapPass({
            blocks, label: 'test',
            needs: [{ goalId: 'gym', title: 'Gym', pillar: 'body', sessionMins: 120, dates: ['2026-08-31'] }],
            dayBounds: wide, bodyUpperBound: new Map([['2026-08-31', 1140], ['2026-09-01', 1140]]), bufferMins: 15,
        });
        expect(relocations).toBeLessThanOrEqual(MAX_SWAP_RELOCATIONS);
    });
});

describe('§2a concentrateShortfall — the loss lands on one block, not spread', () => {
    const { concentrateShortfall } = require('../plan-week');
    // Stocks (importance 2) carries 105min of slack — enough to absorb a
    // typical overage alone, which is the whole point of concentrating.
    const day = [
        { id: 'a', goalId: 'g1', title: 'PlannrAI', mins: 120, importance: 9 },
        { id: 'b', goalId: 'g2', title: 'SiteSmith', mins: 90, importance: 9 },
        { id: 'c', goalId: 'g3', title: 'Assignments', mins: 90, importance: 5 },
        { id: 'd', goalId: 'g4', title: 'Stocks', mins: 120, importance: 2 },
    ];

    it('8b: a day 60min over shortens exactly ONE block by 60', () => {
        const cuts = concentrateShortfall(day, 60);
        expect(cuts).toHaveLength(1);
        expect(cuts[0].from - cuts[0].to).toBe(60);
    });

    it('8c: the lowest-importance block absorbs first', () => {
        const cuts = concentrateShortfall(day, 60);
        expect(cuts[0].title).toBe('Stocks');
        expect(cuts[0].importance).toBe(2);
    });

    it("exhausts one candidate's slack before touching the next", () => {
        // Stocks has 120-15 = 105min of slack. 150min over takes all of it,
        // then 45 from the next-lowest (Assignments, importance 5).
        const cuts = concentrateShortfall(day, 150);
        expect(cuts).toHaveLength(2);
        expect(cuts[0].title).toBe('Stocks');
        expect(cuts[0].to).toBe(15);                       // exhausted to the floor
        expect(cuts[1].title).toBe('Assignments');
        expect(cuts[1].from - cuts[1].to).toBe(45);
    });

    it('8d: uses the minimum number of blocks', () => {
        // 105min over is exactly Stocks' slack — one block, never two.
        expect(concentrateShortfall(day, 105)).toHaveLength(1);
        // 106min needs a second.
        expect(concentrateShortfall(day, 106)).toHaveLength(2);
    });

    it('never cuts a higher-importance block while a lower one has slack', () => {
        for (const over of [15, 30, 60, 105, 150, 240]) {
            const cuts = concentrateShortfall(day, over);
            for (let i = 1; i < cuts.length; i++) {
                expect(cuts[i].importance).toBeGreaterThanOrEqual(cuts[i - 1].importance);
                expect(cuts[i - 1].to).toBe(15); // previous was taken to the floor first
            }
        }
    });

    it('never goes below MIN_BLOCK_MINS, even when the day cannot be made to fit', () => {
        const cuts = concentrateShortfall(day, 100000);
        for (const c of cuts) expect(c.to).toBeGreaterThanOrEqual(15);
        expect(cuts).toHaveLength(4); // everything to the floor, nothing dropped
    });

    it('never touches a block already at the floor', () => {
        const atFloor = [{ id: 'x', goalId: 'g', title: 'Tiny', mins: 15, importance: 1 }, ...day];
        const cuts = concentrateShortfall(atFloor, 30);
        expect(cuts.some((c: any) => c.title === 'Tiny')).toBe(false);
    });

    it('does nothing on a day that already fits', () => {
        expect(concentrateShortfall(day, 0)).toEqual([]);
        expect(concentrateShortfall(day, -50)).toEqual([]);
    });
});

describe('§1 merge must never swallow an intervening block', () => {
    it('declines a merge when another goal sits in the gap', () => {
        // The exact recovery failure: two Studying blocks 30min apart, with a
        // SiteSmith block between them. Merging produced 08:45–11:30, which
        // overlapped SiteSmith and got the whole variant rejected.
        const { blocks, merges } = mergeAdjacentGoalBlocks([
            B({ start_time: '08:45', end_time: '10:15', title: 'Studying', goal_id: 'study' }),
            B({ start_time: '10:15', end_time: '10:45', title: 'SiteSmith', goal_id: 'site' }),
            B({ start_time: '10:45', end_time: '11:30', title: 'Studying', goal_id: 'study' }),
        ], 120, 'test');

        expect(merges).toBe(0);
        expect(findBlockDefects(blocks)).toEqual([]);
        expect(blocks.filter(b => b.goal_id === 'study')).toHaveLength(2);
    });

    it('still merges across genuinely dead space', () => {
        const { blocks, merges } = mergeAdjacentGoalBlocks([
            B({ start_time: '09:00', end_time: '10:00', goal_id: 'study' }),
            B({ start_time: '10:20', end_time: '11:00', goal_id: 'study' }),
        ], 120, 'test');
        expect(merges).toBe(1);
        expect(blocks.filter(b => b.goal_id === 'study')[0].end_time).toBe('11:00');
    });

    it('a large buffer never creates an overlap', () => {
        // Recovery's 120min buffer over a busy day: whatever merges, the result
        // must satisfy the overlap invariant.
        const day = [
            B({ start_time: '08:00', end_time: '09:00', goal_id: 'a', title: 'A' }),
            B({ start_time: '09:15', end_time: '09:45', goal_id: 'b', title: 'B' }),
            B({ start_time: '10:00', end_time: '11:00', goal_id: 'a', title: 'A' }),
            B({ start_time: '11:10', end_time: '11:40', goal_id: 'c', title: 'C' }),
            B({ start_time: '12:00', end_time: '13:00', goal_id: 'a', title: 'A' }),
        ];
        const { blocks } = mergeAdjacentGoalBlocks(day, 120, 'test');
        expect(findBlockDefects(blocks)).toEqual([]);
    });
});

describe('§2b swap pass never double-books a destination', () => {
    it('sends two displaced occupants to different slots', () => {
        // The Gentle Afternoon failure: two occupants of the same window were
        // each handed 2026-09-07 10:45, because the alternative search ignores
        // blocks at their OLD positions but reserved nothing at their new ones.
        const blocks: any[] = [
            B({ date: '2026-09-08', start_time: '20:30', end_time: '22:30', title: 'PlannrAI', goal_id: 'pl', pillar: 'craft' }),
            B({ date: '2026-09-08', start_time: '22:30', end_time: '23:15', title: 'Studying', goal_id: 'st', pillar: 'craft' }),
        ];
        const dayBounds = new Map([
            ['2026-09-07', { lower: 600, upper: 1380 }], // wide open destination
            ['2026-09-08', { lower: 1215, upper: 1395 }],
        ]);
        const { relocations } = runSwapPass({
            blocks, label: 'test',
            needs: [{ goalId: 'as', title: 'Assignments', pillar: 'mind', sessionMins: 90, dates: ['2026-09-08'] }],
            dayBounds,
            bodyUpperBound: new Map([['2026-09-07', 1380], ['2026-09-08', 1395]]),
            bufferMins: 45,
        });

        expect(relocations).toBeGreaterThan(0);
        // The invariant that actually matters, whatever it chose to do:
        expect(findBlockDefects(blocks)).toEqual([]);

        const starts = blocks
            .filter(b => b.date === '2026-09-07')
            .map(b => b.start_time);
        expect(new Set(starts).size).toBe(starts.length); // no two at the same time
    });
});

describe('§2 (P52) recovery day ranking', () => {
    const {
        pickRecoveryDayIndex, rankRecoveryDay,
        RECOVERY_WEEKEND_WEIGHT, RECOVERY_LIGHT_WEEKEND_WEIGHT, RECOVERY_ADJACENCY_PENALTY,
    } = require('../plan-week');

    const counts = (m: Record<number, number>) => new Map(Object.entries(m).map(([k, v]) => [Number(k), v]));
    const base = (blocks: Record<number, number>, mins: Record<number, number> = {}, used: number[] = [], light = false) => ({
        goalBlockCountPerDay: counts(blocks),
        workloadPerDay: counts(mins),
        daysUsedByThisGoal: new Set(used),
        forceLightWeekend: light,
    });

    it('ranks on BLOCK COUNT, not minutes', () => {
        // Tue holds one 120min block, Wed holds three 45min blocks. Minutes say
        // Tue is heavier; block count — the quantity that matters — says Wed is.
        const opts = base({ 2: 1, 3: 3 }, { 2: 120, 3: 135 });
        expect(pickRecoveryDayIndex([2, 3], opts)).toBe(0); // Tue
    });

    it('uses minutes only to break a block-count tie', () => {
        const opts = base({ 2: 2, 3: 2 }, { 2: 300, 3: 120 });
        expect(pickRecoveryDayIndex([2, 3], opts)).toBe(1); // Wed, fewer minutes
    });

    it('a weekend day costs about twice a weekday', () => {
        expect(RECOVERY_WEEKEND_WEIGHT).toBe(0.5);
        // Sat with 1 block scores (1+1)/0.5 = 4; Tue with 2 scores 3 → Tue wins.
        expect(rankRecoveryDay(6, base({ 6: 1 })).score).toBeCloseTo(4);
        expect(rankRecoveryDay(2, base({ 2: 2 })).score).toBeCloseTo(3);
        expect(pickRecoveryDayIndex([6, 2], base({ 6: 1, 2: 2 }))).toBe(1);
    });

    it('forceLightWeekend makes weekends cost more, not run the week backwards', () => {
        expect(RECOVERY_LIGHT_WEEKEND_WEIGHT).toBe(0.25);
        const normal = rankRecoveryDay(6, base({ 6: 1 }, {}, [], false)).score;
        const light = rankRecoveryDay(6, base({ 6: 1 }, {}, [], true)).score;
        expect(light).toBeGreaterThan(normal);
        // and it never makes Sunday preferable to Monday
        expect(pickRecoveryDayIndex([1, 7], base({}, {}, [], true))).toBe(0);
    });

    it('avoids a day adjacent to one this goal already uses', () => {
        expect(RECOVERY_ADJACENCY_PENALTY).toBe(1.0);
        // Goal is on Mon. Tue is adjacent, Wed is not — both otherwise empty.
        expect(pickRecoveryDayIndex([2, 3], base({}, {}, [1]))).toBe(1); // Wed
    });

    it('a 3-of-5 goal lands Mon/Wed/Fri, not Mon/Tue/Wed', () => {
        const chosen: number[] = [];
        const blockCounts: Record<number, number> = {};
        for (let i = 0; i < 3; i++) {
            const days = [1, 2, 3, 4, 5].filter(d => !chosen.includes(d));
            const idx = pickRecoveryDayIndex(days, base(blockCounts, {}, chosen));
            const day = days[idx];
            chosen.push(day);
            blockCounts[day] = (blockCounts[day] || 0) + 1;
        }
        expect(chosen.sort()).toEqual([1, 3, 5]);
    });

    it('spacing yields rather than leaving a goal short', () => {
        // 5 days needed out of 5 — adjacency is unavoidable and must not block.
        const chosen: number[] = [];
        for (let i = 0; i < 5; i++) {
            const days = [1, 2, 3, 4, 5].filter(d => !chosen.includes(d));
            chosen.push(days[pickRecoveryDayIndex(days, base({}, {}, chosen))]);
        }
        expect(chosen.sort()).toEqual([1, 2, 3, 4, 5]);
    });
});
