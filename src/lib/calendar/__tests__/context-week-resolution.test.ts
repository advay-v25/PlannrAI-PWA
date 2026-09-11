import { buildCalendarContext } from '../context-builder';

/**
 * The week-resolution half of Plan Week — the part the golden snapshot never
 * touched, because that test calls `generateWeekPlan` with a fixture and skips
 * the context builder entirely.
 *
 * Everything here is about which week gets planned and which gets refused. The
 * current week is the most common call there is and had no coverage at all.
 */

/**
 * A Supabase query builder that answers every chain with empty data. Enough to
 * get through `buildCalendarContext`'s parallel fetch without a network call —
 * we are asserting on week arithmetic, not on rows.
 */
function stubDb() {
    const make = (): any => {
        const chain: any = {
            then: (resolve: any) => resolve({ data: [], error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
        };
        for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'or', 'order', 'limit', 'in', 'not']) {
            chain[m] = () => chain;
        }
        return chain;
    };
    return { from: () => make() };
}

const USER = '00000000-0000-4000-8000-000000000001';

describe('buildCalendarContext week resolution', () => {
    // Tuesday 1 Sep 2026, inside the week beginning Monday 31 Aug 2026.
    const MONDAY_THIS_WEEK = '2026-08-31';

    beforeAll(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-01T09:00:00+05:30'));
    });
    afterAll(() => {
        jest.useRealTimers();
    });

    it('accepts the current week', async () => {
        const ctx = await buildCalendarContext(USER, stubDb(), MONDAY_THIS_WEEK);
        expect(ctx.schedule.target_week).toEqual([]);
        expect(ctx.capacity).toBeDefined();
    });

    it('accepts a future week', async () => {
        const ctx = await buildCalendarContext(USER, stubDb(), '2026-09-07');
        expect(ctx.capacity).toBeDefined();
    });

    it('defaults to the current week when no target is given', async () => {
        const ctx = await buildCalendarContext(USER, stubDb());
        expect(ctx.capacity).toBeDefined();
    });

    it('refuses a genuinely past week, naming both weeks', async () => {
        await expect(buildCalendarContext(USER, stubDb(), '2026-08-24')).rejects.toThrow(
            /Planning a past week is refused: 2026-08-24 is before current week 2026-08-31/
        );
    });

    it('rejects a malformed week start by name, not as "Invalid time value"', async () => {
        await expect(buildCalendarContext(USER, stubDb(), 'not-a-date')).rejects.toThrow(
            /Invalid targetWeekStart "not-a-date"/
        );
    });

    it('surfaces a failing profile query instead of silently using defaults', async () => {
        const db = {
            from: (table: string) => {
                const chain: any = {
                    then: (resolve: any) => resolve({ data: [], error: null }),
                    maybeSingle: async () =>
                        table === 'profiles'
                            ? { data: null, error: { message: 'column profiles.first_name does not exist' } }
                            : { data: null, error: null },
                    single: async () => ({ data: null, error: null }),
                };
                for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'or', 'order', 'limit', 'in', 'not']) {
                    chain[m] = () => chain;
                }
                return chain;
            },
        };
        await expect(buildCalendarContext(USER, db, MONDAY_THIS_WEEK)).rejects.toThrow(
            /Profile query failed: column profiles\.first_name does not exist/
        );
    });
});
