import { startOfDay, endOfDay, parseISO, areIntervalsOverlapping, format } from 'date-fns';
import { ScheduleItem, resolveOverlaps } from './solver';
import { isImmutable } from '@/lib/validation/calendar-contract';

export type ResolutionStatus = 'resolved' | 'requires_choice' | 'rejected' | 'no_conflict';

export interface ConflictResolution {
    status: ResolutionStatus;
    reason?: string;
    resolved_patch?: any; // A patch that fixes it
    options?: any[]; // Choices for the user
    conflicting_items?: string[];
}

export class ConflictService {
    /**
     * Judge a proposed move/insert.
     * Returns a definitive ruling.
     */
    static judgeChange(
        currentSchedule: any[],
        proposedItem: { start: Date; end: Date; id?: string; type?: 'fixed' | 'flexible' },
        constraints: { workStart: number; workEnd: number } = { workStart: 8, workEnd: 22 }
    ): ConflictResolution {
        // 1. Identify Conflicts
        const validSchedule = currentSchedule.filter(s => s !== null && s !== undefined);
        const conflicts = validSchedule.filter(existing => {
            if (existing.id === proposedItem.id) return false; // Ignore self
            const existingStart = parseISO(existing.start_time ? `${format(proposedItem.start, 'yyyy-MM-dd')}T${existing.start_time}` : existing.start_ts); // Handle different formats
            const existingEnd = parseISO(existing.end_time ? `${format(proposedItem.start, 'yyyy-MM-dd')}T${existing.end_time}` : existing.end_ts);

            return areIntervalsOverlapping(
                { start: proposedItem.start, end: proposedItem.end },
                { start: existingStart, end: existingEnd }
            );
        });

        if (conflicts.length === 0) {
            return { status: 'no_conflict' };
        }

        // 2. Analyze Conflicts (The Judge)
        const hitImmutable = conflicts.some(c => isImmutable(c));

        if (hitImmutable) {
            // Immediate Rejection
            return {
                status: 'rejected',
                reason: "Cannot overlap with an Anchor (Sleep/Meal/Locked).",
                conflicting_items: conflicts.map(c => c.id?.toString())
            };
        }

        // 3. Attempt Auto-Resolution (Push flexible blocks)
        // We simulate the day with the new item forced in
        const solverItems: ScheduleItem[] = currentSchedule.map(s => ({
            id: s.id,
            start: parseISO(s.start_time ? `${format(proposedItem.start, 'yyyy-MM-dd')}T${s.start_time}` : s.start_ts),
            end: parseISO(s.end_time ? `${format(proposedItem.start, 'yyyy-MM-dd')}T${s.end_time}` : s.end_ts),
            type: (isImmutable(s) ? 'fixed' : 'flexible') as 'fixed' | 'flexible'
        })).filter(s => s.id !== proposedItem.id);

        // Add our proposed item as 'fixed' temporarily to see if we can flow around it
        solverItems.push({
            id: 'PROPOSAL',
            start: proposedItem.start,
            end: proposedItem.end,
            type: 'fixed' // We want to force this position
        });

        const result = resolveOverlaps(solverItems, proposedItem.start, {
            workStartHour: constraints.workStart,
            workEndHour: constraints.workEnd
        });

        if (result.conflicts.length > 0) {
            // Even logic couldn't fix it (e.g. squeezed between two anchors)
            return {
                status: 'requires_choice',
                reason: "Not enough space to auto-fit.",
                options: [
                    { label: "Cancel", action: "cancel" },
                    { label: "Force (Overlap)", action: "force" }, // Or maybe sacrifice logic
                ]
            };
        }

        // 4. Success - Auto-Resolve Possible
        // We need to generate a patch for the *moved* items
        const movedIds = result.moved;
        const moves = result.resolved
            .filter(r => movedIds.includes(r.id) && r.id !== 'PROPOSAL')
            .map(r => ({
                op: 'MOVE',
                event_id: r.id,
                new_start_ts: r.start.toISOString(),
                new_end_ts: r.end.toISOString()
            }));

        return {
            status: 'resolved',
            resolved_patch: {
                summary: `Auto-adjusted ${moves.length} blocks to fit.`,
                affected_date: format(proposedItem.start, 'yyyy-MM-dd'),
                changes: moves,
                requires_confirmation: false // It's auto-resolved!
            }
        };
    }
}
