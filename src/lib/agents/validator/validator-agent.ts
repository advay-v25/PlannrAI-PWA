import { BaseAgent } from '../core/base-agent';
import { AgentContext, CalendarPatch, ValidatorOutput, ValidatorOutputSchema, Sacrifice } from '../core/types';
import { detectConflicts, ScheduleItem } from '@/lib/scheduling/solver';
import { areIntervalsOverlapping, differenceInMinutes, isSameDay } from 'date-fns';

export class ValidatorAgent extends BaseAgent<{ patch: CalendarPatch, currentSchedule: any[] }, ValidatorOutput> {
    name = "Validator Agent";

    async run(input: { patch: CalendarPatch, currentSchedule: any[] }, context: AgentContext): Promise<ValidatorOutput> {
        this.log("Validating patch...", { summary: input.patch.summary });

        const { patch, currentSchedule } = input;
        const problems: string[] = [];
        const sacrifices: Sacrifice[] = [];

        // 1. ANCHOR & LOCK SAFETY
        // ... (unchanged logic for critical violations) ...
        for (const change of patch.changes) {
            if (['move', 'delete', 'update'].includes(change.op)) {
                const targetId = change.block_id || change.data.id;
                const originalBlock = currentSchedule.find(b => b.id === targetId);

                if (originalBlock && originalBlock.is_fixed) {
                    problems.push(`Attempted to move locked anchor: "${originalBlock.title}"`);
                }
            }
        }

        // 2. SIMULATE STATE & CHECK OVERLAPS
        let futureSchedule: ScheduleItem[] = currentSchedule.map(s => ({
            id: s.id,
            start: new Date(s.start_time),
            end: new Date(s.end_time),
            type: s.is_fixed ? 'fixed' : 'flexible'
        }));

        // Apply changes
        for (const change of patch.changes) {
            if (change.op === 'create') {
                futureSchedule.push({
                    id: change.data.id,
                    start: new Date(change.data.start_time),
                    end: new Date(change.data.end_time),
                    type: change.data.is_fixed ? 'fixed' : 'flexible'
                });
            } else if (change.op === 'move' || change.op === 'update') {
                // ... update logic ...
                const idx = futureSchedule.findIndex(s => s.id === (change.block_id || change.data.id));
                if (idx !== -1) {
                    futureSchedule[idx].start = new Date(change.data.start_time || futureSchedule[idx].start);
                    futureSchedule[idx].end = new Date(change.data.end_time || futureSchedule[idx].end);
                }
            } else if (change.op === 'delete') {
                futureSchedule = futureSchedule.filter(s => s.id !== (change.block_id || change.data.id));
            }
        }

        // Detect Conflicts
        const conflicts = detectConflicts(futureSchedule);

        if (conflicts.length > 0) {
            for (const conflict of conflicts) {
                const blockA = currentSchedule.find(s => s.id === conflict.a);
                const blockB = currentSchedule.find(s => s.id === conflict.b);

                // If conflict blocks essentially don't exist in original schedule (newly created overlapping each other?), skip or handle?
                // Assuming mostly New vs Old collisions.

                const isAFixed = blockA?.is_fixed;
                const isBFixed = blockB?.is_fixed;

                if (isAFixed || isBFixed) {
                    problems.push(`Conflict with locked block: ${isAFixed ? blockA?.title : blockB?.title}`);
                } else {
                    // Soft Conflict - Suggest Sacrifice
                    // Identify which one is the "Old" one that needs to go. 
                    // Usually the one that isn't the new patch's subject. 
                    // For simplicity, list both or intelligent guess.

                    [blockA, blockB].forEach(block => {
                        if (block && !block.is_fixed) {
                            // Calculate impact
                            const duration = differenceInMinutes(new Date(block.end_time), new Date(block.start_time));

                            // Check if duplicate
                            if (!sacrifices.some(s => s.block_id === block.id)) {
                                sacrifices.push({
                                    type: 'delete',
                                    block_id: block.id,
                                    title: block.title || "Untitled Task",
                                    description: `Frees ${duration} min`,
                                    effect: duration > 60 ? 'major' : 'minor'
                                });
                            }
                        }
                    });
                }
            }
        }

        // 3. DAY BOUNDS
        for (const item of futureSchedule) {
            if (!isSameDay(item.start, item.end)) {
                problems.push(`Block "${item.id}" spans multiple days (unsupported).`);
            }
        }

        const valid = problems.length === 0;

        return {
            valid,
            reason: valid
                ? (sacrifices.length > 0 ? "Valid with sacrifices." : "Patch is safe.")
                : problems.join('; '),
            required_action: sacrifices.length > 0 ? 'sacrifice' : 'none',
            sacrifices: valid ? sacrifices : []
        };
    }
}
