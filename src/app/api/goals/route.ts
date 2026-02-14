import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateGoalTitle, validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - List all goals with subtasks
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const { searchParams } = new URL(context.request.url);
        const parentId = searchParams.get('parent_id');

        // Build query
        let query = supabase
            .from('goals')
            .select('*')
            .eq('user_id', context.userId);

        if (parentId === 'null' || parentId === '') {
            // Get top-level goals only
            query = query.is('parent_id', null);
        } else if (parentId) {
            // Get subtasks of a specific goal
            query = query.eq('parent_id', parentId);
        }

        const { data: goals, error } = await query
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        console.log(`[Goals GET] userId: ${context.userId}, found: ${goals?.length}, error: ${error?.message}`);

        if (error) {
            return apiError('Failed to fetch goals', 500);
        }

        return apiSuccess({ goals });
    },
    { requireAuth: true }
);

// POST - Create a new goal or subtask
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['title', 'category']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`)
        }

        const {
            title,
            category,
            minutes_per_day = 30,
            importance = 'medium',
            parent_id,
            constraints,
            non_negotiables,
            time_commitment_mins,
        } = body as {
            title: string;
            category: string;
            minutes_per_day?: number;
            importance?: string;
            parent_id?: string;
            constraints?: Record<string, unknown>;
            non_negotiables?: string[];
            time_commitment_mins?: number;
        };

        // Validate title
        const titleValidation = validateGoalTitle(title);
        if (!titleValidation.valid) {
            return apiError(titleValidation.errors.join(', '));
        }

        // Validate category
        if (!['mind', 'body', 'future', 'craft'].includes(category)) {
            return apiError('Category must be mind, body, craft, or future');
        }

        // Validate importance
        if (!['low', 'medium', 'high'].includes(importance)) {
            return apiError('Importance must be low, medium, or high');
        }

        // Validate minutes
        if (minutes_per_day < 5 || minutes_per_day > 480) {
            return apiError('Minutes per day must be between 5 and 480');
        }

        const supabase = await createClient();

        // If parent_id provided, verify it exists and belongs to user
        if (parent_id) {
            const { data: parent, error: parentError } = await supabase
                .from('goals')
                .select('id')
                .eq('id', parent_id)
                .eq('user_id', context.userId)
                .single();

            if (parentError || !parent) {
                return apiError('Parent goal not found', 404);
            }
        }

        // Get sort order for new goal
        const { data: lastGoal } = await supabase
            .from('goals')
            .select('sort_order')
            .eq('user_id', context.userId)
            .eq('parent_id', parent_id || null)
            .order('sort_order', { ascending: false })
            .limit(1)
            .single();

        const sort_order = (lastGoal?.sort_order ?? -1) + 1;

        const { data: goal, error } = await supabase
            .from('goals')
            .insert({
                user_id: context.userId,
                title: titleValidation.sanitized,
                category,
                minutes_per_day,
                importance,
                parent_id: parent_id || null,
                constraints: constraints || {},
                non_negotiables: non_negotiables || [],
                time_commitment_mins,
                sort_order,
            })
            .select()
            .single();

        if (goal) {
            console.log(`[Goals POST] Created goal ${goal.id} for user ${context.userId}`);
        } else if (error) {
            console.error(`[Goals POST] Failed to create goal for user ${context.userId}: ${error.message}`);
        }

        if (error) {
            return apiError('Failed to create goal', 500);
        }

        // Trigger Reactive Scheduling (One Engine)
        try {
            const { ReactiveGoalService } = await import('@/lib/services/reactive-goal-service');
            await ReactiveGoalService.onGoalUpdated(context.userId, goal.id, supabase);
        } catch (scheduleError) {
            console.error('Reactive Scheduling Failed:', scheduleError);
        }

        return apiSuccess({ goal }, 201);
    },
    { requireAuth: true, auditAction: 'goal_create' }
);

// PUT - Update a goal
export const PUT = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const {
            id,
            title,
            category,
            minutes_per_day,
            importance,
            is_paused,
            constraints,
            non_negotiables,
            time_commitment_mins,
            milestone_progress,
            sort_order,
        } = body as {
            id: string;
            title?: string;
            category?: string;
            minutes_per_day?: number;
            importance?: string;
            is_paused?: boolean;
            constraints?: Record<string, unknown>;
            non_negotiables?: string[];
            time_commitment_mins?: number;
            milestone_progress?: number;
            sort_order?: number;
        };

        const updates: Record<string, unknown> = {};

        if (title !== undefined) {
            const titleValidation = validateGoalTitle(title);
            if (!titleValidation.valid) {
                return apiError(titleValidation.errors.join(', '));
            }
            updates.title = titleValidation.sanitized;
        }

        if (category !== undefined) {
            if (!['mind', 'body', 'future', 'craft'].includes(category)) {
                return apiError('Category must be mind, body, craft, or future');
            }
            updates.category = category;
        }

        if (importance !== undefined) {
            if (!['low', 'medium', 'high'].includes(importance)) {
                return apiError('Importance must be low, medium, or high');
            }
            updates.importance = importance;
        }

        if (minutes_per_day !== undefined) {
            if (minutes_per_day < 5 || minutes_per_day > 480) {
                return apiError('Minutes per day must be between 5 and 480');
            }
            updates.minutes_per_day = minutes_per_day;
        }

        if (is_paused !== undefined) updates.is_paused = is_paused;
        if (constraints !== undefined) updates.constraints = constraints;
        if (non_negotiables !== undefined) updates.non_negotiables = non_negotiables;
        if (time_commitment_mins !== undefined) updates.time_commitment_mins = time_commitment_mins;
        if (milestone_progress !== undefined) updates.milestone_progress = milestone_progress;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        if (Object.keys(updates).length === 0) {
            return apiError('No valid updates provided');
        }

        const supabase = await createClient();

        const { data: goal, error } = await supabase
            .from('goals')
            .update(updates)
            .eq('id', id)
            .eq('user_id', context.userId)
            .select()
            .single();

        if (error) {
            return apiError('Failed to update goal', 500);
        }

        // If paused, remove future schedule blocks for this goal
        let blocksRemoved = 0;
        if (updates.status === 'paused' || updates.is_paused === true) {
            const today = new Date().toISOString().split('T')[0];
            const { data: deleted } = await supabase
                .from('schedule_blocks')
                .delete()
                .eq('user_id', context.userId)
                .eq('goal_id', id)
                .gte('date', today)
                .select('id');
            blocksRemoved = deleted?.length || 0;
            console.log(`[Goals PUT] Removed ${blocksRemoved} future blocks for paused goal ${id}`);
        }

        // Trigger Reactive Scheduling (One Engine)
        try {
            const { ReactiveGoalService } = await import('@/lib/services/reactive-goal-service');
            await ReactiveGoalService.onGoalUpdated(context.userId, goal.id, supabase);
        } catch (scheduleError) {
            console.error('Reactive Scheduling Failed:', scheduleError);
        }

        return apiSuccess({ goal, blocksRemoved, scheduleChanged: true });
    },
    { requireAuth: true, auditAction: 'goal_update' }
);

// DELETE - Delete a goal (cascades to subtasks)
export const DELETE = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { id } = body as { id: string };

        const supabase = await createClient();

        const { error } = await supabase
            .from('goals')
            .delete()
            .eq('id', id)
            .eq('user_id', context.userId);

        if (error) {
            return apiError('Failed to delete goal', 500);
        }

        return apiSuccess({ success: true });
    },
    { requireAuth: true, auditAction: 'goal_delete' }
);
