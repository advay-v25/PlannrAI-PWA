import { writeWeek, timeToMin } from '../week-writer';

/**
 * §4: completion marks across a regeneration.
 *
 * Days before the generation day keep the marks they already carried; blocks
 * newly created for those days carry none; everything from the generation day
 * onward is unmarked whatever it arrived as.
 */

type Row = {
    id: string; date: string; start_time: string; end_time: string;
    title: string; block_type: string; goal_id: string | null; status: string; is_locked?: boolean;
};

function mockSupabase(existing: Row[]) {
    const deleted: string[] = [];
    const inserted: any[] = [];

    const table = (name: string) => {
        const filters: any = { in: null as null | { col: string; vals: any[] } };
        const chain: any = {
            _rows: existing,
            select: () => chain,
            eq: () => chain,
            gte: (_c: string, v: string) => { filters.gte = v; return chain; },
            lte: (_c: string, v: string) => { filters.lte = v; return chain; },
            lt: (_c: string, v: string) => { filters.lt = v; return chain; },
            in: (c: string, vals: any[]) => { filters.in = { col: c, vals }; return chain; },
            order: () => chain,
            limit: () => chain,
            single: async () => ({ data: { id: 'ver1' }, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            insert: (rows: any) => {
                if (name === 'schedule_blocks') inserted.push(...(Array.isArray(rows) ? rows : [rows]));
                return { select: () => ({ single: async () => ({ data: { id: 'ver1' }, error: null }) }) };
            },
            delete: () => ({
                eq: () => ({
                    in: async (_c: string, ids: string[]) => { deleted.push(...ids); return { error: null, count: ids.length }; },
                }),
            }),
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        };
        chain.then = (resolve: any) => {
            if (name !== 'schedule_blocks') return resolve({ data: [], error: null });
            let rows = existing;
            if (filters.gte) rows = rows.filter(r => r.date >= filters.gte);
            if (filters.lte) rows = rows.filter(r => r.date <= filters.lte);
            if (filters.lt) rows = rows.filter(r => r.date < filters.lt);
            if (filters.in) rows = rows.filter(r => filters.in!.vals.includes((r as any)[filters.in!.col]));
            return resolve({ data: rows, error: null });
        };
        return chain;
    };

    return { supabase: { from: table } as any, deleted, inserted };
}

const CUTOFF = '2026-09-02'; // generation day D (Wednesday)

const existingRows: Row[] = [
    // Before D — carries marks, must survive
    { id: 'e1', date: '2026-08-31', start_time: '09:00', end_time: '10:00', title: 'Gym', block_type: 'goal', goal_id: 'gym', status: 'done' },
    { id: 'e2', date: '2026-09-01', start_time: '09:00', end_time: '10:00', title: 'Study', block_type: 'goal', goal_id: 'study', status: 'missed' },
    // Before D — unmarked planner scratch, may be replaced
    { id: 'e3', date: '2026-09-01', start_time: '14:00', end_time: '15:00', title: 'Reading', block_type: 'goal', goal_id: 'read', status: 'planned' },
    // On/after D — a mark here must not survive into the new plan
    { id: 'e4', date: '2026-09-03', start_time: '09:00', end_time: '10:00', title: 'Gym', block_type: 'goal', goal_id: 'gym', status: 'done' },
];

async function run(add: any[]) {
    const { supabase, deleted, inserted } = mockSupabase(existingRows);
    const result = await writeWeek({
        userId: 'u1', supabase, action: 'plan_week',
        clearRange: { start: '2026-08-31', end: '2026-09-06' },
        markCutoffDate: CUTOFF,
        filterCommitmentOverlaps: false,
        enforceGoalDailyLimits: false,
        snapshot: false,
        add,
    });
    return { result, deleted, inserted };
}

describe('§4 completion marks on regeneration', () => {
    it('never deletes a marked block on a day before the generation day', async () => {
        const { deleted } = await run([]);
        expect(deleted).not.toContain('e1'); // done, 08-31
        expect(deleted).not.toContain('e2'); // missed, 09-01
    });

    it('still clears unmarked planner blocks on earlier days', async () => {
        const { deleted } = await run([]);
        expect(deleted).toContain('e3');
    });

    it('does not re-create a block that was preserved for its mark', async () => {
        // The planner re-proposes Gym at the same time on 08-31.
        const { inserted, result } = await run([
            { date: '2026-08-31', start_time: '09:00', end_time: '10:00', title: 'Gym', block_type: 'goal', goal_id: 'gym' },
        ]);
        expect(inserted.filter(r => r.date === '2026-08-31')).toHaveLength(0);
        expect(result.skipped.some(s => /marked "done"/.test(s.reason))).toBe(true);
    });

    it('creates a NEW earlier-day block unmarked when it does not collide with a preserved one', async () => {
        const { inserted } = await run([
            { date: '2026-08-31', start_time: '15:00', end_time: '16:00', title: 'Reading', block_type: 'goal', goal_id: 'read' },
        ]);
        const row = inserted.find(r => r.date === '2026-08-31');
        expect(row).toBeDefined();
        expect(row.status).toBe('planned');
    });

    it('writes everything from the generation day onward unmarked, even if it arrives marked', async () => {
        const { inserted } = await run([
            { date: CUTOFF, start_time: '09:00', end_time: '10:00', title: 'Gym', block_type: 'goal', goal_id: 'gym', status: 'done' },
            { date: '2026-09-04', start_time: '09:00', end_time: '10:00', title: 'Study', block_type: 'goal', goal_id: 'study', status: 'missed' },
        ]);
        for (const r of inserted.filter(r => r.date >= CUTOFF)) {
            expect(r.status).toBe('planned');
        }
    });

    it('CLEARS a block marked done on the generation day or later', async () => {
        // Prompt 48 §4: the done-sparing rule used to be unconditional, so a
        // block marked done on a FUTURE date survived every regeneration
        // forever — which is how Saturday and Sunday showed ✓ DONE days before
        // they happened. A completion mark on a future day is meaningless.
        const { deleted } = await run([]);
        expect(existingRows.find(r => r.id === 'e4')!.date >= CUTOFF).toBe(true);
        expect(deleted).toContain('e4');
    });

    it('regenerates that day unmarked', async () => {
        const { inserted } = await run([
            { date: '2026-09-03', start_time: '09:00', end_time: '10:00', title: 'Gym', block_type: 'goal', goal_id: 'gym' },
        ]);
        const row = inserted.find(r => r.date === '2026-09-03');
        expect(row).toBeDefined();
        expect(row.status).toBe('planned');
    });
});

describe('timeToMin', () => {
    it('parses HH:MM and HH:MM:SS', () => {
        expect(timeToMin('09:30')).toBe(570);
        expect(timeToMin('09:30:00')).toBe(570);
    });
});

describe('§1 the writer rejects overlapping and malformed rows', () => {
    it('rejects a candidate that overlaps another candidate', async () => {
        const { inserted, result } = await run([
            { date: '2026-09-04', start_time: '09:30', end_time: '11:30', title: 'Gym', block_type: 'goal', goal_id: 'gym' },
            { date: '2026-09-04', start_time: '09:30', end_time: '10:30', title: 'PlannrAI', block_type: 'goal', goal_id: 'pl' },
        ]);
        const onDay = inserted.filter(r => r.date === '2026-09-04');
        expect(onDay).toHaveLength(1);
        expect(onDay[0].title).toBe('Gym');
        expect(result.skipped.some(s => /overlaps "Gym"/.test(s.reason))).toBe(true);
    });

    it('rejects a candidate that overlaps a block surviving the clear step', async () => {
        // e1 is done on 08-31 09:00–10:00 and is preserved, so nothing may be
        // written across it.
        const { inserted, result } = await run([
            { date: '2026-08-31', start_time: '09:30', end_time: '10:30', title: 'PlannrAI', block_type: 'goal', goal_id: 'pl' },
        ]);
        expect(inserted.filter(r => r.date === '2026-08-31')).toHaveLength(0);
        expect(result.skipped.some(s => /overlaps "Gym"/.test(s.reason))).toBe(true);
    });

    it('allows blocks that merely touch', async () => {
        const { inserted } = await run([
            { date: '2026-09-04', start_time: '09:00', end_time: '10:00', title: 'A', block_type: 'goal', goal_id: 'a' },
            { date: '2026-09-04', start_time: '10:00', end_time: '11:00', title: 'B', block_type: 'goal', goal_id: 'b' },
        ]);
        expect(inserted.filter(r => r.date === '2026-09-04')).toHaveLength(2);
    });

    it('rejects a row whose end is not after its start', async () => {
        const { inserted, result } = await run([
            { date: '2026-09-04', start_time: '10:45', end_time: '10:45', title: 'Zero', block_type: 'goal', goal_id: 'z' },
        ]);
        expect(inserted.filter(r => r.date === '2026-09-04')).toHaveLength(0);
        expect(result.skipped.some(s => /malformed block/.test(s.reason))).toBe(true);
    });
});
