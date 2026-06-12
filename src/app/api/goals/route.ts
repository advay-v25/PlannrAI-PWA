import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateGoalTitle, validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { zSanitizedString, validateWithZod } from '@/lib/security/zod-validator';

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
                total_minutes: available_min_per_day + committed_min_per_day,
                used_minutes: committed_min_per_day,
                available_minutes: available_min_per_day,
                load_percentage: percentage,
                // Legacy compat
                available_min_per_day,
                committed_min_per_day,
                over_by_min_per_day,
                totalGoalMinutes: committed_min_per_day,
                percentage
            }
        });
    },
    { requireAuth: true }
);

// POST - Create a new goal or subtask
export const POST = secureApiRoute(
    async (context, body) => {
        const GoalSchema = z.object({
            title: z.string().min(1).max(200),
            category: z.enum(['mind', 'body', 'craft']),
            minutes_per_day: z.number().min(5).max(480).optional().default(30),
            days_per_week: z.number().min(1).max(7).optional().default(7),
            importance: z.enum(['low', 'medium', 'high']).optional().default('medium'),
            energy_demand: z.enum(['light', 'medium', 'heavy']).optional().default('medium'),
            parent_id: z.string().uuid().optional(),
            constraints: z.record(z.string(), z.unknown()).optional(),
            non_negotiables: z.array(z.string()).optional(),
            time_commitment_mins: z.number().optional(),
            status: z.string().optional(),
        });

        const validation = validateWithZod(GoalSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const {
            title,
            category,
            minutes_per_day,
            importance,
            parent_id,
            constraints,
            non_negotiables,
            time_commitment_mins,
        } = validation.data;

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
                title: title,
                category,
                minutes_per_day,
                days_per_week: validation.data.days_per_week,
                weekly_target_minutes: minutes_per_day * (validation.data.days_per_week || 7),
                importance,
                energy_demand: validation.data.energy_demand,
                status: validation.data.status || 'active',
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
        const UpdateGoalSchema = z.object({
            id: z.string().uuid(),
            title: z.string().min(1).max(200).optional(),
            category: z.enum(['mind', 'body', 'craft']).optional(),
            minutes_per_day: z.number().min(5).max(1440).optional(),
            days_per_week: z.number().min(1).max(7).optional(),
            importance: z.enum(['low', 'medium', 'high']).optional(),
            is_paused: z.boolean().optional(),
            status: z.string().optional(),
            weekly_target_minutes: z.number().optional(),
            energy_demand: z.string().optional(),
            constraints: z.record(z.string(), z.unknown()).optional(),
            non_negotiables: z.array(z.string()).optional(),
            time_commitment_mins: z.number().optional(),
            milestone_progress: z.number().optional(),
            sort_order: z.number().optional(),
            ai_strategy: z.unknown().optional(),
        });

        const validation = validateWithZod(UpdateGoalSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const data = validation.data;
        const updates: Record<string, unknown> = {};

        if (data.title !== undefined) updates.title = data.title;
        if (data.category !== undefined) updates.category = data.category;
        if (data.importance !== undefined) updates.importance = data.importance;
        if (data.minutes_per_day !== undefined) updates.minutes_per_day = data.minutes_per_day;
        
        if (data.is_paused !== undefined) updates.is_paused = data.is_paused;
        if (data.status !== undefined) updates.status = data.status;
        if (data.weekly_target_minutes !== undefined) updates.weekly_target_minutes = data.weekly_target_minutes;
        if (data.energy_demand !== undefined) updates.energy_demand = data.energy_demand;
        if (data.constraints !== undefined) updates.constraints = data.constraints;
        if (data.non_negotiables !== undefined) updates.non_negotiables = data.non_negotiables;
        if (data.time_commitment_mins !== undefined) updates.time_commitment_mins = data.time_commitment_mins;
        if (data.milestone_progress !== undefined) updates.milestone_progress = data.milestone_progress;
        if (data.sort_order !== undefined) updates.sort_order = data.sort_order;
        if (data.ai_strategy !== undefined) updates.ai_strategy = data.ai_strategy;

        if (Object.keys(updates).length === 0) {
            return apiError('No valid updates provided');
        }

        const supabase = await createClient();

        const { data: goal, error } = await supabase
            .from('goals')
            .update(updates)
            .eq('id', data.id)
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
                .eq('goal_id', data.id)
                .gte('date', today)
                .select('id');
            blocksRemoved = deleted?.length || 0;
            console.log(`[Goals PUT] Removed ${blocksRemoved} future blocks for paused goal ${data.id}`);
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
        const DeleteGoalSchema = z.object({
            id: z.string().uuid()
        });

        const validation = validateWithZod(DeleteGoalSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const { id } = validation.data;

        const supabase = await createClient();

        // 1. Find all subgoals to prevent orphaned calendar blocks for subgoals
        const { data: subgoals } = await supabase
            .from('goals')
            .select('id')
            .eq('parent_id', id)
            .eq('user_id', context.userId);

        const subgoalIds = subgoals?.map(g => g.id) || [];
        const allGoalIds = [id, ...subgoalIds];

        // 2. Delete all future schedule blocks associated with these goals
        const today = new Date().toISOString().split('T')[0];
        const { error: blockDeleteError } = await supabase
            .from('schedule_blocks')
            .delete()
            .eq('user_id', context.userId)
            .in('goal_id', allGoalIds)
            .gte('date', today);

        if (blockDeleteError) {
            console.error(`[Goals DELETE] Failed to delete future blocks for goal ${id}:`, blockDeleteError.message);
        }

        // 3. Delete the goal itself (cascades to subgoals in DB)
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
