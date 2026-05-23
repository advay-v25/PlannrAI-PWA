import { ScheduleBlock } from '@/types/database';
import { addMinutes, parseISO, areIntervalsOverlapping, format, isBefore, isAfter, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

export type ResolutionOption = {
    id: string;
    label: string;
    description: string;
    patch: {
        reason: string;
        changes: any[];
    };
    tradeoff?: string;
    score: number;
};

export type ConflictVerdict =
    | { status: 'allowed' }
    | { status: 'requires_choice', reason: string, options: ResolutionOption[] };

export class ConflictService {

    static solve(currentSchedule: ScheduleBlock[], proposal: { id?: string, start: Date, end: Date, title?: string, priority?: number, is_fixed?: boolean }): ConflictVerdict {
        // 1. Filter out self
        const others = currentSchedule.filter(b => b.id !== proposal.id);

        // 2. Check Overlaps
        const collisions = others.filter(b => {
            const bStart = parseISO(`${b.date}T${b.start_time}`);
            const bEnd = parseISO(`${b.date}T${b.end_time}`);
            return areIntervalsOverlapping(
                { start: proposal.start, end: proposal.end },
                { start: bStart, end: bEnd }
            );
        });

        if (collisions.length === 0) {
            return { status: 'allowed' };
        }

        // 3. Priority-Based Auto-Resolution - Removed to prevent silent double-bookings.
        // All conflicts must be explicitly resolved through choice options or cascading.

        const options: ResolutionOption[] = [];

        // Strategy 1: Minimal Move (Find next gap)
        const nextGap = this.findNextGap(proposal, others);
        if (nextGap) {
            options.push({
                id: 'minimal-move',
                label: `Shift to ${format(nextGap.start, 'HH:mm')}`,
                description: 'Move this block to the next available opening.',
                patch: {
                    reason: 'Minimal move to nearest gap',
                    changes: [{
                        op: 'create_event',
                        payload: {
                            date: format(nextGap.start, 'yyyy-MM-dd'),
                            start_time: format(nextGap.start, 'HH:mm'),
                            end_time: format(nextGap.end, 'HH:mm'),
                            title: proposal.title || 'New Event',
                            block_type: 'adhoc'
                        }
                    }]
                },
                score: 80
            });
        }

        // Strategy 2: Shift Chain (Only if no collisions are fixed)
        const hasFixed = collisions.some(c => c.is_fixed || c.commitment_id);
        if (!hasFixed) {
            const shiftPatch = this.calculateShiftChain(proposal, collisions);
            if (shiftPatch) {
                options.push({
                    id: 'shift-chain',
                    label: 'Chain Shift',
                    description: 'Push flexible blocks forward to make room.',
                    patch: {
                        reason: 'Push flexible blocks forward',
                        changes: shiftPatch
                    },
                    score: 70
                });
            }
        }

        // Strategy 3: Drop Lowest (Only if no collisions are fixed)
        if (!hasFixed) {
            const lowest = [...collisions].sort((a, b) => (a.priority || 0) - (b.priority || 0))[0];
            options.push({
                id: 'drop-lowest',
                label: `Drop "${lowest.title}"`,
                description: `Replace the lowest priority flexible task.`,
                patch: {
                    reason: `Priority conflict resolution: dropping ${lowest.title}`,
                    changes: [
                        { op: 'delete_event', event_id: lowest.id },
                        {
                            op: 'create_event',
                            payload: {
                                date: format(proposal.start, 'yyyy-MM-dd'),
                                start_time: format(proposal.start, 'HH:mm'),
                                end_time: format(proposal.end, 'HH:mm'),
                                title: proposal.title || 'New Event',
                                block_type: 'adhoc'
                            }
                        }
                    ]
                },
                tradeoff: `You'll lose the slot for ${lowest.title}`,
                score: 50
            });
        }

        return {
            status: 'requires_choice',
            reason: `Overlaps with ${collisions.map(c => c.title).join(', ')}`,
            options
        };
    }

    public static findNextGap(proposal: { start: Date, end: Date }, schedule: ScheduleBlock[]) {
        const duration = differenceInMinutes(proposal.end, proposal.start);
        const dayStart = startOfDay(proposal.start);
        const dayEnd = endOfDay(proposal.start);

        const blocks = schedule
            .filter(b => b.date === format(proposal.start, 'yyyy-MM-dd'))
            .map(b => ({
                start: parseISO(`${b.date}T${b.start_time}`),
                end: parseISO(`${b.date}T${b.end_time}`)
            }))
            .sort((a, b) => a.start.getTime() - b.start.getTime());

        let checkStart = proposal.start;

        for (const b of blocks) {
            if (isBefore(b.start, checkStart)) {
                checkStart = isAfter(b.end, checkStart) ? b.end : checkStart;
                continue;
            }

            const gap = differenceInMinutes(b.start, checkStart);
            if (gap >= duration) {
                return { start: checkStart, end: addMinutes(checkStart, duration) };
            }
            checkStart = b.end;
        }

        if (differenceInMinutes(dayEnd, checkStart) >= duration) {
            return { start: checkStart, end: addMinutes(checkStart, duration) };
        }

        return null;
    }

    private static calculateShiftChain(proposal: { start: Date, end: Date, title?: string }, collisions: ScheduleBlock[]) {
        const duration = differenceInMinutes(proposal.end, proposal.start);
        const shiftAmount = duration; // Naive shift: push everything by the duration of the new block

        const changes: any[] = [{
            op: 'create_event',
            payload: {
                date: format(proposal.start, 'yyyy-MM-dd'),
                start_time: format(proposal.start, 'HH:mm'),
                end_time: format(proposal.end, 'HH:mm'),
                title: proposal.title || 'New Event',
                block_type: 'adhoc'
            }
        }];

        for (const c of collisions) {
            const cStart = parseISO(`${c.date}T${c.start_time}`);
            const cEnd = parseISO(`${c.date}T${c.end_time}`);
            const newStart = addMinutes(cStart, shiftAmount);
            const newEnd = addMinutes(cEnd, shiftAmount);

            if (isAfter(newEnd, endOfDay(cStart))) return null; // Cannot shift past midnight

            changes.push({
                op: 'update_event',
                event_id: c.id,
                payload: {
                    start_time: format(newStart, 'HH:mm'),
                    end_time: format(newEnd, 'HH:mm')
                }
            });
        }

        return changes;
    }
}
