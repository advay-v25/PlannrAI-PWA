import * as fs from 'fs';
import * as path from 'path';
import {
    generateWeekPlan,
    allocateDayShares,
    resolvePreWindDownGapMins,
    MIN_BLOCK_MINS,
    BODY_WIND_DOWN_GAP_MINS,
    BODY_WIND_DOWN_GAP_RELAXED_MINS,
} from '../plan-week';

const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
};

function loadCtx() {
    return JSON.parse(
        fs.readFileSync(path.join(__dirname, 'fixture-context.json'), 'utf8')
    );
}

describe('§1a allocateDayShares — importance decides the surplus, never starves', () => {
    const goals = [
        { id: 'high', importance: 9, needMins: 600 },
        { id: 'medium', importance: 5, needMins: 600 },
        { id: 'low', importance: 2, needMins: 600 },
    ];

    it('is a no-op when the week has headroom', () => {
        const a = allocateDayShares(goals, 5000);
        expect(a.get('high')).toBe(600);
        expect(a.get('medium')).toBe(600);
        expect(a.get('low')).toBe(600);
    });

    it('gives the high-importance goal its full need before others get surplus', () => {
        // 800 total: 3 × 15 floors = 45, leaving 755 of surplus.
        const a = allocateDayShares(goals, 800);
        expect(a.get('high')).toBe(600);          // full need, first claim
        expect(a.get('medium')).toBe(185);        // 15 floor + 170 of what's left
        expect(a.get('low')).toBe(MIN_BLOCK_MINS); // floor only
        expect(a.get('high')! + a.get('medium')! + a.get('low')!).toBe(800);
    });

    it('never starves any goal to zero, however tight the week', () => {
        const a = allocateDayShares(goals, 50);
        for (const g of goals) {
            expect(a.get(g.id)).toBeGreaterThanOrEqual(MIN_BLOCK_MINS);
        }
    });

    it('the shortfall lands on the least important goal', () => {
        const a = allocateDayShares(goals, 800);
        const shortfall = (id: string, need: number) => need - a.get(id)!;
        expect(shortfall('high', 600)).toBeLessThan(shortfall('medium', 600));
        expect(shortfall('medium', 600)).toBeLessThan(shortfall('low', 600));
    });
});

describe('§2 resolvePreWindDownGapMins — body survives relaxation', () => {
    const base = { goalEnergy: 'high' as const, strategyId: 'balanced', preWindDownGapBonus: 0 };

    it('holds the full body gap on a normal pass', () => {
        const r = resolvePreWindDownGapMins({ ...base, pillar: 'body', isRelaxedBuffer: false, isFinalPass: false });
        expect(r.gapMins).toBe(BODY_WIND_DOWN_GAP_MINS);
        expect(r.bodyGapRelaxed).toBe(false);
    });

    it('does NOT collapse to zero when buffers relax — the old bug', () => {
        const r = resolvePreWindDownGapMins({ ...base, pillar: 'body', isRelaxedBuffer: true, isFinalPass: false });
        expect(r.gapMins).toBe(BODY_WIND_DOWN_GAP_MINS);
    });

    it('keeps a non-zero floor even on the final pass', () => {
        const r = resolvePreWindDownGapMins({ ...base, pillar: 'body', isRelaxedBuffer: true, isFinalPass: true });
        expect(r.gapMins).toBe(BODY_WIND_DOWN_GAP_RELAXED_MINS);
        expect(r.gapMins).toBeGreaterThan(0);
        expect(r.bodyGapRelaxed).toBe(true);
    });

    it('leaves non-body goals on the general gap', () => {
        const r = resolvePreWindDownGapMins({ ...base, pillar: 'mind', isRelaxedBuffer: false, isFinalPass: false });
        expect(r.gapMins).toBe(20);
        expect(r.bodyGapRelaxed).toBe(false);
    });
});

describe('§2 across a fully generated week', () => {
    it('no body block ends within the gap of wind-down, and never exactly at it', async () => {
        const ctx = loadCtx();
        const variants = await generateWeekPlan(ctx, '2026-08-31', 'balanced', false);

        const windDown = ctx.schedule?.wind_down_mins;
        for (const v of variants) {
            const bodyBlocks = v.blocks.filter((b: any) => b.pillar === 'body' && b.block_type === 'goal');
            for (const b of bodyBlocks) {
                // Derive that day's wind-down from the generated Wind Down block
                // rather than assuming, so a light-weekend cutoff is respected.
                const wd = v.blocks.find(
                    (x: any) => x.date === b.date && /wind down/i.test(x.title)
                );
                if (!wd) continue;
                const gap = toMins(wd.start_time) - toMins(b.end_time);
                // Item 8: never flush against wind-down, under any relaxation.
                expect(gap).toBeGreaterThan(0);
                // Item 6: and at least the relaxed floor everywhere.
                expect(gap).toBeGreaterThanOrEqual(BODY_WIND_DOWN_GAP_RELAXED_MINS);
            }
        }
    });

    it('body goals still place — the exclusion has not pushed them to zero', async () => {
        const ctx = loadCtx();
        const variants = await generateWeekPlan(ctx, '2026-08-31', 'balanced', false);
        // Only goals with work genuinely left this week. A body goal already at
        // its weekly target (Sports, in this fixture) correctly places nothing,
        // and asserting otherwise would test the fixture rather than the rule.
        const remainingOf = (id: string) =>
            ctx.goalProgress?.find((p: any) => p.goal_id === id)?.remaining_minutes ?? 0;
        const bodyGoals = ctx.goals.filter(
            (g: any) => g.pillar === 'body' && remainingOf(g.id) > 0
        );
        expect(bodyGoals.length).toBeGreaterThan(0); // the check must not be vacuous

        for (const v of variants) {
            for (const g of bodyGoals) {
                const placed = v.blocks
                    .filter((b: any) => b.goal_id === g.id)
                    .reduce((s: number, b: any) => s + (toMins(b.end_time) - toMins(b.start_time)), 0);
                if (placed <= 0) {
                    throw new Error(`${v.label}: body goal "${g.title}" placed nothing (${remainingOf(g.id)}min were outstanding)`);
                }
            }
        }
    });

    it('within a rigidity class, a more important goal is filled at least as well as a less important one', async () => {
        // §1c: rigidity is the outer ordering (a body goal has far fewer viable
        // windows, so it must pick first), and importance decides within it.
        // Comparing a body goal against a craft goal would therefore be testing
        // the wrong rule — the comparison is only meaningful within a class.
        const ctx = loadCtx();
        const variants = await generateWeekPlan(ctx, '2026-08-31', 'balanced', false);
        const remainingOf = (id: string) =>
            ctx.goalProgress?.find((p: any) => p.goal_id === id)?.remaining_minutes ?? 0;

        for (const v of variants) {
            const rows = ctx.goals
                .map((g: any) => {
                    const target = remainingOf(g.id);
                    const placed = v.blocks
                        .filter((b: any) => b.goal_id === g.id)
                        .reduce((s: number, b: any) => s + (toMins(b.end_time) - toMins(b.start_time)), 0);
                    return {
                        title: g.title, importance: g.importance ?? 5,
                        rigid: g.pillar === 'body', target, fill: target > 0 ? placed / target : 1,
                    };
                })
                .filter((r: any) => r.target > 0);

            for (const a of rows) {
                for (const b of rows) {
                    if (a.rigid !== b.rigid) continue;
                    if (a.importance <= b.importance) continue;
                    // a is strictly more important than b, same rigidity class.
                    if (a.fill < b.fill - 1e-9) {
                        throw new Error(
                            `${v.label}: "${a.title}" (importance ${a.importance}) filled ` +
                            `${(a.fill * 100).toFixed(0)}% while "${b.title}" (importance ${b.importance}) ` +
                            `filled ${(b.fill * 100).toFixed(0)}%`
                        );
                    }
                }
            }
        }
    });

    it('shortening never cuts a higher-importance goal while a lower one keeps full length that day', async () => {
        const ctx = loadCtx();
        const variants = await generateWeekPlan(ctx, '2026-08-31', 'balanced', false);
        const importanceOf = new Map<string, number>(
            ctx.goals.map((g: any) => [g.id, g.importance ?? 5])
        );

        for (const v of variants) {
            const byDate = new Map<string, any[]>();
            for (const b of v.blocks.filter((x: any) => x.block_type === 'goal')) {
                if (!byDate.has(b.date)) byDate.set(b.date, []);
                byDate.get(b.date)!.push(b);
            }
            for (const [date, dayBlocks] of byDate) {
                const shortened = dayBlocks.filter((b) => / \(Shortened\)$/.test(b.title));
                const fullLength = dayBlocks.filter((b) => !/ \(Shortened\)$/.test(b.title));
                for (const s of shortened) {
                    const sImp = importanceOf.get(s.goal_id) ?? 5;
                    for (const f of fullLength) {
                        const fImp = importanceOf.get(f.goal_id) ?? 5;
                        if (fImp < sImp) {
                            throw new Error(
                                `${v.label} ${date}: "${s.title}" (importance ${sImp}) was shortened while ` +
                                `"${f.title}" (importance ${fImp}) kept full length`
                            );
                        }
                    }
                }
            }
        }
    });
});
