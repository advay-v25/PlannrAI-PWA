import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateGoalTitle, validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - List all goals with capacity metrics
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const { searchParams } = new URL(context.request.url);
        const parentId = searchParams.get('parent_id');

        // Parallel Fetch: Goals, Commitments (Anchors), User Preferences (if stored)
        const [goalsRes, anchorsRes] = await Promise.all([
            // 1. Goals
            (async () => {
                let query = supabase
                    .from('goals')
                    .select('*')
                    .eq('user_id', context.userId);

                if (parentId === 'null' || parentId === '') {
                    query = query.is('parent_id', null);
                } else if (parentId) {
                    query = query.eq('parent_id', parentId);
                }
                return query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
            })(),
            // 2. Anchors (Commitments)
            supabase.from('commitments').select('days_of_week, start_time, end_time').eq('user_id', context.userId)
        ]);

        if (goalsRes.error) return apiError('Failed to fetch goals', 500);

        const goals = goalsRes.data || [];
        const anchors = anchorsRes.data || [];

        // --- Capacity Logic ---
        // 1. Available Minutes Calculation
        // Assumptions: Awake 16h (960m), Meals 3x30m (90m), Buffer 60m = Total deductions ~150m
        // Base Available = 960 - 150 = 810m
        // Anchors deduction = Average daily minutes of fixed commitments

        let weeklyAnchorMinutes = 0;
        anchors.forEach((a: any) => {
            const start = new Date(`1970-01-01T${a.start_time}`);
            const end = new Date(`1970-01-01T${a.end_time}`);
            const duration = (end.getTime() - start.getTime()) / 60000;
            const daysCount = Array.isArray(a.days_of_week) ? a.days_of_week.length : 0;
            weeklyAnchorMinutes += (duration * daysCount);
        });

        const avgDailyAnchorMinutes = Math.round(weeklyAnchorMinutes / 7);
        const baseAvailable = 810; // 13.5 hours active time logic
        const available_min_per_day = Math.max(0, baseAvailable - avgDailyAnchorMinutes);

        // 2. Committed Minutes Calculation
        // Sum of active goals
        let committed_min_per_day = 0;
        goals.forEach((g: any) => {
            if (g.status === 'paused' || g.is_paused) return; // Skip paused

            let dailyMins = 0;
            if (g.minutes_per_day) {
                // If specific days aren't set, assume 7? Or use days_per_week
                const days = g.days_per_week || 7;
                // Average out: (mins * days) / 7
                dailyMins = (g.minutes_per_day * days) / 7;
            }
            committed_min_per_day += dailyMins;
        });

        committed_min_per_day = Math.round(committed_min_per_day);
        const over_by_min_per_day = Math.max(0, committed_min_per_day - available_min_per_day);
        const percentage = available_min_per_day > 0 ? Math.round((committed_min_per_day / available_min_per_day) * 100) : 0;

        return apiSuccess({
            goals,
            capacity: {
                available_min_per_day,
                committed_min_per_day,
                over_by_min_per_day,
                totalGoalMinutes: committed_min_per_day, // Legacy compat
                percentage // Legacy compat
            }
        });
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
        // @ts-ignore - Dynamic field
        if (body.ai_strategy !== undefined) updates.ai_strategy = body.ai_strategy;

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
