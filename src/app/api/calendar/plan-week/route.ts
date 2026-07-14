import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { generateWeekPlan } from '@/lib/calendar/ai/plan-week';
import { format, startOfWeek, addDays } from 'date-fns';
import { SchedulingProtocol } from '@/lib/scheduling/protocol';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PlanWeekSchema = z.object({
    start_date: z.string().optional(),
    mode: z.enum(['balanced', 'momentum', 'recovery']).default('balanced'),
    allow_weekend: z.boolean().default(false),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        // 1. Validate
        const validation = PlanWeekSchema.safeParse(body);
        if (!validation.success) {
            return apiError(`Invalid input: ${validation.error.message}`, 400);
        }

        const { start_date, mode, allow_weekend } = validation.data;
        const allowWeekend = allow_weekend;

        // 2. Determine week start (default to current week's Monday, computed in
        // the app's default timezone rather than the server's local clock)
        let weekStart: string;
        if (start_date) {
            weekStart = start_date;
        } else {
            const todayIst = new Date(`${nowInTimezone(DEFAULT_TIMEZONE).date}T00:00:00`);
            const thisMonday = startOfWeek(todayIst, { weekStartsOn: 1 });
            weekStart = format(thisMonday, 'yyyy-MM-dd');
        }

        try {
            // 3. Build context
            const calendarCtx = await buildCalendarContext(userId, supabase);

            // 3b. SCHEDULING PROTOCOL: mode is always explicit from the client — the
            // Plan Week modal requires an active selection (with an energy-based
            // suggestion banner already nudging the user beforehand) before Generate
            // can be clicked, so there's no remaining "auto-select" case here. Look up
            // the canonical config for that mode directly — no energy/mood
            // re-derivation, so it can never silently diverge from what was picked.
            const effectiveMode = mode;
            const modeConfig = SchedulingProtocol.getModeConfig(effectiveMode);

            console.log(`[PlanWeek] Mode: ${effectiveMode}`);

            // 4. Generate AI variants. bufferMinutes is intentionally left unset —
            // generateWeekPlan's own getBufferMinutes() has per-variant granularity
            // (e.g. Recovery's "Weekend Shift" vs "Spaced Mindfulness" use different
            // buffers) that a single flat number computed here cannot express.
            const variants = await generateWeekPlan(calendarCtx, weekStart, effectiveMode, allowWeekend, {
                maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
                maxDeepWorkMins: modeConfig.maxDeepWorkMins,
            });

            // 5. Convert to option format expected by frontend
            const options = variants.map(v => ({
                id: v.id,
                label: v.label,
                description: v.description,
                tradeoff: v.philosophy,
                analysis: {
                    unscheduled: v.stats.unscheduled_minutes,
                    total_hours: v.stats.total_hours,
                    days_with_work: v.stats.days_with_work,
                },
                patch: {
                    ops: v.blocks.map(b => ({
                        op: 'create_event' as const,
                        payload: {
                            date: b.date,
                            start_time: b.start_time,
                            end_time: b.end_time,
                            title: b.title,
                            block_type: b.block_type,
                            goal_id: b.goal_id || null,
                            pillar: b.pillar || null,
                            status: 'planned',
                            checklist: b.checklist || null,
                        }
                    })),
                    undoable: true,
                    reason: `Plan Week: ${v.label}`,
                },
            }));

            return apiSuccess({
                plan_summary: `Generated ${options.length} schedule options for ${weekStart}.`,
                options,
                warnings: calendarCtx.capacity.is_overcommitted
                    ? ['You are overcommitted — consider reducing some goal targets.']
                    : [],
            });

        } catch (e: any) {
            console.error('[PlanWeek] Error:', e);
            return apiError(`Planning failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true, rateLimit: 'aiPlanWeek' }
);
