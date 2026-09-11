import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { generateWeekPlan } from '@/lib/calendar/ai/plan-week';
import { format, startOfWeek, addDays } from 'date-fns';
import { SchedulingProtocol } from '@/lib/scheduling/protocol';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';
import { resolveRelativeDate } from '@/lib/calendar/relative-dates';

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
            // A malformed date here used to travel all the way into date-fns as an
            // `Invalid Date` and surface as `RangeError: Invalid time value` from
            // some unrelated `format()` call. Reject it at the door, naming the
            // value, so the failure points at the caller instead of the callee.
            // §4: a relative date word ("tomorrow", "next week", "friday") is
            // resolved here rather than 400'd. Nothing in-app sends one — every
            // internal caller formats a date first — so these arrive from an
            // LLM-generated op passing the user's own words through. The 400
            // stays for anything genuinely unparseable.
            const resolved = resolveRelativeDate(start_date, DEFAULT_TIMEZONE);
            if (!resolved) {
                console.error(
                    `[PlanWeek] Invalid start_date "${start_date}" from user=${userId} ` +
                    `ua="${context.request?.headers?.get('user-agent') ?? 'unknown'}" — rejecting.`
                );
                return apiError(`Invalid start_date: expected YYYY-MM-DD, received "${start_date}"`, 400);
            }
            if (resolved.interpreted) {
                console.log(`[PlanWeek] normalised start_date "${start_date}" → ${resolved.date} (${DEFAULT_TIMEZONE}), user=${userId}`);
            }
            weekStart = resolved.date;
        } else {
            const todayIst = new Date(`${nowInTimezone(DEFAULT_TIMEZONE).date}T00:00:00`);
            const thisMonday = startOfWeek(todayIst, { weekStartsOn: 1 });
            weekStart = format(thisMonday, 'yyyy-MM-dd');
        }

        try {
            // Inputs on the record before anything can throw — when this route
            // fails, the first question is always "what week did it think it was
            // planning?", and previously nothing answered it.
            console.log(
                `[PlanWeek] inputs: weekStart=${weekStart} (start_date=${start_date ?? 'absent → derived'}) ` +
                `mode=${mode} allowWeekend=${allowWeekend} user=${userId}`
            );

            // 3. Build context
            const calendarCtx = await buildCalendarContext(userId, supabase, weekStart);

            console.log(
                `[PlanWeek] context: goals=${calendarCtx.goals.length} ` +
                `targetWeekBlocks=${calendarCtx.schedule.target_week.length} ` +
                `overcommitted=${calendarCtx.capacity.is_overcommitted}`
            );

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

            // §5: the same per-goal shortfall the weekly review reports. A week
            // that genuinely cannot hold the goals must say so, not hand back a
            // calendar with silent gaps.
            const shortfalls = (variants[0]?.stats.goal_placements || [])
                .filter((p) => !p.already_met && p.placed_mins < p.target_mins)
                .map((p) => ({
                    goal_id: p.goal_id,
                    title: p.title,
                    target_mins: p.target_mins,
                    placed_mins: p.placed_mins,
                    short_by_mins: p.target_mins - p.placed_mins,
                    reason: p.skipped_reason || 'no window could hold it',
                }));

            // §4: deferred goals are a DECISION, not a shortfall. They must
            // not appear in goal_shortfalls or warnings — a working recovery
            // week would otherwise return a warning per deferred goal telling
            // the user the planner fell short.
            const deferredGoals = variants[0]?.stats.deferred_goals || [];

            return apiSuccess({
                plan_summary: `Generated ${options.length} schedule options for ${weekStart}.`,
                options,
                goal_shortfalls: shortfalls,
                deferred_goals: deferredGoals,
                warnings: [
                    ...(calendarCtx.capacity.is_overcommitted
                        ? ['You are overcommitted — consider reducing some goal targets.']
                        : []),
                    ...shortfalls.map(
                        (s) => `${s.title} is ${s.short_by_mins} min short this week (${s.reason}).`
                    ),
                ],
            });

        } catch (e: any) {
            // The message alone told us nothing — six words in a toast, and the
            // one place that knew the cause threw it away. Log the stack, and in
            // development hand the real message to the client so a failure is
            // diagnosable from the browser instead of from guesswork.
            const message = e?.message || String(e);
            console.error(
                `[PlanWeek] FAILED weekStart=${weekStart} mode=${mode} allowWeekend=${allowWeekend} user=${userId}\n` +
                `  ${e?.name || 'Error'}: ${message}\n${e?.stack || '(no stack)'}`
            );
            if (e?.cause) console.error('[PlanWeek] caused by:', e.cause);

            // §1: classify the cause. "Please try again." told the user nothing
            // and told us nothing — a production failure has to be diagnosable
            // from a single log line and from the response body, without
            // leaking a stack trace to the browser.
            const reason: 'no_valid_variant' | 'capacity_exhausted' | 'past_week' | 'internal_error' =
                /overlapping or malformed blocks/i.test(message) ? 'no_valid_variant'
                : /past week is refused/i.test(message) ? 'past_week'
                : /capacity|no window|unplaceable/i.test(message) ? 'capacity_exhausted'
                : 'internal_error';

            console.error(`[PlanWeek] classified reason=${reason} mode=${mode} weekStart=${weekStart}`);

            const isDev = process.env.NODE_ENV !== 'production';
            const humanReason: Record<typeof reason, string> = {
                no_valid_variant: 'every schedule option came out with overlapping blocks',
                capacity_exhausted: 'this week has no room left for the goals as configured',
                past_week: 'that week has already passed',
                internal_error: 'an internal error occurred',
            };

            return apiError(
                isDev
                    ? `Planning failed: ${message}`
                    : `Planning failed (${reason}) for ${mode} mode, week of ${weekStart}: ${humanReason[reason]}.`,
                500,
                'PLAN_WEEK_FAILED',
                // The reason, mode and week are safe to return anywhere; the
                // stack is not.
                isDev
                    ? { reason, weekStart, mode, allowWeekend, stack: e?.stack }
                    : { reason, weekStart, mode, allowWeekend }
            );
        }
    },
    { requireAuth: true, rateLimit: 'aiPlanWeek' }
);
