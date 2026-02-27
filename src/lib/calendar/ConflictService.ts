import { ScheduleBlock, ConflictResult, ResolutionOption } from './types';
import { createClient } from '@/lib/supabase/server';
import { timeToMinutes, minutesToTime } from './utils';

export class ConflictService {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    /**
     * Check if a block conflicts with existing schedule
     */
    async checkConflict(
        block: Partial<ScheduleBlock>,
        excludeBlockId?: string
    ): Promise<ConflictResult> {
        // Get existing blocks for the date
        const supabase = await createClient();
        let query = supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', this.userId)
            .eq('date', block.date);

        if (excludeBlockId) {
            query = query.neq('id', excludeBlockId);
        }

        const { data: existingBlocks, error } = await query;

        if (error) throw new Error(`Failed to check conflicts: ${error.message}`);

        // Find overlapping blocks
        const overlapping = (existingBlocks || []).filter((existing: any) =>
            this.blocksOverlap(block, existing)
        );

        if (overlapping.length === 0) {
            return { hasConflict: false };
        }

        // Generate resolution options
        const resolutions = await this.generateResolutions(block, overlapping);

        return {
            hasConflict: true,
            type: overlapping[0].is_locked ? 'anchor' : 'overlap',
            message: overlapping[0].is_locked
                ? `Conflicts with locked block: ${overlapping[0].title}`
                : `Overlaps with: ${overlapping.map(b => b.title).join(', ')}`,
            conflictingBlocks: overlapping,
            resolutions
        };
    }

    /**
     * Check if two blocks overlap
     */
    private blocksOverlap(blockA: Partial<ScheduleBlock>, blockB: ScheduleBlock): boolean {
        const aStart = timeToMinutes(blockA.start_time!);
        const aEnd = timeToMinutes(blockA.end_time!);
        const bStart = timeToMinutes(blockB.start_time);
        const bEnd = timeToMinutes(blockB.end_time);

        return aStart < bEnd && aEnd > bStart;
    }

    /**
     * Generate resolution options for a conflict
     */
    private async generateResolutions(
        proposedBlock: Partial<ScheduleBlock>,
        conflicting: ScheduleBlock[]
    ): Promise<ResolutionOption[]> {
        const resolutions: ResolutionOption[] = [];

        // If conflicting with anchor - no resolution possible
        if (conflicting.some((b: any) => b.is_locked)) {
            return resolutions;
        }

        // Option 1: Swap blocks
        resolutions.push({
            id: 'swap',
            label: 'Swap positions',
            description: `Move ${conflicting[0].title} to ${proposedBlock.start_time}`,
            patch: {
                update: [{
                    block_id: conflicting[0].id,
                    changes: {
                        start_time: proposedBlock.start_time!,
                        end_time: proposedBlock.end_time!
                    }
                }]
            }
        });

        // Option 2: Push conflicting block later
        const proposedEnd = timeToMinutes(proposedBlock.end_time!);
        const conflictDuration = timeToMinutes(conflicting[0].end_time) - timeToMinutes(conflicting[0].start_time);
        const newStart = minutesToTime(proposedEnd + 15); // 15 min buffer
        const newEnd = minutesToTime(proposedEnd + 15 + conflictDuration);

        resolutions.push({
            id: 'push_later',
            label: 'Push to later',
            description: `Move ${conflicting[0].title} to ${newStart}`,
            patch: {
                update: [{
                    block_id: conflicting[0].id,
                    changes: {
                        start_time: newStart,
                        end_time: newEnd
                    }
                }]
            }
        });

        // Option 3: Find next available slot for proposed block
        const nextSlot = await this.findNextAvailableSlot(
            proposedBlock.date!,
            timeToMinutes(proposedBlock.end_time!) - timeToMinutes(proposedBlock.start_time!)
        );

        if (nextSlot) {
            resolutions.push({
                id: 'move_proposed',
                label: 'Find new slot',
                description: `Schedule at ${nextSlot.start_time} instead`,
                patch: {
                    // This modifies the proposed block, not existing
                    add: [{
                        ...(proposedBlock as Omit<ScheduleBlock, 'id' | 'user_id' | 'created_at' | 'updated_at'>),
                        start_time: nextSlot.start_time,
                        end_time: nextSlot.end_time
                    }]
                }
            });
        }

        return resolutions;
    }

    /**
     * Find the next available slot for a block of given duration
     */
    private async findNextAvailableSlot(
        date: string,
        durationMinutes: number
    ): Promise<{ start_time: string; end_time: string } | null> {
        // Get user's wake/sleep times
        const supabase = await createClient();
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('wake_time, sleep_time, wind_down_minutes')
            .eq('id', this.userId)
            .single();

        // Stub implementation to return simple later slot for compilation purposes
        return {
            start_time: '18:00',
            end_time: minutesToTime(timeToMinutes('18:00') + durationMinutes)
        };
    }
}
