import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfDay, addDays, format } from 'date-fns';
import { z } from 'zod';
import { safeParseISO } from '@/lib/date-safe';
import { PatchService } from '@/lib/services/patch-service';

// Request Schema
const PlanWeekSchema = z.object({
    start_date: z.string().optional(),
    mode: z.enum(['balanced', 'intense', 'recovery']).default('balanced'),
    allow_weekend: z.boolean().default(false)
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        // 1. Zod Validation
        const validation = PlanWeekSchema.safeParse(body);
        if (!validation.success) {
            return apiError(`Invalid Input: ${validation.error.message}`, 400);
        }

        const { start_date, mode, allow_weekend } = validation.data;

        // 2. Safe Date Parsing
        let startDate: Date;
        if (start_date) {
            const parsed = safeParseISO(start_date);
            if (!parsed) return apiError("Invalid start_date format. Expected ISO string.", 400);
            startDate = startOfDay(parsed);
        } else {
            startDate = startOfDay(new Date());
        }

        const days = 7;
        const endDate = addDays(startDate, days);
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        try {
            // 3. Fetch Full Context
            const [goalsRes, habitsRes, existingBlocksRes, anchorsRes] = await Promise.all([
                supabase.from('goals').select('id, title, category, importance, minutes_per_day, days_per_week, energy_demand, pillar')
                    .eq('user_id', userId).eq('is_paused', false),
                supabase.from('habit_stacks').select('id, name, trigger_habit, action_habit, preferred_window, action_duration_mins')
                    .eq('user_id', userId).eq('enabled', true),
                supabase.from('schedule_blocks')
                    .select('id, date, start_time, end_time, context, title, block_type, status')
                    .eq('user_id', userId)
                    .gte('date', startStr)
                    .lt('date', endStr),
                supabase.from('commitments')
                    .select('id, title, start_time, end_time, days_of_week')
                    .eq('user_id', userId)
                    .eq('is_active', true)
            ]);

            const existingBlocks = existingBlocksRes.data || [];
            const goals = goalsRes.data || [];
            const habits = habitsRes.data || [];
            const anchors = anchorsRes.data || [];

            // 4. Call AI
            const { executeAI } = await import('@/lib/ai/ai-service');

            const aiResponse = await executeAI(userId, {
                channel: 'calendar_plan_week',
                input: `Plan week starting ${startStr}. Mode: ${mode}. Weekend allowed: ${allow_weekend}`,
                context: {
                    week_start: startStr,
                    week_end: endStr,
                    mode,
                    allow_weekend,
                    goals: goals.map((g: any) => ({
                        id: g.id,
                        title: g.title,
                        category: g.category,
                        importance: g.importance,
                        minutes_per_day: g.minutes_per_day,
                        days_per_week: g.days_per_week,
                        energy_demand: g.energy_demand,
                        pillar: g.pillar
                    })),
                    existing_habits: habits.map((h: any) => ({
                        name: h.name || h.trigger_habit,
                        preferred_window: h.preferred_window,
                        duration_mins: h.action_duration_mins
                    })),
                    existing_blocks_count: existingBlocks.length,
                    existing_blocks_sample: existingBlocks.slice(0, 30).map((b: any) =>
                        `${b.date} ${b.start_time}-${b.end_time}: ${b.title || b.context || 'Untitled'} [${b.status}]`
                    ),
                    anchors: anchors.map((a: any) => ({
                        title: a.title,
                        start_time: a.start_time,
                        end_time: a.end_time,
                        days_of_week: a.days_of_week
                    }))
                }
            });

            // 5. Convert AI blocks to PatchService ops
            const aiBlocks = aiResponse?.blocks || [];
            const patchOps: any[] = [];

            for (const block of aiBlocks) {
                // Find matching goal by title if provided
                let goalId = null;
                if (block.goal_title) {
                    const matchGoal = goals.find((g: any) =>
                        g.title.toLowerCase() === block.goal_title.toLowerCase()
                    );
                    if (matchGoal) goalId = matchGoal.id;
                }

                patchOps.push({
                    op: 'create_event',
                    event: {
                        date: block.date,
                        start_time: block.start_time,
                        end_time: block.end_time,
                        title: block.title,
                        block_type: block.block_type || 'task',
                        goal_id: goalId,
                        status: 'planned'
                    }
                });
            }

            // 6. Apply via PatchService (with undo!)
            let undoToken: string | null = null;
            let blocksCreated = 0;

            if (patchOps.length > 0) {
                const result = await PatchService.applyPatch(
                    userId,
                    { ops: patchOps, reason: `Plan week: ${startStr} (${mode})`, undoable: true },
                    supabase,
                    'calendar_plan_week'
                );
                undoToken = result.undo_token;
                blocksCreated = result.changes;
            }

            return apiSuccess({
                plan_summary: aiResponse?.plan_summary || 'Week planned.',
                blocks_created: blocksCreated,
                total_blocks: aiBlocks.length,
                undo_token: undoToken,
                donna_note: aiResponse?.donna_note || 'Your week is planned!'
            });

        } catch (e: any) {
            console.error("[PlanWeek] Unhandled Logic Error:", e);
            return apiError(`Planning failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);
