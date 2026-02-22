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
            // 3. Fetch Deep Context
            const { buildFeatureContext } = await import('@/lib/services/feature-context');
            const featureCtx = await buildFeatureContext(userId, supabase, {
                includeChatHistory: true,
                includeRecentDumps: true,
                includeHabitStacks: true,
                weekDays: 7
            });

            const existingBlocks = featureCtx.schedule;
            const goals = featureCtx.goals;
            const habits = featureCtx.habitStacks || [];
            const anchors = featureCtx.anchors;
            const prefs = featureCtx.preferences;

            // ---- Safely determine kept blocks (excluding blocks to be replaced) ----
            const aiBlockIds = existingBlocks
                .filter((b: any) => b.status === 'planned' && b.block_type !== 'anchor' && !b.is_fixed && !b.commitment_id)
                .map((b: any) => b.id);

            const keptBlocks = existingBlocks.filter((b: any) => !aiBlockIds.includes(b.id));

            // 4. Call AI
            const { executeAI } = await import('@/lib/ai/ai-service');

            const aiResponse = await executeAI(userId, {
                channel: 'calendar_plan_week',
                input: `Plan week starting ${startStr}. Mode: ${mode}. Weekend allowed: ${allow_weekend}. Ensure 0% overlap with existing kept_blocks and anchors. NEVER modify, overlay, or delete locked/anchor blocks.`,
                context: {
                    week_start: startStr,
                    week_end: endStr,
                    mode,
                    allow_weekend,
                    profile: prefs,
                    user_state: featureCtx.userState,
                    capacity: featureCtx.capacity,
                    recent_brain_dumps: featureCtx.recentDumps,
                    recent_coach_chats: featureCtx.chatHistory,
                    goals: goals.map((g: any) => ({
                        id: g.id,
                        title: g.title,
                        category: g.category,
                        importance: g.importance,
                        minutes_per_day: g.minutes_per_day,
                        days_per_week: g.days_per_week,
                        energy_demand: g.energy_demand,
                        pillar: g.pillar,
                        ai_plan: g.ai_plan
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

            // CRITICAL: Prevent wipeout on AI fallback
            if (aiBlocks.length === 0) {
                return apiSuccess({
                    plan_summary: aiResponse?.plan_summary || 'Week planning temporarily unavailable.',
                    blocks_created: 0,
                    blocks_cleared: 0,
                    total_blocks: 0,
                    blocks_skipped_overlap: 0,
                    undo_token: null,
                    donna_note: aiResponse?.donna_note || 'AI planning is offline — add blocks manually for now.'
                });
            }

            // Only clear old blocks now that we know we have new ones to replace them
            if (aiBlockIds.length > 0) {
                await supabase
                    .from('schedule_blocks')
                    .delete()
                    .in('id', aiBlockIds);
            }

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

                // Auto-repair overlap by shifting forward in 15-min increments
                const duration = blockEnd - blockStart;
                let currentStart = blockStart;
                let currentEnd = blockEnd;
                let hasOverlap = true;
                const daySlots = occupiedSlots[block.date] || [];

                while (hasOverlap && currentEnd <= 1380) { // Max 23:00
                    hasOverlap = daySlots.some((slot: any) =>
                        currentStart < slot.end && currentEnd > slot.start
                    );
                    if (hasOverlap) {
                        currentStart += 15;
                        currentEnd += 15;
                    }
                }

                if (hasOverlap) continue; // Skip if it couldn't fit by 23:00

                // Format back to HH:MM
                const formatTime = (mins: number) => {
                    const h = Math.floor(mins / 60).toString().padStart(2, '0');
                    const m = (mins % 60).toString().padStart(2, '0');
                    return `${h}:${m}`;
                };

                const finalStartTime = formatTime(currentStart);
                const finalEndTime = formatTime(currentEnd);

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
                        start_time: finalStartTime,
                        end_time: finalEndTime,
                        title: block.title,
                        block_type: block.block_type || 'task',
                        goal_id: goalId,
                        status: 'planned'
                    }
                });

                // Mark this slot as occupied
                if (!occupiedSlots[block.date]) occupiedSlots[block.date] = [];
                occupiedSlots[block.date].push({ start: currentStart, end: currentEnd });
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
