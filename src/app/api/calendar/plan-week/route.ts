import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { generateWeekPlan } from '@/lib/calendar/ai/plan-week';
import { format, startOfWeek, addDays } from 'date-fns';

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

        const { start_date, mode } = validation.data;

        // 2. Determine week start (default to current week's Monday)
        let weekStart: string;
        if (start_date) {
            weekStart = start_date;
        } else {
            const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
            weekStart = format(thisMonday, 'yyyy-MM-dd');
        }

        try {
            // 3. Build context
            const calendarCtx = await buildCalendarContext(userId, supabase);

            // 4. Generate AI variants
            const variants = await generateWeekPlan(calendarCtx, weekStart, mode);

            // 5. Convert to option format expected by frontend
            const options = variants.map(v => ({
                id: v.id,
                label: v.label,
                description: v.description,
                tradeoff: v.philosophy,
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
    { requireAuth: true }
);
