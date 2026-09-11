import { resolveRelativeDate } from '../relative-dates';

describe('§4 resolveRelativeDate', () => {
    it('passes a real date through untouched', () => {
        expect(resolveRelativeDate('2026-09-07')).toEqual({ date: '2026-09-07', interpreted: false });
    });

    it('resolves the word that was 400ing', () => {
        const r = resolveRelativeDate('tomorrow')!;
        expect(r.interpreted).toBe(true);
        expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('is case- and whitespace-insensitive', () => {
        expect(resolveRelativeDate('  Tomorrow ')!.date).toBe(resolveRelativeDate('tomorrow')!.date);
    });

    it('resolves today, next week and weekday names', () => {
        for (const word of ['today', 'next week', 'this week', 'friday', 'next monday']) {
            const r = resolveRelativeDate(word);
            expect(r).not.toBeNull();
            expect(r!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('next week is exactly 7 days after this week', () => {
        const a = new Date(resolveRelativeDate('this week')!.date).getTime();
        const b = new Date(resolveRelativeDate('next week')!.date).getTime();
        expect((b - a) / 86400000).toBe(7);
    });

    it('returns null for anything genuinely unparseable, so the 400 stays', () => {
        for (const junk of ['', 'soon', 'the week after the one after next', '2026-13-45', 'xyz']) {
            expect(resolveRelativeDate(junk)).toBeNull();
        }
    });
});
