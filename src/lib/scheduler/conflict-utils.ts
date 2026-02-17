
import { areIntervalsOverlapping, parseISO } from 'date-fns';

export function getConflicts(newBlock: any, existingBlocks: any[]) {
    // Basic overlap check
    // Ensure dates match first if strictly intra-day
    const dayBlocks = existingBlocks.filter(b => b.date === newBlock.date);

    return dayBlocks.filter(existing => {
        // Skip self
        if (existing.id === newBlock.id) return false;

        // Parse times. Assuming HH:MM format strings for start/end
        // We need a reference date to use date-fns interval check easily, or just compare minutes

        const startA = parseTime(newBlock.start_time);
        const endA = parseTime(newBlock.end_time);
        const startB = parseTime(existing.start_time);
        const endB = parseTime(existing.end_time);

        return startA < endB && startB < endA;
    });
}

function parseTime(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}
