import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

// GET - List schedule blocks for a date range
export const GET = secureApiRoute(
    async (context) => {
        const url = new URL(context.request.url);
        const startDate = url.searchParams.get('start');
        const endDate = url.searchParams.get('end');

        if (!startDate || !endDate) {
            return apiError('Start and end dates are required');
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return apiError('Invalid date format. Use YYYY-MM-DD');
        }

        const supabase = await createClient();

        const { data: blocks, error } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(title, category)')
            .eq('user_id', context.userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) {
            return apiError('Failed to fetch schedule blocks', 500);
        }

        // V5: Anchors are materialized in DB via Triggers. No runtime merging needed.
        return apiSuccess({ blocks: blocks || [] });
    },
    { requireAuth: true }
);

// POST - Create a schedule block
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['date', 'start_time', 'end_time']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { date, start_time, end_time, goal_id, context: blockContext } = body as {
            date: string;
            start_time: string;
            end_time: string;
            goal_id?: string;
            context?: string;
        };

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return apiError('Invalid date format. Use YYYY-MM-DD');
        }

        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
            return apiError('Invalid time format. Use HH:MM');
        }

        // Validate time logic (End > Start)
        if (end_time <= start_time) {
            return apiError('End time must be after start time');
        }

        const supabase = await createClient();

        try {
            const { CalendarEngine } = await import('@/lib/calendar/calendar-engine');
            const block = await CalendarEngine.addBlock(context.userId, {
                date,
                start_time,
                end_time,
                goal_id: goal_id || null,
                context: blockContext || null,
            }, supabase);

            return apiSuccess({ block }, 201);
        } catch (e: any) {
            return apiError(e.message, 400); // 400 for conflict/validation errors
        }
    },
    { requireAuth: true, auditAction: 'schedule_create' }
);

// PUT - Update a schedule block (mainly for status)
export const PUT = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { id, status, context: blockContext } = body as {
            id: string;
            status?: string;
            context?: string;
        };

        const updates: Record<string, unknown> = {};

        if (status !== undefined) {
            if (!['planned', 'done', 'partial', 'missed'].includes(status)) {
                return apiError('Status must be planned, done, partial, or missed');
            }
            updates.status = status;
        }

        if (blockContext !== undefined) {
            updates.context = blockContext;
        }

        if (Object.keys(updates).length === 0) {
            return apiError('No valid updates provided');
        }

        const supabase = await createClient();

        try {
            // Use V5 Engine
            const { CalendarEngine } = await import('@/lib/calendar/calendar-engine');
            const block = await CalendarEngine.updateBlock(context.userId, id, updates, supabase);

            // Phase 3: Behavior Memory & Persistence
            // 1. Behavior (Fire and forget)
            if (updates.status && block) {
                const actionMap: Record<string, 'complete' | 'miss'> = {
                    'done': 'complete',
                    'missed': 'miss'
                };
                const action = actionMap[updates.status as string];

                if (action) {
                    const { BehaviorService } = await import('@/lib/services/behavior-service');
                    BehaviorService.record(context.userId, {
                        action_type: action,
                        event_id: id,
                        meta: {
                            goal_id: block.goal_id,
                            block_title: block.title || block.goal?.title,
                            timestamp: new Date().toISOString()
                        }
                    }).catch(err => console.error('Failed to record behavior:', err));
                }
            }

            return apiSuccess({ block });

        } catch (e: any) {
            return apiError(e.message, 400);
        }
    },
    { requireAuth: true, auditAction: 'schedule_update' }
);

// DELETE - Delete a schedule block
export const DELETE = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { id } = body as { id: string };

        const supabase = await createClient();

        try {
            const { CalendarEngine } = await import('@/lib/calendar/calendar-engine');
            await CalendarEngine.deleteBlock(context.userId, id, supabase);

            // Phase 3: Behavior Memory
            const { BehaviorService } = await import('@/lib/services/behavior-service');
            BehaviorService.record(context.userId, {
                action_type: 'delete',
                event_id: id,
                meta: { timestamp: new Date().toISOString() }
            }).catch(err => console.error('Failed to record behavior:', err));

            return apiSuccess({ success: true });
        } catch (e: any) {
            return apiError(e.message, 400);
        }
    },
    { requireAuth: true, auditAction: 'schedule_delete' }
);
