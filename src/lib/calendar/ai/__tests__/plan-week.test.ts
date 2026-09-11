import { generateWeekPlan, findBlockDefects } from '../plan-week';
import * as fs from 'fs';
import * as path from 'path';

const loadFixture = () =>
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-context.json'), 'utf8'));

describe('Plan Week (Golden Regression)', () => {
    it('should deterministically generate the same schedule for a fixed context', async () => {
        const ctx = loadFixture();

        // 'false' for withAi implies standard deterministic generation.
        const variants = await generateWeekPlan(ctx, '2026-08-31', 'balanced', false);
        const standardVariant = variants[0];

        expect(standardVariant.label).toBe('Standard Balanced');
        expect(standardVariant.blocks.length).toBeGreaterThan(0);

        // Output snapshot testing ensures any change to placement logic breaks the build.
        expect(standardVariant.blocks).toMatchSnapshot();
    });

    // §3: this class of bug must never reach the calendar again. Overlapping
    // blocks and blocks with no usable end_time were not caused by a subtle
    // bug so much as permitted by the absence of any check.
    it('emits no overlapping blocks and no malformed end times, in any variant', async () => {
        const ctx = loadFixture();
        for (const mode of ['balanced', 'momentum', 'recovery'] as const) {
            for (const allowWeekend of [false, true]) {
                const variants = await generateWeekPlan(ctx, '2026-08-31', mode, allowWeekend);
                expect(variants.length).toBeGreaterThan(0);
                for (const v of variants) {
                    const defects = findBlockDefects(v.blocks as any);
                    if (defects.length > 0) {
                        throw new Error(
                            `${mode}/allowWeekend=${allowWeekend} variant "${v.label}": ${defects.join(' | ')}`
                        );
                    }
                }
            }
        }
    });

    // §2b: the gate. On any day whose free minutes are at least the minutes
    // planned that day, nothing may be shortened or split. This turns "the
    // planner trimmed something for no reason" from a judgement call into an
    // assertion that either holds or fails.
    it('shortens or splits nothing on a day whose gate is closed', async () => {
        const ctx = loadFixture();
        const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

        for (const mode of ['balanced', 'momentum', 'recovery'] as const) {
            const variants = await generateWeekPlan(ctx, '2026-08-31', mode, false);
            for (const v of variants) {
                const dates = [...new Set(v.blocks.map((b: any) => b.date))];
                for (const date of dates) {
                    const day = v.blocks.filter((b: any) => b.date === date);
                    const windDown = day.find((b: any) => b.block_type === 'wind_down');
                    const wake = toMins(ctx.user.sleep_end || '07:00');
                    const upper = windDown ? toMins(windDown.start_time) : 1380;

                    // Free = the span minus everything occupying it.
                    const occupied = day
                        .map((b: any) => ({ s: Math.max(toMins(b.start_time), wake), e: Math.min(toMins(b.end_time), upper) }))
                        .filter((x: any) => x.e > x.s)
                        .sort((a: any, b: any) => a.s - b.s);
                    let merged = 0, cursor = wake;
                    for (const o of occupied) {
                        if (o.e > cursor) { merged += o.e - Math.max(cursor, o.s); cursor = Math.max(cursor, o.e); }
                    }
                    const planned = day
                        .filter((b: any) => b.block_type === 'goal')
                        .reduce((s: number, b: any) => s + (toMins(b.end_time) - toMins(b.start_time)), 0);
                    const free = Math.max(0, (upper - wake) - merged) + planned;

                    if (free >= planned) {
                        const trimmed = day.filter((b: any) => /\((Part|Shortened)\)$/.test(b.title));
                        if (trimmed.length > 0) {
                            throw new Error(
                                `${mode}/"${v.label}" ${date}: gate CLOSED (free=${free}min planned=${planned}min) ` +
                                `but found ${trimmed.map((b: any) => `"${b.title}"`).join(', ')}`
                            );
                        }
                    }
                }
            }
        }
    });

    // §1: minutes_per_day is the session length, so a goal should not be split
    // across a day unless nothing on that day could hold it whole.
    it('does not label a block (Part) unless the goal really has more than one block that day', async () => {
        const ctx = loadFixture();
        const variants = await generateWeekPlan(ctx, '2026-08-31', 'balanced', false);
        for (const v of variants) {
            const counts = new Map<string, number>();
            for (const b of v.blocks.filter((x: any) => x.block_type === 'goal')) {
                const key = `${b.date}|${b.goal_id}`;
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            for (const b of v.blocks.filter((x: any) => x.block_type === 'goal')) {
                const key = `${b.date}|${b.goal_id}`;
                if (/\(Part\)$/.test(b.title) && counts.get(key)! < 2) {
                    throw new Error(`${v.label}: "${b.title}" on ${b.date} is the only block for that goal that day`);
                }
            }
        }
    });
});
