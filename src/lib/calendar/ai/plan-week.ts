/**
 * 🗓️ PLANNRAI — PLAN WEEK AI
 * Generates 3 weekly schedule variants using AI.
 * Falls back to deterministic schedule if AI fails.
 */

import { callAI } from '@/lib/ai/unified-client';
import type { CalendarContext, ScheduleBlock } from '@/lib/calendar/context-builder';
import { addDays, format, parseISO } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────

export interface WeekPlanVariant {
    id: string;
    label: string;
    description: string;
    philosophy: string;
    blocks: PlanBlock[];
    stats: {
        total_blocks: number;
        total_hours: number;
        days_with_work: number;
    };
}

export interface PlanBlock {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    block_type: string;
    goal_id?: string;
    pillar?: string;
    checklist?: Array<{ text: string }>;
}

// ── Utilities ────────────────────────────────────────────────────

function calculateWindDown(ctx: CalendarContext): string {
    const sleepMins = timeToMinutes(ctx.user.sleep_start);
    const windDownStart = sleepMins - (ctx.user.wind_down_mins || 30);
    const h = Math.floor((windDownStart + 1440) % 1440 / 60);
    const m = (windDownStart + 1440) % 1440 % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** Maps AI-generated block_type values to DB-allowed constraint values */
function normalizeBlockType(type: string): string {
    const map: Record<string, string> = {
        'focus': 'goal', 'body': 'goal', 'mind': 'goal', 'craft': 'goal',
        'task': 'flex', 'break': 'buffer', 'free': 'buffer', 'transition': 'buffer',
        'exercise': 'goal', 'work': 'goal', 'deep_work': 'goal',
        'admin': 'flex', 'personal': 'flex',
    };
    const allowed = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];
    if (allowed.includes(type)) return type;
    return map[type] || 'flex';
}

/** Enforces strict flow state rules: zero overlaps and alternating pillars. */
function enforceFlowState(blocks: PlanBlock[], commitments: any[]): PlanBlock[] {
    const timeToMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const minToTime = (m: number) => {
        const h = Math.floor(m / 60) % 24;
        const ms = m % 60;
        return `${h.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
    };

    // Group blocks by date
    const blocksByDate = blocks.reduce((acc, b) => {
        if (!acc[b.date]) acc[b.date] = [];
        acc[b.date].push(b);
        return acc;
    }, {} as Record<string, PlanBlock[]>);

    const finalBlocks: PlanBlock[] = [];

    // Process day by day to fix flow
    for (const [date, dayBlocks] of Object.entries(blocksByDate)) {
        // Sort blocks chronologically
        dayBlocks.sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time));

        // Get commitments for this date for buffer checking
        const dayOfWeek = new Date(date + 'T12:00:00').getDay();
        const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
        const dayCommitments = commitments.filter(c => (c.days_of_week || []).includes(isoDay));

        let processedDay: PlanBlock[] = [];
        let lastPillar: string | null = null;
        let lastEndTime = 0;

        for (let i = 0; i < dayBlocks.length; i++) {
            let b = { ...dayBlocks[i] };
            let bStart = timeToMin(b.start_time);
            let duration = timeToMin(b.end_time) - bStart;

            // 1. Force Alternate Pillars (Insert Buffer if needed)
            if (b.block_type === 'goal' && b.pillar) {
                if (b.pillar === lastPillar) {
                    // Inject a 15-min buffer block
                    const bufferStart = Math.max(lastEndTime, bStart - 15);
                    processedDay.push({
                        date: b.date,
                        start_time: minToTime(bufferStart),
                        end_time: minToTime(bufferStart + 15),
                        title: 'Flow Transition',
                        block_type: 'buffer',
                    });
                    lastEndTime = bufferStart + 15;
                    bStart = Math.max(bStart, lastEndTime);
                }
                lastPillar = b.pillar;
            } else if (b.block_type !== 'buffer') {
                lastPillar = null; // Reset pillar constraint if we hit a meal/break/etc
            }

            // 2. Prevent Overlap with previous blocks
            if (bStart < lastEndTime) {
                bStart = lastEndTime; // Shift start time down
            }

            // 3. Prevent Overlap with Commitments (Anchor 30-min buffer)
            for (const cmt of dayCommitments) {
                const cStart = timeToMin(cmt.start_time);
                const cEnd = timeToMin(cmt.end_time);

                // If block falls within the commitment + 30m buffer zone, push it after
                if (bStart < cEnd + 30 && bStart + duration > cStart - 30) {
                    bStart = cEnd + 30;
                }
            }

            // Apply shifted times
            b.start_time = minToTime(bStart);
            b.end_time = minToTime(bStart + duration);

            processedDay.push(b);
            lastEndTime = bStart + duration;
        }

        finalBlocks.push(...processedDay);
    }

    return finalBlocks;
}

// ── Main Function ────────────────────────────────────────────────

export async function generateWeekPlan(
    context: CalendarContext,
    weekStartDate: string,
    mode: 'balanced' | 'momentum' | 'recovery' = 'balanced'
): Promise<WeekPlanVariant[]> {
    const weekEndDate = format(addDays(parseISO(weekStartDate), 6), 'yyyy-MM-dd');
    const windDown = calculateWindDown(context);

    // ── Build Prompt ────────────────────────────────────────────

    const systemPrompt = `You are PlannrAI's calendar scheduling AI. Generate realistic weekly schedules.

CRITICAL RULES:
1. NEVER schedule during sleep hours (${context.user.sleep_start} to ${context.user.sleep_end})
2. Wind-down starts at ${windDown} — NO work after this time
3. NEVER schedule over existing commitments (they are LOCKED and FIXED)
4. Include meals: Breakfast ~8:00 (30min), Lunch ~12:30 (45min), Dinner ~19:00 (45min)
5. Add 15min buffers between different block types
6. Distribute goals across Mon-Fri, don't cluster all on one day
7. Weekend should be light or free
8. Each goal block should be 30-90 minutes max
9. All times in HH:MM format (24-hour)
10. All dates in YYYY-MM-DD format
11. FLOW STATE: NEVER schedule two goals of the SAME PILLAR consecutively. You MUST alternate pillars (e.g., MIND -> BODY -> CRAFT) or insert a BREAK/BUFFER to maintain flow.
12. ZERO OVERLAP: NEVER allow multiple blocks to exist at the exact same start_time. Every block MUST have a distinct, non-overlapping time slot.
13. CHECKLIST SYNC: For every 'goal' block you schedule, you MUST examine its provided 'AI Strategy' to generate a realistic 2-3 item 'checklist'. Extract the most immediate actionable steps from the strategy.

You MUST return valid JSON with exactly 3 variants.`;

    const goalsText = context.goals.length > 0
        ? context.goals.map(g =>
            `  - ${g.title} (${g.pillar.toUpperCase()}, ${g.energy_demand} energy): ${g.weekly_target_minutes}min/week (~${Math.round(g.weekly_target_minutes / 60 * 10) / 10}h), ID: ${g.id}\n    AI Strategy: ${g.ai_strategy ? JSON.stringify(g.ai_strategy) : 'None'}`
        ).join('\n')
        : '  (No goals set — generate suggested focus blocks)';

    const commitmentsText = context.commitments.length > 0
        ? context.commitments.map(c =>
            `  - ${c.title}: ${c.start_time}-${c.end_time} on ${(c.days_of_week || []).join(', ')}`
        ).join('\n')
        : '  (No fixed commitments)';

    const existingBlocksText = context.schedule.this_week.length > 0
        ? context.schedule.this_week.slice(0, 20).map(b =>
            `  - ${b.date} ${b.start_time}-${b.end_time}: ${b.title} [${b.status}]`
        ).join('\n')
        : '  (No existing blocks this week)';

    const userPrompt = `
GENERATE WEEKLY SCHEDULE

USER: ${context.user.first_name}
WEEK: ${weekStartDate} (Monday) to ${weekEndDate} (Sunday)
PLANNING MODE: ${mode.toUpperCase()}

SLEEP: ${context.user.sleep_end} wake → ${windDown} wind-down → ${context.user.sleep_start} sleep

GOALS TO SCHEDULE:
${goalsText}

FIXED COMMITMENTS (DO NOT MOVE):
${commitmentsText}

EXISTING BLOCKS (for reference):
${existingBlocksText}

CAPACITY:
- Daily awake: ${context.capacity.daily_awake_hours}h
- Weekly available: ${context.capacity.weekly_available_hours}h
- Already committed: ${context.capacity.weekly_committed_hours}h
- Goals need: ${context.capacity.weekly_goal_hours_needed}h
${context.capacity.is_overcommitted ? '⚠️ OVERCOMMITTED — reduce goal time by 20-30%' : '✓ Capacity OK'}

PERFORMANCE: ${context.performance.last_7_days_completion_rate}% completion last 7 days (${context.performance.completed_blocks_last_7}/${context.performance.total_blocks_last_7} blocks)
${context.performance.last_7_days_completion_rate < 50 ? '⚠️ LOW COMPLETION — make schedule lighter and more achievable' : ''}

Generate 3 variants:
1. "Balanced" — even Mon-Fri spread
2. "Front-Loaded" — heavy Mon-Wed, light Thu-Fri
3. "Sustainable" — ${context.capacity.is_overcommitted || context.performance.last_7_days_completion_rate < 60 ? 'reduced load, recovery focus' : 'optimized based on patterns'}

OUTPUT FORMAT (strict JSON):
{
  "variants": [
    {
      "id": "balanced",
      "label": "Balanced Week",
      "description": "Even distribution across weekdays",
      "philosophy": "Consistency builds momentum...",
      "blocks": [
        {
          "date": "${weekStartDate}",
          "start_time": "09:00",
          "end_time": "10:00",
          "title": "Deep work: [goal name]",
          "block_type": "focus",
          "goal_id": "goal-uuid-or-null",
          "pillar": "craft",
          "checklist": [{"text": "First action step"}, {"text": "Second concrete step"}]
        }
      ],
      "stats": {
        "total_blocks": 25,
        "total_hours": 18.5,
        "days_with_work": 5
      }
    }
  ]
}`;

    // ── Call AI ──────────────────────────────────────────────────

    const response = await callAI<{ variants: any[] }>({
        prompt: userPrompt,
        systemPrompt,
        model: 'smart',
        temperature: 0.8,
        maxTokens: 6000,
        requireJSON: true,
        timeout: 30000,
    });

    if (!response.success || !response.data?.variants?.length) {
        console.warn('[PlanWeek] AI failed, using fallback:', response.error);
        return generateFallbackSchedule(context, weekStartDate);
    }

    // ── Validate & Clean ────────────────────────────────────────

    const variants: WeekPlanVariant[] = response.data.variants
        .slice(0, 3)
        .map((v: any, i: number) => cleanVariant(v, context, weekStartDate, i));

    return variants;
}

// ── Validate Variant ─────────────────────────────────────────────

function cleanVariant(raw: any, ctx: CalendarContext, weekStart: string, index: number): WeekPlanVariant {
    const defaults = ['balanced', 'front-loaded', 'sustainable'];
    const labels = ['Balanced Week', 'Front-Loaded', 'Sustainable'];

    const goalMap = new Map(ctx.goals.map(g => [g.id, g]));
    const goalsByTitle = new Map(ctx.goals.map(g => [g.title.toLowerCase(), g]));

    const blocks: PlanBlock[] = (raw.blocks || [])
        .filter((b: any) => b.date && b.start_time && b.end_time)
        .map((b: any) => {
            // Resolve goal_id to real UUID
            let resolvedGoalId: string | undefined;
            if (b.goal_id && goalMap.has(b.goal_id)) {
                resolvedGoalId = b.goal_id;
            } else if (b.goal_id) {
                const titleLower = (b.title || '').toLowerCase();
                for (const [gTitle, goal] of goalsByTitle) {
                    if (titleLower.includes(gTitle) || gTitle.includes(titleLower)) {
                        resolvedGoalId = goal.id;
                        break;
                    }
                }
            }

            return {
                date: b.date,
                start_time: b.start_time,
                end_time: b.end_time,
                title: b.title || b.context || 'Scheduled Block',
                block_type: normalizeBlockType(b.block_type || 'goal'),
                goal_id: resolvedGoalId,
                pillar: b.pillar || undefined,
                checklist: Array.isArray(b.checklist) ? b.checklist : undefined,
            };
        });

    // Enforce Flow State and Strict Overlaps
    const flowBlocks = enforceFlowState(blocks, ctx.commitments);

    const totalMins = flowBlocks.reduce((sum, b) => {
        return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0);

    const uniqueDays = new Set(flowBlocks.map(b => b.date));

    return {
        id: raw.id || defaults[index] || `variant_${index}`,
        label: raw.label || labels[index] || `Option ${index + 1}`,
        description: raw.description || 'AI-generated schedule variant',
        philosophy: raw.philosophy || 'Optimized for your goals and energy.',
        blocks: flowBlocks,
        stats: {
            total_blocks: flowBlocks.length,
            total_hours: Math.round(totalMins / 60 * 10) / 10,
            days_with_work: uniqueDays.size,
        },
    };
}

// ── Fallback (Deterministic) ─────────────────────────────────────

function generateFallbackSchedule(ctx: CalendarContext, weekStart: string): WeekPlanVariant[] {
    const blocks: PlanBlock[] = [];
    const wakeHour = Math.ceil(timeToMinutes(ctx.user.sleep_end || '07:00') / 60);

    // Generate simple blocks Mon-Fri
    for (let day = 0; day < 5; day++) {
        const date = format(addDays(parseISO(weekStart), day), 'yyyy-MM-dd');
        let currentHour = wakeHour + 1; // Start 1 hour after wake

        // Breakfast
        blocks.push({
            date,
            start_time: minutesToTime(wakeHour * 60),
            end_time: minutesToTime(wakeHour * 60 + 30),
            title: 'Breakfast',
            block_type: 'meal',
        });

        // Goal blocks (distribute across days)
        for (const goal of ctx.goals) {
            if (currentHour >= 18) break; // Stop before evening

            const durationMins = Math.min(goal.minutes_per_day || 60, 90);
            blocks.push({
                date,
                start_time: minutesToTime(currentHour * 60),
                end_time: minutesToTime(currentHour * 60 + durationMins),
                title: goal.title,
                block_type: 'goal',
                goal_id: goal.id,
                pillar: goal.pillar,
            });
            currentHour += Math.ceil(durationMins / 60) + 0.25; // +15min buffer
        }

        // Lunch
        blocks.push({
            date,
            start_time: '12:30',
            end_time: '13:15',
            title: 'Lunch',
            block_type: 'meal',
        });

        // Dinner
        blocks.push({
            date,
            start_time: '19:00',
            end_time: '19:45',
            title: 'Dinner',
            block_type: 'meal',
        });
    }

    return [{
        id: 'fallback',
        label: 'Basic Schedule',
        description: 'Simple distribution of your goals across the weekdays.',
        philosophy: 'When AI is unavailable, a simple consistent schedule keeps you on track.',
        blocks,
        stats: {
            total_blocks: blocks.length,
            total_hours: Math.round(blocks.reduce((sum, b) =>
                sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0) / 60 * 10) / 10,
            days_with_work: 5,
        },
    }];
}
