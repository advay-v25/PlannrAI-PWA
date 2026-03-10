import { createClient } from '@/lib/supabase/server';
import { CoachOption, SchedulePatch, PatchOperation } from '@/lib/coach/response-generator';

export interface PatchExecutionResult {
    success: boolean;
    version_id?: string;
    applied_operations?: number;
    error?: string;
    failed_operation?: PatchOperation;
    conflict?: {
        type: 'overlap' | 'locked' | 'not_found' | 'validation';
        message: string;
        conflicting_blocks?: any[];
    };
    updated_options?: CoachOption[];
}

export async function executePatch(
    userId: string,
    patch: SchedulePatch,
    optionId: string,
    conversationId: string
): Promise<PatchExecutionResult> {
    const supabase = await createClient();
    const snapshot = await createSnapshot(supabase, userId, 'coach_apply');

    try {
        const validationResult = await validatePatch(supabase, userId, patch);

        if (!validationResult.valid) {
            return {
                success: false,
                error: validationResult.error,
                conflict: validationResult.conflict,
                updated_options: await regenerateOptions(userId, validationResult.conflict),
            };
        }

        const applied = await applyOperations(supabase, userId, patch.operations);

        await recordPatchApplication(
            supabase,
            conversationId,
            optionId,
            patch,
            snapshot.id
        );

        return {
            success: true,
            version_id: snapshot.id,
            applied_operations: applied,
        };

    } catch (error) {
        await rollbackToSnapshot(supabase, userId, snapshot.id);

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during patch application',
        };
    }
}

interface ValidationResult {
    valid: boolean;
    error?: string;
    conflict?: {
        type: 'overlap' | 'locked' | 'not_found' | 'validation';
        message: string;
        conflicting_blocks?: any[];
    };
}

async function validatePatch(
    supabase: any,
    userId: string,
    patch: SchedulePatch
): Promise<ValidationResult> {
    for (const operation of patch.operations) {
        const result = await validateOperation(supabase, userId, operation);
        if (!result.valid) {
            return result;
        }
    }
    return { valid: true };
}

async function validateOperation(
    supabase: any,
    userId: string,
    operation: PatchOperation
): Promise<ValidationResult> {
    switch (operation.type) {
        case 'create_block':
            return validateCreateBlock(supabase, userId, operation as any);
        case 'move_block':
            return validateMoveBlock(supabase, userId, operation as any);
        case 'update_block':
            return validateUpdateBlock(supabase, userId, operation as any);
        case 'delete_block':
            return validateDeleteBlock(supabase, userId, operation as any);
        case 'update_goal':
            return validateUpdateGoal(supabase, userId, operation as any);
        default:
            return { valid: false, error: 'Unknown operation type' };
    }
}

async function validateCreateBlock(
    supabase: any,
    userId: string,
    operation: any
): Promise<ValidationResult> {
    const { date, start_time, end_time } = operation.data;

    if (!isValidTime(start_time) || !isValidTime(end_time)) {
        return {
            valid: false,
            error: 'Invalid time format',
            conflict: { type: 'validation', message: 'Time must be in HH:MM format' }
        };
    }

    if (timeToMinutes(end_time) <= timeToMinutes(start_time)) {
        return {
            valid: false,
            error: 'End time must be after start time',
            conflict: { type: 'validation', message: 'End time must be after start time' }
        };
    }

    const { data: existingBlocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date);

    const overlapping = (existingBlocks || []).filter((block: any) =>
        blocksOverlap(block, { start_time, end_time })
    );

    if (overlapping.length > 0) {
        return {
            valid: false,
            error: 'Block overlaps with existing schedule',
            conflict: {
                type: 'overlap',
                message: `Conflicts with ${overlapping[0].context} at ${overlapping[0].start_time}`,
                conflicting_blocks: overlapping,
            },
        };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('sleep_start, sleep_end')
        .eq('id', userId)
        .single();

    if (profile && isInSleepWindow(start_time, end_time, profile)) {
        return {
            valid: false,
            error: 'Cannot schedule during sleep time',
            conflict: { type: 'validation', message: 'This time is during your sleep window' },
        };
    }

    return { valid: true };
}

async function validateMoveBlock(
    supabase: any,
    userId: string,
    operation: any
): Promise<ValidationResult> {
    const { block_id, new_start, new_end, new_date } = operation;

    const { data: block, error } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('id', block_id)
        .eq('user_id', userId)
        .single();

    if (error || !block) {
        return {
            valid: false,
            error: 'Block not found',
            conflict: { type: 'not_found', message: 'The block no longer exists' },
        };
    }

    if (block.is_locked) {
        return {
            valid: false,
            error: 'Cannot move locked block',
            conflict: { type: 'locked', message: 'This is a locked commitment and cannot be moved' },
        };
    }

    const targetDate = new_date || block.date;
    const { data: existingBlocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('date', targetDate)
        .neq('id', block_id);

    const overlapping = (existingBlocks || []).filter((b: any) =>
        blocksOverlap(b, { start_time: new_start, end_time: new_end })
    );

    if (overlapping.length > 0) {
        return {
            valid: false,
            error: 'New position conflicts with existing block',
            conflict: {
                type: 'overlap',
                message: `Conflicts with ${overlapping[0].context}`,
                conflicting_blocks: overlapping,
            },
        };
    }

    return { valid: true };
}

async function validateUpdateBlock(
    supabase: any,
    userId: string,
    operation: any
): Promise<ValidationResult> {
    const { block_id, changes } = operation;

    const { data: block, error } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('id', block_id)
        .eq('user_id', userId)
        .single();

    if (error || !block) {
        return {
            valid: false,
            error: 'Block not found',
            conflict: { type: 'not_found', message: 'The block no longer exists' },
        };
    }

    if (changes.start_time || changes.end_time) {
        const newStart = changes.start_time || block.start_time;
        const newEnd = changes.end_time || block.end_time;

        const { data: existingBlocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', block.date)
            .neq('id', block_id);

        const overlapping = (existingBlocks || []).filter((b: any) =>
            blocksOverlap(b, { start_time: newStart, end_time: newEnd })
        );

        if (overlapping.length > 0) {
            return {
                valid: false,
                error: 'Time change conflicts with existing block',
                conflict: {
                    type: 'overlap',
                    message: `Conflicts with ${overlapping[0].context}`,
                    conflicting_blocks: overlapping,
                },
            };
        }
    }

    return { valid: true };
}

async function validateDeleteBlock(
    supabase: any,
    userId: string,
    operation: any
): Promise<ValidationResult> {
    const { block_id } = operation;

    const { data: block, error } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('id', block_id)
        .eq('user_id', userId)
        .single();

    if (error || !block) {
        return {
            valid: false,
            error: 'Block not found',
            conflict: { type: 'not_found', message: 'The block no longer exists' },
        };
    }

    if (block.is_locked) {
        return {
            valid: false,
            error: 'Cannot delete locked block',
            conflict: { type: 'locked', message: 'This is a locked commitment' },
        };
    }

    return { valid: true };
}

async function validateUpdateGoal(
    supabase: any,
    userId: string,
    operation: any
): Promise<ValidationResult> {
    const { goal_id } = operation;

    const { data: goal, error } = await supabase
        .from('goals')
        .select('*')
        .eq('id', goal_id)
        .eq('user_id', userId)
        .single();

    if (error || !goal) {
        return {
            valid: false,
            error: 'Goal not found',
            conflict: { type: 'not_found', message: 'The goal no longer exists' },
        };
    }

    return { valid: true };
}

async function applyOperations(
    supabase: any,
    userId: string,
    operations: PatchOperation[]
): Promise<number> {
    let applied = 0;
    for (const operation of operations) {
        await applyOperation(supabase, userId, operation);
        applied++;
    }
    return applied;
}

async function applyOperation(
    supabase: any,
    userId: string,
    operation: PatchOperation
): Promise<void> {

    switch (operation.type) {
        case 'create_block':
            await supabase.from('schedule_blocks').insert({
                user_id: userId,
                ...operation.data,
                status: 'planned',
                created_at: new Date().toISOString(),
            });
            break;

        case 'move_block':
            const moveUpdates: any = {
                start_time: operation.new_start,
                end_time: operation.new_end,
                original_start_time: undefined,
                updated_at: new Date().toISOString(),
            };

            if (operation.new_date) {
                moveUpdates.date = operation.new_date;
                moveUpdates.original_date = undefined;
            }

            const { data: currentBlock } = await supabase
                .from('schedule_blocks')
                .select('start_time, date')
                .eq('id', operation.block_id)
                .single();

            if (currentBlock) {
                moveUpdates.original_start_time = currentBlock.start_time;
                if (operation.new_date) {
                    moveUpdates.original_date = currentBlock.date;
                }
                moveUpdates.deviation_reason = 'Rescheduled by Coach';
            }

            await supabase
                .from('schedule_blocks')
                .update(moveUpdates)
                .eq('id', operation.block_id)
                .eq('user_id', userId);
            break;

        case 'update_block':
            await supabase
                .from('schedule_blocks')
                .update({
                    ...operation.changes,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', operation.block_id)
                .eq('user_id', userId);
            break;

        case 'delete_block':
            await supabase
                .from('schedule_blocks')
                .delete()
                .eq('id', operation.block_id)
                .eq('user_id', userId);
            break;

        case 'update_goal':
            const updateGoalOp = operation as any;
            await supabase
                .from('goals')
                .update({
                    ...updateGoalOp.changes,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', updateGoalOp.goal_id)
                .eq('user_id', userId);
            break;
    }
}

async function createSnapshot(
    supabase: any,
    userId: string,
    trigger: string
): Promise<{ id: string }> {
    const today = new Date().toISOString().split('T')[0];
    const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

    const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .gte('date', today)
        .lte('date', twoWeeksLater);

    const { data: version, error } = await supabase
        .from('schedule_versions')
        .insert({
            user_id: userId,
            snapshot: blocks || [],
            trigger_action: trigger,
            created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error) {
        throw new Error(`Failed to create snapshot: ${error.message}`);
    }

    return { id: version.id };
}

async function rollbackToSnapshot(
    supabase: any,
    userId: string,
    versionId: string
): Promise<boolean> {
    const { data: version, error: fetchError } = await supabase
        .from('schedule_versions')
        .select('snapshot')
        .eq('id', versionId)
        .eq('user_id', userId)
        .single();

    if (fetchError || !version) {
        console.error('Failed to fetch snapshot for rollback:', fetchError);
        return false;
    }

    const snapshot = version.snapshot as any[];
    const dates = [...new Set(snapshot.map(b => b.date))];

    await supabase
        .from('schedule_blocks')
        .delete()
        .eq('user_id', userId)
        .in('date', dates);

    const blocksToInsert = snapshot.map(b => {
        const { id, ...rest } = b;
        return rest;
    });

    if (blocksToInsert.length > 0) {
        await supabase.from('schedule_blocks').insert(blocksToInsert);
    }

    return true;
}

export async function undoLastPatch(
    userId: string,
    versionId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    try {
        const success = await rollbackToSnapshot(supabase, userId, versionId);
        return { success };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Undo failed',
        };
    }
}

async function recordPatchApplication(
    supabase: any,
    conversationId: string,
    optionId: string,
    patch: SchedulePatch,
    versionId: string
): Promise<void> {
    await supabase
        .from('coach_messages')
        .update({
            selected_option_id: optionId,
            patch_applied: patch as any,
            patch_applied_at: new Date().toISOString(),
            patch_version_id: versionId,
        })
        .eq('conversation_id', conversationId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);
}

async function regenerateOptions(
    userId: string,
    conflict: ValidationResult['conflict']
): Promise<CoachOption[]> {
    return [
        {
            id: 'retry',
            title: 'Try again',
            description: 'Regenerate options with current schedule',
            impact: 'Fresh options based on current state',
            patch: { operations: [], requires_confirmation: false },
            preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
            recommended: true,
        },
        {
            id: 'open_calendar',
            title: 'Open calendar',
            description: 'Make changes manually',
            impact: 'Full control over your schedule',
            patch: { operations: [], requires_confirmation: false },
            preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
            recommended: false,
        },
    ];
}

function isValidTime(time: string): boolean {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function blocksOverlap(
    blockA: { start_time: string; end_time: string },
    blockB: { start_time: string; end_time: string }
): boolean {
    const aStart = timeToMinutes(blockA.start_time);
    const aEnd = timeToMinutes(blockA.end_time);
    const bStart = timeToMinutes(blockB.start_time);
    const bEnd = timeToMinutes(blockB.end_time);

    return aStart < bEnd && aEnd > bStart;
}

function isInSleepWindow(
    start: string,
    end: string,
    profile: { sleep_start: string; sleep_end: string, wind_down_mins: number }
): boolean {
    const startMins = timeToMinutes(start);
    const endMins = timeToMinutes(end);
    const sleepStart = timeToMinutes(profile.sleep_start) - (profile.wind_down_mins || 0);
    const sleepEnd = timeToMinutes(profile.sleep_end);

    if (sleepStart > sleepEnd) {
        return startMins >= sleepStart || endMins <= sleepEnd;
    }

    return (startMins >= sleepStart && startMins < sleepEnd) ||
        (endMins > sleepStart && endMins <= sleepEnd);
}
