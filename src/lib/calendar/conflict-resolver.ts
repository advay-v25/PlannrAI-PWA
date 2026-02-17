
import { ScheduleBlockRow } from './week-orchestrator';

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
    tags?: string[];
};

export class ConflictResolver {
    /**
     * Resolves conflicts when adding/moving a block.
     */
    static resolve(
        proposed: Omit<ScheduleBlockRow, "id">,
        existing: ScheduleBlockRow[],
    ): ResolutionOption[] {
        const conflicts = this.findConflicts(proposed, existing);

        if (conflicts.length === 0) {
            return [{
                id: 'no-conflict',
                label: 'Place as is',
                description: 'No conflicts detected.',
                patch: {
                    reason: 'No conflict',
                    changes: [{ op: 'create_event', payload: proposed }]
                },
                score: 100
            }];
        }

        const options: ResolutionOption[] = [];

        // Strategy 1: Minimal Move (Find nearest gap)
        const nextGap = this.findNextGap(proposed, existing);
        if (nextGap) {
            options.push({
                id: 'minimal-move',
                label: `Shift to ${nextGap.start_time}`,
                description: `Move block to the nearest available opening.`,
                patch: {
                    reason: 'Minimal move to nearest gap',
                    changes: [{
                        op: 'create_event',
                        payload: { ...proposed, start_time: nextGap.start_time, end_time: nextGap.end_time }
                    }]
                },
                score: 80
            });
        }

        // Strategy 2: Shift Chain (Move flexible blocks forward)
        const shiftChain = this.tryShiftChain(proposed, existing);
        if (shiftChain) {
            options.push({
                id: 'shift-chain',
                label: 'Chain Shift',
                description: 'Move conflicting blocks forward to make space.',
                patch: shiftChain,
                score: 70
            });
        }

        // Strategy 3: Drop Lowest (Identify lowest priority block to remove)
        const dropOption = this.tryDropLowest(proposed, existing);
        if (dropOption) {
            options.push(dropOption);
        }

        return options;
    }

    private static findConflicts(newBlock: Omit<ScheduleBlockRow, "id">, existing: ScheduleBlockRow[]) {
        const start = this.toMin(newBlock.start_time);
        const end = this.toMin(newBlock.end_time);

        return existing.filter(b => {
            if (b.date !== newBlock.date) return false;
            const bStart = this.toMin(b.start_time);
            const bEnd = this.toMin(b.end_time);
            return Math.max(start, bStart) < Math.min(end, bEnd);
        });
    }

    private static findNextGap(proposed: Omit<ScheduleBlockRow, "id">, existing: ScheduleBlockRow[]) {
        const duration = this.toMin(proposed.end_time) - this.toMin(proposed.start_time);
        const sameDay = existing
            .filter(b => b.date === proposed.date)
            .sort((a, b) => this.toMin(a.start_time) - this.toMin(b.start_time));

        let checkStart = this.toMin(proposed.start_time);

        // Search forward up to end of day
        for (let i = 0; i < sameDay.length; i++) {
            const block = sameDay[i];
            const blockStart = this.toMin(block.start_time);
            const blockEnd = this.toMin(block.end_time);

            if (blockStart >= checkStart + duration) {
                // Found a gap before this block
                return {
                    start_time: this.fromMin(checkStart),
                    end_time: this.fromMin(checkStart + duration)
                };
            }
            checkStart = Math.max(checkStart, blockEnd);
        }

        // Check after last block
        if (checkStart + duration <= 1439) {
            return {
                start_time: this.fromMin(checkStart),
                end_time: this.fromMin(checkStart + duration)
            };
        }

        return null;
    }

    private static tryShiftChain(proposed: Omit<ScheduleBlockRow, "id">, existing: ScheduleBlockRow[]) {
        const conflicts = this.findConflicts(proposed, existing);
        if (conflicts.some(c => c.is_fixed)) return null; // Cannot shift fixed blocks

        // Simple chain: push all conflicts forward by the overlap duration
        const duration = this.toMin(proposed.end_time) - this.toMin(proposed.start_time);
        const earliestConflictStart = Math.min(...conflicts.map(c => this.toMin(c.start_time)));
        const shiftAmount = this.toMin(proposed.end_time) - earliestConflictStart;

        const changes: any[] = [
            { op: 'create_event', payload: proposed }
        ];

        // This is a naive implementation: it doesn't check for secondary conflicts
        // In a real scenario, we'd recursively shift.
        for (const c of conflicts) {
            const newStart = this.toMin(c.start_time) + shiftAmount;
            const newEnd = this.toMin(c.end_time) + shiftAmount;
            if (newEnd > 1439) return null; // Too late

            changes.push({
                op: 'update_event',
                event_id: c.id!,
                payload: { start_time: this.fromMin(newStart), end_time: this.fromMin(newEnd) }
            });
        }

        return { reason: 'Chain shift of flexible blocks', changes };
    }

    private static tryDropLowest(proposed: Omit<ScheduleBlockRow, "id">, existing: ScheduleBlockRow[]) {
        const conflicts = this.findConflicts(proposed, existing);
        if (conflicts.some(c => c.is_fixed)) return null;

        // Find lowest priority conflict
        const sorted = [...conflicts].sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const lowest = sorted[0];

        return {
            id: 'drop-lowest',
            label: `Drop "${lowest.title}"`,
            description: `Replace the lowest priority flexible task.`,
            patch: {
                reason: `Priority conflict resolution: dropping ${lowest.title}`,
                changes: [
                    { op: 'delete_event', event_id: lowest.id! },
                    { op: 'create_event', payload: proposed }
                ]
            },
            tradeoff: `You'll lose the time for ${lowest.title}`,
            score: 50
        };
    }

    private static toMin(hhmm: string): number {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    private static fromMin(min: number): string {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
}
