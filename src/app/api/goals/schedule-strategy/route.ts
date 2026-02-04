
import { NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

interface ConflictInfo {
    date: string;
    existingBlock: {
        id: string;
        context: string;
        start_time: string;
        end_time: string;
    };
}

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['goal_id', 'start_time', 'date']);
        if (!validation.valid) return apiError('Missing required fields');

        const {
            goal_id,
            start_time,
            date,
            recurring,
            days_of_week,
            weeks = 1,
            skipConflicts = false,
            replaceConflicts = false
        } = body as {
            goal_id: string;
            start_time: string; // HH:MM
            date: string; // YYYY-MM-DD
            recurring?: boolean;
            days_of_week?: number[]; // 0=Sun, 6=Sat
            weeks?: number; // 1-4 weeks
            skipConflicts?: boolean;
            replaceConflicts?: boolean;
        };

        const supabase = await createClient();

        // 1. Fetch Goal Strategy
        const { data: goal } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goal_id)
            .single();

        if (!goal || !goal.ai_strategy) return apiError('Goal strategy not found');

        const strategy = goal.ai_strategy;
        const routine = strategy.routine;

        // 2. Calculate End Time
        const [h, m] = start_time.split(':').map(Number);
        const duration = routine?.duration_mins || goal.minutes_per_day || 30;
        const endMinutes = h * 60 + m + duration;
        const endHour = Math.floor(endMinutes / 60) % 24;
        const endMin = endMinutes % 60;
        const end_time = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

        // 3. Prepare Checklist
        const checklist = strategy.checklist?.map((item: any) => ({
            id: crypto.randomUUID(),
            text: item.text,
            completed: false
        })) || [];

        // 4. Generate all target dates
        const targetDates: string[] = [];
        const startDate = new Date(date);

        // Get start of this week (Monday)
        const dayOfWeek = startDate.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + mondayOffset);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Limit weeks to 1-4
        const numWeeks = Math.max(1, Math.min(4, weeks));

        if (recurring && days_of_week && days_of_week.length > 0) {
            // Generate dates for all selected weeks
            for (let w = 0; w < numWeeks; w++) {
                for (let i = 0; i < 7; i++) {
                    const currentDate = new Date(weekStart);
                    currentDate.setDate(currentDate.getDate() + (w * 7) + i);
                    const currentDayOfWeek = currentDate.getDay();

                    if (days_of_week.includes(currentDayOfWeek) && currentDate >= today) {
                        targetDates.push(currentDate.toISOString().split('T')[0]);
                    }
                }
            }
        } else {
            // Single block
            targetDates.push(date);
        }

        if (targetDates.length === 0) {
            return apiError('No valid dates to schedule', 400);
        }

        // 5. Check for conflicts
        const { data: existingBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, date, start_time, end_time, context, goal_id')
            .eq('user_id', context.userId)
            .in('date', targetDates);

        const parseTime = (t: string): number => {
            const [hours, mins] = t.split(':').map(Number);
            return hours * 60 + mins;
        };

        const newStart = parseTime(start_time);
        const newEnd = parseTime(end_time);

        const conflicts: ConflictInfo[] = [];
        const conflictBlockIds: string[] = [];

        for (const block of existingBlocks || []) {
            const blockStart = parseTime(block.start_time);
            const blockEnd = parseTime(block.end_time);

            // Check for time overlap
            if (newStart < blockEnd && newEnd > blockStart) {
                conflicts.push({
                    date: block.date,
                    existingBlock: {
                        id: block.id,
                        context: block.context || 'Untitled Block',
                        start_time: block.start_time,
                        end_time: block.end_time
                    }
                });
                conflictBlockIds.push(block.id);
            }
        }

        // If conflicts exist and no resolution strategy provided, return them
        if (conflicts.length > 0 && !skipConflicts && !replaceConflicts) {
            return NextResponse.json({
                error: 'Scheduling conflicts detected',
                conflicts,
                conflictCount: conflicts.length,
                targetDatesCount: targetDates.length
            }, { status: 409 });
        }

        // 6. Handle conflict resolution
        if (replaceConflicts && conflictBlockIds.length > 0) {
            // Delete conflicting blocks
            const { error: deleteError } = await supabase
                .from('schedule_blocks')
                .delete()
                .in('id', conflictBlockIds);

            if (deleteError) {
                console.error('Error deleting conflicts:', deleteError);
                return apiError('Failed to replace conflicting blocks', 500);
            }
        }

        // 7. Filter out conflicting dates if skipping
        const datesToSchedule = skipConflicts
            ? targetDates.filter(d => !conflicts.some(c => c.date === d))
            : targetDates;

        if (datesToSchedule.length === 0) {
            return apiError('All dates have conflicts', 400);
        }

        // 8. Create blocks
        const blocks = datesToSchedule.map(blockDate => ({
            user_id: context.userId,
            date: blockDate,
            start_time,
            end_time,
            status: 'planned',
            block_type: 'goal',
            goal_id: goal.id,
            context: `${goal.title}: ${routine?.steps?.[0] || 'Daily Protocol'}`,
            checklist: checklist
        }));

        const { data, error } = await supabase
            .from('schedule_blocks')
            .insert(blocks)
            .select();

        if (error) {
            console.error(error);
            return apiError('Failed to schedule block', 500);
        }

        return apiSuccess({
            blocks: data,
            message: `Scheduled ${data?.length || 0} block(s) for "${goal.title}"`,
            skippedConflicts: skipConflicts ? conflicts.length : 0,
            replacedConflicts: replaceConflicts ? conflictBlockIds.length : 0,
            weeksScheduled: numWeeks
        });
    },
    { requireAuth: true, auditAction: 'schedule_strategy' }
);
