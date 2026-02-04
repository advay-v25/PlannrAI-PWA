import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

interface ConflictInfo {
    date: string;
    existingBlock: {
        id: string;
        context: string;
        start_time: string;
        end_time: string;
        goal_id: string | null;
    };
    overlapType: 'full' | 'partial_start' | 'partial_end' | 'contained';
}

/**
 * Check for scheduling conflicts before creating blocks
 * POST /api/goals/check-conflicts
 */
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['dates', 'start_time', 'end_time']);
        if (!validation.valid) return apiError('Missing required fields');

        const { dates, start_time, end_time } = body as {
            dates: string[];
            start_time: string;
            end_time: string;
        };

        if (!Array.isArray(dates) || dates.length === 0) {
            return apiError('Dates must be a non-empty array');
        }

        const supabase = await createClient();

        // Fetch all blocks for the given dates
        const { data: existingBlocks, error } = await supabase
            .from('schedule_blocks')
            .select('id, date, start_time, end_time, context, goal_id')
            .eq('user_id', context.userId)
            .in('date', dates);

        if (error) {
            console.error('Error fetching blocks:', error);
            return apiError('Failed to check conflicts', 500);
        }

        // Parse time to minutes for comparison
        const parseTime = (t: string): number => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const newStart = parseTime(start_time);
        const newEnd = parseTime(end_time);

        // Find conflicts
        const conflicts: ConflictInfo[] = [];

        for (const block of existingBlocks || []) {
            const blockStart = parseTime(block.start_time);
            const blockEnd = parseTime(block.end_time);

            // Check for overlap
            // Overlap exists if: newStart < blockEnd AND newEnd > blockStart
            if (newStart < blockEnd && newEnd > blockStart) {
                let overlapType: ConflictInfo['overlapType'];

                if (newStart <= blockStart && newEnd >= blockEnd) {
                    // New block fully contains existing block
                    overlapType = 'contained';
                } else if (newStart >= blockStart && newEnd <= blockEnd) {
                    // New block is fully within existing block
                    overlapType = 'full';
                } else if (newStart < blockStart) {
                    // Overlap at the start of existing block
                    overlapType = 'partial_start';
                } else {
                    // Overlap at the end of existing block
                    overlapType = 'partial_end';
                }

                conflicts.push({
                    date: block.date,
                    existingBlock: {
                        id: block.id,
                        context: block.context || 'Untitled Block',
                        start_time: block.start_time,
                        end_time: block.end_time,
                        goal_id: block.goal_id
                    },
                    overlapType
                });
            }
        }

        return apiSuccess({
            hasConflicts: conflicts.length > 0,
            conflicts,
            conflictCount: conflicts.length,
            checkedDates: dates.length
        });
    },
    { requireAuth: true, auditAction: 'check_conflicts' }
);
