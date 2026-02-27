import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfDay, addDays, format } from 'date-fns';
import { z } from 'zod';
import { safeParseISO } from '@/lib/date-safe';

// Request Schema
const PlanWeekSchema = z.object({
    start_date: z.string().optional(),
    mode: z.enum(['balanced', 'momentum', 'recovery']).default('balanced'),
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

            // ---- Determine kept blocks ----
            const aiBlockIds = existingBlocks
                .filter((b: any) => b.status === 'planned' && b.block_type !== 'anchor' && !b.is_fixed && !b.commitment_id)
                .map((b: any) => b.id);

            const keptBlocks = existingBlocks.filter((b: any) => !aiBlockIds.includes(b.id));

            // 4. Call AI Core
            const { executeAI } = await import('@/lib/ai/ai-service');

            const aiResponse = await executeAI(userId, {
                channel: 'calendar_plan_week',
                input: `Plan week starting ${startStr}. Request Mode: ${mode}. Weekend allowed: ${allow_weekend}.`,
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

            // 5. Return Options directly to User Interface instead of auto-applying
            const options = aiResponse?.options || [];
            if (options.length === 0) {
                return apiSuccess({
                    plan_summary: "Planning failed to generate options.",
                    options: []
                });
            }

            // Decorate ops with actual UUIDs if needed, or pass through generic Canonical patches
            // For now, we trust the AI output to match the CanonicalPatchSchema requirement.

            return apiSuccess({
                plan_summary: aiResponse?.plan_summary || 'Analysis complete.',
                options: options,
                warnings: aiResponse?.warnings || [],
                donna_note: aiResponse?.donna_note
            });

        } catch (e: any) {
            console.error("[PlanWeek] Unhandled Logic Error:", e);
            return apiError(`Planning failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);
