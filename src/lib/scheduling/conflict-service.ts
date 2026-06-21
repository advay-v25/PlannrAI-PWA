import { ScheduleBlock } from '@/types/database';
import { addMinutes, parseISO, areIntervalsOverlapping, format, isBefore, isAfter, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

type ResolutionOption = {
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

    /**
     * Structural Validation Block for AI Changes
     * Evaluates AI-generated patches against fixed hard blocks and immutable constraints.
     */
    static validateAIPatch(currentSchedule: ScheduleBlock[], patchOps: any[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        for (const op of patchOps) {
            // Protect immutable existing blocks
            if (op.op === 'delete_event' || op.op === 'update_event' || op.op === 'move_event') {
                const targetId = op.event_id || op.payload?.id;
                const targetBlock = currentSchedule.find(b => b.id === targetId);
                
                if (targetBlock && (targetBlock.is_fixed || targetBlock.block_type === 'anchor')) {
                    errors.push(`Mutation rejected: Cannot modify fixed block "${targetBlock.title}"`);
                }
            }

            // Protect against overlapping fixed blocks
            if (op.op === 'create_event' || op.op === 'move_event' || op.op === 'update_event') {
                const payload = op.payload;
                if (payload && payload.date && payload.start_time && payload.end_time) {
                    try {
                        const start = parseISO(`${payload.date}T${payload.start_time}`);
                        const end = parseISO(`${payload.date}T${payload.end_time}`);
                        
                        const fixedCollisions = currentSchedule.filter(b => 
                            b.id !== (op.event_id || payload.id) &&
                            (b.is_fixed || b.block_type === 'anchor') &&
                            b.date === payload.date &&
                            areIntervalsOverlapping(
                                { start, end },
                                { start: parseISO(`${b.date}T${b.start_time}`), end: parseISO(`${b.date}T${b.end_time}`) }
                            )
                        );

                        if (fixedCollisions.length > 0) {
                            errors.push(`Overlap rejected: Collides with fixed block(s) [${fixedCollisions.map(b => b.title).join(', ')}]`);
                        }
                    } catch (e) {
                        errors.push(`Validation error: Invalid temporal data in payload for "${payload.title || 'event'}"`);
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

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
            const shiftPatch = this.calculateShiftChain(proposal, others, collisions);
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

    private static calculateShiftChain(
        proposal: { id?: string, start: Date, end: Date, title?: string, is_fixed?: boolean },
        others: ScheduleBlock[],
        collisions: ScheduleBlock[]
    ) {
        // We use the solver to repack the rest of the day, allowing a true cascade.
        // Dynamic import or require since it's in the same folder.
        const { resolveOverlaps } = require('./solver');

        const items: any[] = [];
        
        // Add the proposal as a fixed item (since we are trying to place it here)
        items.push({
            id: proposal.id || 'proposal',
            start: proposal.start,
            end: proposal.end,
            type: 'fixed'
        });

        // Add all other blocks from the same day
        const dayOthers = others.filter(b => b.date === format(proposal.start, 'yyyy-MM-dd'));
        for (const b of dayOthers) {
            items.push({
                id: b.id,
                start: parseISO(`${b.date}T${b.start_time}`),
                end: parseISO(`${b.date}T${b.end_time}`),
                type: (b.is_fixed || b.block_type === 'anchor' || b.block_type === 'meal') ? 'fixed' : 'flexible'
            });
        }

        const result = resolveOverlaps(items, startOfDay(proposal.start));

        // If any flexible blocks couldn't be resolved (fatal conflict), this strategy fails
        if (result.conflicts.length > 0) return null;

        const changes: any[] = [];
        
        // The proposal gets created
        if (!proposal.id) {
            changes.push({
                op: 'create_event',
                payload: {
                    date: format(proposal.start, 'yyyy-MM-dd'),
                    start_time: format(proposal.start, 'HH:mm'),
                    end_time: format(proposal.end, 'HH:mm'),
                    title: proposal.title || 'New Event',
                    block_type: proposal.is_fixed ? 'anchor' : 'adhoc'
                }
            });
        }

        // Add moves for anything that was pushed forward by the cascade
        for (const movedId of result.moved) {
            if (movedId === 'proposal' || movedId === proposal.id) continue;
            
            const resolvedItem = result.resolved.find((r: any) => r.id === movedId);
            if (resolvedItem) {
                changes.push({
                    op: 'update_event',
                    event_id: movedId,
                    payload: {
                        start_time: format(resolvedItem.start, 'HH:mm'),
                        end_time: format(resolvedItem.end, 'HH:mm')
                    }
                });
            }
        }

        // If nothing actually moved, maybe the naive collision check was a false positive,
        // or the cascade failed to produce any updates.
        if (changes.length <= (proposal.id ? 0 : 1)) {
            return null;
        }

        return changes;
    }
}
