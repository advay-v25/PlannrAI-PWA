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
            const [goalsRes, habitsRes, existingBlocksRes, anchorsRes, prefsRes] = await Promise.all([
                supabase.from('goals').select('id, title, category, importance, minutes_per_day, days_per_week, energy_demand, pillar')
                    .eq('user_id', userId).eq('is_paused', false),
                supabase.from('habit_stacks').select('id, name, trigger_habit, action_habit, preferred_window, action_duration_mins')
                    .eq('user_id', userId).eq('enabled', true),
                supabase.from('schedule_blocks')
                    .select('id, date, start_time, end_time, context, title, block_type, status, pillar')
                    .eq('user_id', userId)
                    .gte('date', startStr)
                    .lt('date', endStr)
                    .neq('status', 'cancelled'),
                supabase.from('commitments')
                    .select('id, title, start_time, end_time, days_of_week')
                    .eq('user_id', userId)
                    .eq('is_active', true),
                supabase.from('profile_preferences')
                    .select('sleep_start, wake_time, buffer_min, weekend_intensity, allow_weekend_work')
                    .eq('user_id', userId)
                    .maybeSingle()
            ]);

            const existingBlocks = existingBlocksRes.data || [];
            const goals = goalsRes.data || [];
            const habits = habitsRes.data || [];
            const anchors = anchorsRes.data || [];
            const prefs = prefsRes.data || {};

            // ---- CRITICAL FIX: Clear old AI-generated blocks to prevent pile-up ----
            // Only delete blocks that are still 'planned' (not done/in-progress/skipped)
            // Keep manually-created and completed blocks
            const aiBlockIds = existingBlocks
                .filter((b: any) => b.status === 'planned' && b.block_type !== 'anchor')
                .map((b: any) => b.id);

            if (aiBlockIds.length > 0) {
                await supabase
                    .from('schedule_blocks')
                    .delete()
                    .in('id', aiBlockIds);
            }

            // Re-fetch what's left (completed/in-progress blocks + anchors)
            const { data: remainingBlocks } = await supabase
                .from('schedule_blocks')
                .select('id, date, start_time, end_time, title, block_type, status, pillar')
                .eq('user_id', userId)
                .gte('date', startStr)
                .lt('date', endStr)
                .neq('status', 'cancelled');

            const keptBlocks = remainingBlocks || [];

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
                    profile: prefs,
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
                    // Show AI what blocks already exist (completed/in-progress) so it doesn't overlap
                    existing_blocks_count: keptBlocks.length,
                    existing_blocks_sample: keptBlocks.slice(0, 30).map((b: any) =>
                        `${b.date} ${b.start_time}-${b.end_time}: ${b.title || 'Untitled'} [${b.status}]`
                    ),
                    anchors: anchors.map((a: any) => ({
                        title: a.title,
                        start_time: a.start_time,
                        end_time: a.end_time,
                        days_of_week: a.days_of_week
                    }))
                }
            });

            // 5. Convert AI blocks to PatchService ops — with overlap prevention
            const aiBlocks = aiResponse?.blocks || [];
            const patchOps: any[] = [];

            // Build occupied time map per day for overlap checking
            const occupiedSlots: Record<string, { start: number, end: number }[]> = {};
            for (const b of keptBlocks) {
                const day = (b as any).date;
                if (!occupiedSlots[day]) occupiedSlots[day] = [];
                occupiedSlots[day].push({
                    start: timeToMinutes((b as any).start_time),
                    end: timeToMinutes((b as any).end_time)
                });
            }

            for (const block of aiBlocks) {
                if (!block.date || !block.start_time || !block.end_time || !block.title) continue;

                const blockStart = timeToMinutes(block.start_time);
                const blockEnd = timeToMinutes(block.end_time);

                // Skip invalid time ranges
                if (blockEnd <= blockStart) continue;

                // Check overlap with kept blocks and already-added AI blocks
                const daySlots = occupiedSlots[block.date] || [];
                const hasOverlap = daySlots.some(slot =>
                    blockStart < slot.end && blockEnd > slot.start
                );

                if (hasOverlap) continue; // Skip overlapping block

                // Find matching goal by title
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

                // Mark this slot as occupied
                if (!occupiedSlots[block.date]) occupiedSlots[block.date] = [];
                occupiedSlots[block.date].push({ start: blockStart, end: blockEnd });
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
                blocks_cleared: aiBlockIds.length,
                total_blocks: aiBlocks.length,
                blocks_skipped_overlap: aiBlocks.length - patchOps.length,
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

// Helper: convert "HH:MM" to minutes since midnight
function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
