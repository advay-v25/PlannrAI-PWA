/**
 * Prompt 54 §1 / verification item 2: the review window resolves in the
 * USER's timezone, never UTC. Both boundary cases from the prompt, plus the
 * week arithmetic every gate depends on.
 */
import {
    isReviewWindowOpen,
    logReviewWindow,
    nextReviewOpenDate,
    resolveReviewWindow,
    reviewDueDate,
    userLastMonday,
    userThisMonday,
} from '../window';

describe('review window (Prompt 54 §1)', () => {
    // Monday 14 Sep 2026 04:00 IST == Sunday 13 Sep 2026 22:30 UTC
    const kolkataMondayMorning = new Date('2026-09-13T22:30:00Z');
    // Sunday 13 Sep 2026 17:00 PDT == Monday 14 Sep 2026 00:00 UTC
    const laSundayEvening = new Date('2026-09-14T00:00:00Z');

    it('is OPEN at Monday 04:00 in Asia/Kolkata even though UTC is still Sunday', () => {
        expect(kolkataMondayMorning.getUTCDay()).toBe(0); // the bug the old helpers had
        expect(isReviewWindowOpen(kolkataMondayMorning, 'Asia/Kolkata')).toBe(true);
        const w = resolveReviewWindow(kolkataMondayMorning, 'Asia/Kolkata');
        logReviewWindow('test:kolkata', w);
        expect(w).toMatchObject({
            timezone: 'Asia/Kolkata',
            today: '2026-09-14',
            weekday_name: 'Monday',
            is_open: true,
            this_monday: '2026-09-14',
            last_monday: '2026-09-07',
            next_open_date: '2026-09-14',
        });
    });

    it('is CLOSED at Sunday 17:00 in America/Los_Angeles even though UTC is already Monday', () => {
        expect(laSundayEvening.getUTCDay()).toBe(1);
        expect(isReviewWindowOpen(laSundayEvening, 'America/Los_Angeles')).toBe(false);
        const w = resolveReviewWindow(laSundayEvening, 'America/Los_Angeles');
        logReviewWindow('test:la', w);
        expect(w).toMatchObject({
            today: '2026-09-13',
            weekday_name: 'Sunday',
            is_open: false,
            this_monday: '2026-09-07',
            last_monday: '2026-08-31',
            next_open_date: '2026-09-14',
        });
    });

    it('falls back to the app default timezone when none is stored', () => {
        expect(resolveReviewWindow(kolkataMondayMorning, null).timezone).toBe('Asia/Kolkata');
        expect(resolveReviewWindow(kolkataMondayMorning, undefined).is_open).toBe(true);
    });

    it('names the exact next Monday on every other day (§3)', () => {
        // Wed 9 Sep 2026 12:00 IST
        const wed = new Date('2026-09-09T06:30:00Z');
        expect(nextReviewOpenDate(wed, 'Asia/Kolkata')).toBe('2026-09-14');
        // Sat 12 Sep
        expect(nextReviewOpenDate(new Date('2026-09-12T06:30:00Z'), 'Asia/Kolkata')).toBe('2026-09-14');
        // Sun 13 Sep
        expect(nextReviewOpenDate(new Date('2026-09-13T06:30:00Z'), 'Asia/Kolkata')).toBe('2026-09-14');
        // Tue 15 Sep → the following Monday
        expect(nextReviewOpenDate(new Date('2026-09-15T06:30:00Z'), 'Asia/Kolkata')).toBe('2026-09-21');
    });

    it('computes this/last Monday from the local date', () => {
        const wed = new Date('2026-09-09T06:30:00Z');
        expect(userThisMonday(wed, 'Asia/Kolkata')).toBe('2026-09-07');
        expect(userLastMonday(wed, 'Asia/Kolkata')).toBe('2026-08-31');
    });

    it("a week's review is due the Monday after it (§3a, §4b)", () => {
        expect(reviewDueDate('2026-09-07')).toBe('2026-09-14');
        expect(reviewDueDate('2026-08-31')).toBe('2026-09-07');
        // A mid-week date snaps to its Monday first.
        expect(reviewDueDate('2026-09-09')).toBe('2026-09-14');
    });
});
