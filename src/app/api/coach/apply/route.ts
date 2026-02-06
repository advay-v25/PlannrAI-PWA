import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';
import { generateAIPatch } from '@/lib/ai/groq-client';
import { format, parseISO, addMinutes } from 'date-fns';
import { CalendarPatch } from '@/lib/validation/calendar-contract';
import { findNextAvailableSlot, ScheduleItem } from '@/lib/scheduling/solver';

export const POST = secureApiRoute(async (context: SecureApiContext, body: any) => {
    const supabase = await createClient(); // Fixed await
    const { action_id, action_type, date, intent_payload, user_context } = body;

    if (!action_id || !date) {
        return apiError('Missing required fields', 400);
    }

    // 1. Fetch Schedule Context for Solver
    const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', context.userId)
        .eq('date', date)
        .order('start_time');

    // Convert DB blocks to Solver ScheduleItems
    const scheduleItems: ScheduleItem[] = (blocks || []).map((b: any) => {
        const start = parseISO(`${date}T${b.start_time}`);
        const end = parseISO(`${date}T${b.end_time}`);
        return {
            id: b.id,
            start,
            end,
            type: (b.block_type === 'anchor' || b.block_type === 'sleep') ? 'fixed' : 'flexible'
        };
    });

    const referenceDate = parseISO(date);
    let patch: CalendarPatch;

    try {
        switch (action_type) {
            case 'create_anchor': {
                patch = {
                    summary: `Creating anchor "${intent_payload?.title || 'New Anchor'}"`,
                    affected_date: date,
                    changes: [{
                        op: 'CREATE_ANCHOR',
                        title: intent_payload?.title || 'New Anchor',
                        start_ts: `${date}T${intent_payload?.start_time || '09:00:00'}`,
                        end_ts: `${date}T${intent_payload?.end_time || '10:00:00'}`,
                        locked: true,
                        recurrence: intent_payload?.days || []
                    }],
                    requires_confirmation: true,
                    warnings: [],
                    sacrifices: [],
                    source: 'coach'
                };
                break;
            }

            case 'move_single': {
                const blockId = intent_payload?.block_id;
                const targetBlock = blocks?.find((b: any) => b.id === blockId);

                if (!targetBlock) throw new Error('Target block not found');

                // Calculate duration
                const oldStart = parseISO(`${date}T${targetBlock.start_time}`);
                const oldEnd = parseISO(`${date}T${targetBlock.end_time}`);
                const durationMins = (oldEnd.getTime() - oldStart.getTime()) / 60000;

                // JUDGEMENT DAY: Use ConflictService
                // If there's a target time provided (e.g. from intent), use it.
                // Otherwise find next slot.

                // For 'move_single' without specific time, we use Solver directly as before
                // But if we HAD a time, we'd use ConflictService.
                // Given the current implementation of move_single implies "find next available",
                // we keep finding next slot.

                // However, the directive says "Conflict Resolution".
                // If the user said "Move gym to 4pm" (which maps to intent_payload.target_time), 
                // we SHOULD use ConflictService.

                let targetStart: Date;
                if (intent_payload?.target_time) {
                    targetStart = parseISO(`${date}T${intent_payload.target_time}`);
                } else {
                    // Auto-find next
                    const nextSlot = findNextAvailableSlot(
                        scheduleItems.filter(i => i.id !== blockId),
                        durationMins,
                        referenceDate
                    );
                    if (!nextSlot) throw new Error('No available slot found.');
                    targetStart = nextSlot.start;
                }

                const targetEnd = addMinutes(targetStart, durationMins);

                // JUDGE THE MOVE
                const { ConflictService } = await import('@/lib/scheduling/conflict-service');
                const existingBlocks = blocks || [];
                const judgment = ConflictService.judgeChange(
                    existingBlocks,
                    { start: targetStart, end: targetEnd, id: blockId }
                );

                if (judgment.status === 'rejected') {
                    throw new Error(`Refused: ${judgment.reason}`);
                }

                if (judgment.status === 'requires_choice') {
                    // In a real agent loop, we'd return options.
                    // For this API (apply), we fail safely or "Force" if flag set.
                    throw new Error(`Conflict: ${judgment.reason} (Need user choice)`);
                }

                // If resolved, merge the move + auto-adjustments
                const moveChange = {
                    op: 'MOVE',
                    event_id: blockId,
                    new_start_ts: format(targetStart, "yyyy-MM-dd'T'HH:mm:ss"),
                    new_end_ts: format(targetEnd, "yyyy-MM-dd'T'HH:mm:ss")
                };

                const otherChanges = judgment.resolved_patch?.changes || [];

                patch = {
                    summary: `Rescheduling "${targetBlock.context || 'Task'}" to ${format(targetStart, 'HH:mm')}`,
                    affected_date: date,
                    changes: [moveChange, ...otherChanges], // Combine
                    requires_confirmation: true,
                    warnings: otherChanges.length ? ['Adjusted other blocks to fit'] : [],
                    sacrifices: [],
                    source: 'coach'
                };
                break;
            }

            case 'hide_low': {
                const toHide = (blocks || []).filter((b: any) => !b.block_type || b.block_type === 'buffer');

                if (toHide.length === 0) throw new Error('No low priority items found to hide.');

                patch = {
                    summary: `Clearing ${toHide.length} low-priority items`,
                    affected_date: date,
                    changes: toHide.map((b: any) => ({
                        op: 'HIDE',
                        event_id: b.id
                    })),
                    requires_confirmation: true,
                    warnings: ['This will remove buffers and untagged tasks.'],
                    sacrifices: [],
                    source: 'coach'
                };
                break;
            }

            default:
                // Use AI Generator with Solver context
                const aiPatch = await generateAIPatch(
                    date,
                    user_context || '',
                    scheduleItems, // Now passing typed items
                    context.userId // Now passing userId
                );
                patch = { ...aiPatch, source: 'coach' };
        }

        return apiSuccess({ patch });
    } catch (error: any) {
        console.error('Patch Generation Error:', error);
        return apiError(error.message || 'Failed to generate patch', 500);
    }
});
