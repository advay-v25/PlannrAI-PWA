import { computeRescheduleOptions } from '../response-generator';

/**
 * §3: the screenshot's scenario — 01:20 on Wednesday 2026-09-02, rescheduling a
 * 30-minute Studying block, with Decision Making 11:45–13:25 anchored that day.
 */

const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

const anchorsAndBio = [
    // Wednesday 02/09 — the day the missed block is on
    { id: 'a1', date: '2026-09-02', start_time: '00:00', end_time: '07:00', title: 'Sleep', block_type: 'sleep', status: 'planned' },
    { id: 'a2', date: '2026-09-02', start_time: '07:00', end_time: '07:45', title: 'Morning Routine', block_type: 'routine', status: 'planned' },
    { id: 'a3', date: '2026-09-02', start_time: '08:00', end_time: '08:30', title: 'Breakfast', block_type: 'meal', status: 'planned' },
    { id: 'a4', date: '2026-09-02', start_time: '11:45', end_time: '13:25', title: 'Decision Making', block_type: 'anchor', status: 'planned' },
    { id: 'a5', date: '2026-09-02', start_time: '13:55', end_time: '14:40', title: 'Lunch', block_type: 'meal', status: 'planned' },
    { id: 'a6', date: '2026-09-02', start_time: '19:30', end_time: '20:15', title: 'Dinner', block_type: 'meal', status: 'planned' },
    // Thursday 03/09 — mostly free, one anchor
    { id: 'b1', date: '2026-09-03', start_time: '00:00', end_time: '07:00', title: 'Sleep', block_type: 'sleep', status: 'planned' },
    { id: 'b2', date: '2026-09-03', start_time: '11:45', end_time: '13:25', title: 'Business Stats', block_type: 'anchor', status: 'planned' },
    // Friday 04/09 — packed with anchors, so it should NOT win Option 2
    { id: 'c1', date: '2026-09-04', start_time: '00:00', end_time: '07:00', title: 'Sleep', block_type: 'sleep', status: 'planned' },
    { id: 'c2', date: '2026-09-04', start_time: '08:00', end_time: '09:40', title: 'Financial Management', block_type: 'anchor', status: 'planned' },
    { id: 'c3', date: '2026-09-04', start_time: '11:45', end_time: '13:25', title: 'Decision Making', block_type: 'anchor', status: 'planned' },
    { id: 'c4', date: '2026-09-04', start_time: '13:25', end_time: '15:15', title: 'Supply Chain', block_type: 'anchor', status: 'planned' },
];

const missedBlock = {
    id: 'm1', date: '2026-09-02', start_time: '01:00', end_time: '01:30',
    title: 'Studying', block_type: 'goal', goal_id: 'study', status: 'missed',
};

function ctx(overrides: any = {}): any {
    const { current: currentOverride, ...rest } = overrides;
    return {
        user: { sleep_end: '07:00', sleep_start: '23:00' },
        schedule: { this_week: anchorsAndBio, today: [], tomorrow: [] },
        goals: [],
        ...rest,
        current: {
            date: '2026-09-02',
            calendar_date: '2026-09-02',
            time: '01:20',
            day_of_week: 'Wednesday',
            in_active_wake_cycle: true,
            ...currentOverride,
        },
    };
}

describe('§3 reschedule options', () => {
    it('Option 1 is on the missed block\'s own day and never overlaps an anchor', () => {
        const { opt1 } = computeRescheduleOptions(missedBlock, 30, ctx());
        expect(opt1).not.toBeNull();
        expect(opt1!.date).toBe('2026-09-02');

        const anchors = anchorsAndBio.filter(b => b.date === opt1!.date);
        for (const a of anchors) {
            const clash = toM(opt1!.start!) < toM(a.end_time) && toM(opt1!.end!) > toM(a.start_time);
            if (clash) throw new Error(`Option 1 ${opt1!.start}–${opt1!.end} overlaps "${a.title}" ${a.start_time}–${a.end_time}`);
        }
    });

    it('Option 1 is the LARGEST free slot that day, not the first opening', () => {
        const { opt1 } = computeRescheduleOptions(missedBlock, 30, ctx());
        // The day's gaps after 01:20: 08:30–11:45 (195m), 13:25–13:55 (30m),
        // 14:40–19:30 (290m), 20:15–23:00 (165m). Largest is 14:40.
        expect(opt1!.start).toBe('14:40');
        // and exactly the block's original duration
        expect(toM(opt1!.end!) - toM(opt1!.start!)).toBe(30);
    });

    it('Option 2 is on a different, LATER day and is that week\'s largest slot', () => {
        const { opt1, opt2 } = computeRescheduleOptions(missedBlock, 30, ctx());
        expect(opt2).not.toBeNull();
        expect(opt2!.date).not.toBe(opt1!.date);
        expect(opt2!.date! > missedBlock.date).toBe(true);
        expect(toM(opt2!.end!) - toM(opt2!.start!)).toBe(30);

        // It must be the day holding the genuinely largest gap, not the
        // earliest day with any gap at all (which is what it used to pick).
        const largestGapOn = (date: string) => {
            const day = anchorsAndBio.filter(b => b.date === date)
                .sort((a, b) => toM(a.start_time) - toM(b.start_time));
            let cursor = toM('07:00'), best = 0;
            for (const b of day) {
                if (toM(b.start_time) > cursor) best = Math.max(best, toM(b.start_time) - cursor);
                cursor = Math.max(cursor, toM(b.end_time));
            }
            return Math.max(best, toM('23:00') - cursor);
        };
        const laterDays = ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'];
        const bestDay = laterDays.reduce((a, b) => (largestGapOn(b) > largestGapOn(a) ? b : a));
        expect(opt2!.date).toBe(bestDay);

        const anchors = anchorsAndBio.filter(b => b.date === opt2!.date);
        for (const a of anchors) {
            const clash = toM(opt2!.start!) < toM(a.end_time) && toM(opt2!.end!) > toM(a.start_time);
            if (clash) throw new Error(`Option 2 overlaps "${a.title}"`);
        }
    });

    it('Option 1 only offers slots after the current time', () => {
        const { opt1 } = computeRescheduleOptions(missedBlock, 30, ctx({ current: { time: '15:00' } }));
        expect(toM(opt1!.start!)).toBeGreaterThanOrEqual(toM('15:00'));
    });

    it('anchors are genuinely in the occupancy set — 11:45 is never offered', () => {
        // Force the search past everything but the anchor window.
        const { opt1 } = computeRescheduleOptions(missedBlock, 30, ctx({ current: { time: '11:00' } }));
        expect(opt1!.start).not.toBe('11:45');
        const a = anchorsAndBio.find(b => b.id === 'a4')!;
        const clash = toM(opt1!.start!) < toM(a.end_time) && toM(opt1!.end!) > toM(a.start_time);
        expect(clash).toBe(false);
    });

    it('uses the missed block\'s day even when the logical date lags behind the wall clock', () => {
        // The 01:20 case: current.date is still Tuesday (logical), but the
        // missed block is on Wednesday. Option 1 must follow the block.
        const { opt1 } = computeRescheduleOptions(missedBlock, 30, ctx({
            current: { date: '2026-09-01', calendar_date: '2026-09-02', day_of_week: 'Tuesday', time: '01:20' },
        }));
        expect(opt1!.date).toBe('2026-09-02');
    });
});

test('REPORT: all three options for the screenshot scenario', () => {
    const { opt1, opt2, opt3 } = computeRescheduleOptions(missedBlock, 30, ctx());
    const show = (n: string, o: any) => console.log(
        `  ${n}: ${o ? `${o.date} ${o.start}–${o.end}${o.replacedBlock ? ` (replaces "${o.replacedBlock.title}")` : ''}${o.shrunk ? ' [shrunk]' : ''}` : '(none)'}`
    );
    console.log('\n=== Reschedule options: 30min Studying, 01:20 Wed 2026-09-02 ===');
    show('Option 1 (same day, largest slot)', opt1);
    show('Option 2 (later day, largest slot)', opt2);
    show('Option 3 (replace lower priority)', opt3);
});
