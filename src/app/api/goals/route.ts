import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateGoalTitle, validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { GoalWritableSchema } from '@/lib/goals/schema';
import { zSanitizedString, validateWithZod } from '@/lib/security/zod-validator';
import { computeWeekCapacity, computeDayCapacities, busiestDay } from '@/lib/scheduling/capacity';

export const dynamic = 'force-dynamic';

// GET - List all goals with capacity metrics
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const { searchParams } = new URL(context.request.url);
        const parentId = searchParams.get('parent_id');

        // Parallel Fetch: Goals, Commitments (Anchors), User Preferences (if stored)
        const [goalsRes, anchorsRes, profileRes] = await Promise.all([
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
            supabase.from('commitments').select('days_of_week, start_time, end_time').eq('user_id', context.userId),
            // 3. Profile for capacity math
            supabase.from('profiles').select('sleep_start, sleep_end, wind_down_mins, morning_routine_mins, meals_per_day').eq('id', context.userId).maybeSingle()
        ]);

        if (goalsRes.error) return apiError('Failed to fetch goals', 500);

        const goals = goalsRes.data || [];
        const anchors = anchorsRes.data || [];
        const profile = profileRes.data || {};

        // --- Capacity Logic ---
        // We use the precise generator logic that accounts for sleep, meals, 
        // routines, buffers, and anchors to return an honest capacity.
        const weekCapacity = computeWeekCapacity(profile, goals, anchors);

        // §3: the weekly average hides the day that actually decides
        // feasibility — 66% across seven days can be a 130% Tuesday. Same
        // capacity model, resolved per day.
        const dayCapacities = computeDayCapacities(profile, goals, anchors);
        const busiest = busiestDay(dayCapacities);

        const available_min_per_day = Math.round(weekCapacity.availableMins / 7);
        const committed_min_per_day = Math.round(weekCapacity.targetedMins / 7);
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
                percentage,
                // §3: the day that actually decides whether the week is
                // deliverable, from the same model as the figures above.
                busiest_day: {
                    iso_day: busiest.isoDay,
                    label: busiest.label,
                    planned_minutes: busiest.plannedMins,
                    free_minutes: busiest.freeMins,
                    load_percentage: busiest.loadPercentage,
                    is_over: busiest.isOver,
                },
                days: dayCapacities,
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
            preferred_windows: z.object({
                time_of_day: z.enum(['morning', 'afternoon', 'evening', 'flexible'])
            }).nullable().optional(),
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
                preferred_windows: validation.data.preferred_windows ?? null,
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
        // §5: the SAME schema PatchService.update_goal uses. Two hand-written
        // contracts over one table is how a value one path accepts becomes a
        // value the other refuses — and a refused save with no visible error
        // reads to the user as a locked goal.
        const UpdateGoalSchema = GoalWritableSchema.extend({ id: z.string().uuid() });

        const validation = validateWithZod(UpdateGoalSchema, body);
        if (!validation.valid) {
            return apiError(validation.errors, 400);
        }

        const data = validation.data;
        const updates: Record<string, unknown> = {};

        if (data.title !== undefined) updates.title = data.title;
        // `category` and `pillar` hold the same value in this schema; letting
        // one change without the other is how they drift apart.
        if (data.category !== undefined) { updates.category = data.category; updates.pillar = data.category; }
        if (data.importance !== undefined) updates.importance = data.importance;
        if (data.minutes_per_day !== undefined) updates.minutes_per_day = data.minutes_per_day;
        // `days_per_week` was validated by the schema and then never copied into
        // `updates` — so editing it alone always failed with "No valid updates
        // provided". That is a goal that genuinely cannot be edited, and it has
        // nothing to do with the weekly review.
        if (data.days_per_week !== undefined) updates.days_per_week = data.days_per_week;
        if (data.pillar !== undefined) updates.pillar = data.pillar;
        if (data.description !== undefined) updates.description = data.description;
        if (data.priority !== undefined) updates.priority = data.priority;
        if (data.color !== undefined) updates.color = data.color;
        if (data.emoji !== undefined) updates.emoji = data.emoji;
        
        if (data.is_paused !== undefined) updates.is_paused = data.is_paused;
        if (data.status !== undefined) updates.status = data.status;
        if (data.weekly_target_minutes !== undefined) updates.weekly_target_minutes = data.weekly_target_minutes;
        if (data.energy_demand !== undefined) updates.energy_demand = data.energy_demand;
        if (data.constraints !== undefined) updates.constraints = data.constraints;
        if (data.non_negotiables !== undefined) updates.non_negotiables = data.non_negotiables;
        if (data.time_commitment_mins !== undefined) updates.time_commitment_mins = data.time_commitment_mins;
        if (data.milestone_progress !== undefined) updates.milestone_progress = data.milestone_progress;
        if (data.sort_order !== undefined) updates.sort_order = data.sort_order;
        if (data.preferred_windows !== undefined) updates.preferred_windows = data.preferred_windows;
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
            // §5: a bare "Failed to update goal" with no detail is exactly what
            // made a rejected write look like a frozen goal. Name the cause.
            console.error(`[Goals] Update rejected: ${JSON.stringify({ id: data.id, updates, error })}`);
            return apiError(`Could not save: ${error.message}`, 400);
        }

        // If paused or archived, remove future schedule blocks for this goal
        // (only 'active' goals are fetched for new-week generation, but
        // blocks already generated before the status change stick around
        // otherwise — archived goals had the same gap as paused ones).
        let blocksRemoved = 0;
        if (updates.status === 'paused' || updates.status === 'archived' || updates.is_paused === true) {
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
