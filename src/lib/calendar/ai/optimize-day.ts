/**
 * ⚡ PLANNRAI — OPTIMIZE DAY AI
 * Analyzes today's schedule and generates optimization options.
 * Uses energy level and time remaining to suggest adjustments.
 */

import { callAI } from '@/lib/ai/unified-client';
import type { CalendarContext, ScheduleBlock } from '@/lib/calendar/context-builder';

// ── Types ────────────────────────────────────────────────────────

export interface DayOptimization {
    id: string;
    label: string;
    description: string;
    tradeoff: string;
    ops: PatchOp[];
}

export interface PatchOp {
    op: 'create_event' | 'move_event' | 'update_event' | 'delete_event';
    event_id?: string;
    payload?: any;
    to_start?: string;
    to_end?: string;
    fields?: Record<string, any>;
}

export interface OptimizeDayResult {
    analysis: {
        energy_state: string;
        schedule_health: string;
        recommendation: string;
    };
    options: DayOptimization[];
}

// ── Utilities ────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function calculateWindDown(ctx: CalendarContext): string {
    const sleepMins = timeToMinutes(ctx.user.sleep_start);
    const windDownStart = sleepMins - (ctx.user.wind_down_mins || 30);
    const h = Math.floor((windDownStart + 1440) % 1440 / 60);
    const m = (windDownStart + 1440) % 1440 % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ── Main Function ────────────────────────────────────────────────

export async function optimizeDayAI(
    context: CalendarContext,
    focus?: string
): Promise<OptimizeDayResult> {
    const currentMins = timeToMinutes(context.current.time);
    const windDown = calculateWindDown(context);

    // Filter to remaining blocks (not yet past, not done)
    const remainingBlocks = context.schedule.today.filter(b => {
        const blockStartMins = timeToMinutes(b.start_time);
        return blockStartMins >= currentMins && b.status !== 'done' && b.status !== 'cancelled';
    });

    const fixedBlocks = remainingBlocks.filter(b => b.is_fixed || b.commitment_id);
    const movableBlocks = remainingBlocks.filter(b => !b.is_fixed && !b.commitment_id);

    const goalsText = context.goals.length > 0
        ? context.goals.map(g =>
            `  - ${g.title} (${g.pillar.toUpperCase()}, ${g.energy_demand} energy): ${g.minutes_per_day || 30}min/day, ID: ${g.id}\n    AI Strategy: ${g.ai_strategy ? JSON.stringify(g.ai_strategy) : 'None'}`
        ).join('\n')
        : '  (No specific goals)';

    const commitmentsText = context.commitments.length > 0
        ? context.commitments.filter(c => {
            const dow = new Date(context.current.date + 'T12:00:00').getDay();
            return (c.days_of_week || []).includes(dow as any);
        }).map(c =>
            `  - ${c.title}: ${c.start_time}-${c.end_time} (FIXED)`
        ).join('\n')
        : '  (No fixed commitments today)';

    const habitStacksText = context.habitStacks?.length > 0
        ? context.habitStacks.map(h =>
            `  - When doing "${h.trigger_habit}" → also do "${h.action_habit}" (${h.action_duration_mins}min)`
        ).join('\n')
        : '  (No habit stacks)';

    const systemPrompt = `You are PlannrAI's schedule optimizer. Analyze the remaining day and suggest adjustments.

CRITICAL RULES:
1. NEVER move or delete FIXED blocks (is_fixed=true or has commitment_id)
2. Wind-down starts at ${windDown} — no work after this
3. Sleep starts at ${context.user.sleep_start} — everything must end before wind-down
4. Generate exactly 2 optimization options. Each should be meaningfully different.
5. You can use 'move_event' to shift blocks, 'delete_event' to cancel them, or 'create_event' to fill gaps.
6. For 'create_event', payload must match: {"title":"...", "start_time":"HH:MM", "end_time":"HH:MM", "block_type":"focus|routine|meal", "goal_id":"...", "pillar":"...", "checklist": [{"text": "Action item 1"}]}
7. IMPORTANT REALISM RULES:
   - Add 10-15 minute Buffer blocks between distinct activities (e.g. Work and Workout)
   - Ensure Lunch is around 12:30-13:30 and Dinner is around 18:30-19:30. DO NOT schedule Dinner early at 18:00 or skip lunch
   - If missing, generate 'Morning Routine' and 'Night Routine' blocks
   - CHECKLIST SYNC: For every 'goal' block you create, you MUST examine its provided 'AI Strategy' to generate a realistic 2-3 item 'checklist'.
8. Use existing block IDs for move/delete operations

Return valid JSON only.`;

    const blocksText = remainingBlocks.map(b =>
        `  - ID: ${b.id} | ${b.start_time}-${b.end_time} | "${b.title}" | ${b.block_type} | ${b.is_fixed ? 'FIXED' : 'movable'} | ${b.status}`
    ).join('\n');

    const userPrompt = `
OPTIMIZE TODAY'S SCHEDULE

CURRENT TIME: ${context.current.time}
DATE: ${context.current.date}
FOCUS: ${focus || 'balance'}
WIND-DOWN: ${windDown}

GOALS TO SCHEDULE (if not already in blocks):
${goalsText}

FIXED COMMITMENTS (Must be scheduled if missing):
${commitmentsText}

REMAINING BLOCKS (${remainingBlocks.length}):
${blocksText || '  (No remaining blocks)'}

FIXED BLOCKS (${fixedBlocks.length}): Cannot be moved or deleted
MOVABLE BLOCKS (${movableBlocks.length}): Can be rearranged or removed

USER PERFORMANCE: ${context.performance.last_7_days_completion_rate}% completion rate last 7 days

INSTRUCTIONS:
${focus === 'reduce_overwhelm' ? 'User feels overwhelmed. Remove non-essential blocks, add breaks. Do not schedule heavy goals.' :
            focus === 'maximize_output' ? 'User wants max productivity. Tighten schedule, fill gaps with focus blocks.' :
                'Balance the schedule — ensure breaks, meals, and focus time are placed optimally until wind-down.'}
Identify gaps in the schedule and CREATE routines (e.g., Afternoon Reset, Night Routine), Meals (Lunch at 13:00, Dinner at 19:00), and Focus Blocks for the user's goals if they are missing. MUST add 15min 'Buffer' blocks between major activities.

Generate 2 options:

Option 1: "Realistic" — Balanced plan with standard meal times and plenty of breaks.
Option 2: "Focused" — Concentrated work/goals with minimal viable breaks.

OUTPUT FORMAT (strict JSON):
{
  "analysis": {
    "energy_state": "moderate",
    "schedule_health": "busy but manageable",
    "recommendation": "Consider dropping one low-priority block"
  },
  "options": [
    {
      "id": "realistic",
      "label": "Realistic Plan",
      "description": "Keep top priorities, defer the rest",
      "tradeoff": "You'll miss the reading session but complete deep work",
      "ops": [
        {"op": "move_event", "event_id": "block-uuid", "to_start": "16:00", "to_end": "17:00"},
        {"op": "create_event", "payload": {"title": "Evening Routine", "start_time": "19:00", "end_time": "20:00", "block_type": "routine", "goal_id": null, "pillar": null, "checklist": [{"text": "Wind down"}]}},
        {"op": "delete_event", "event_id": "block-uuid"}
      ]
    }
  ]
}`;

    const response = await callAI<OptimizeDayResult>({
        prompt: userPrompt,
        systemPrompt,
        model: 'smart',
        temperature: 0.5,
        maxTokens: 4000,
        requireJSON: true,
        timeout: 55000,
        calendarKey: true,
    });

    if (!response.success || !response.data) {
        console.warn('[OptimizeDay] AI failed:', response.error);
        return generateFallbackOptimization(context, remainingBlocks);
    }

    // ── Validate ────────────────────────────────────────────────

    const result = response.data;

    return {
        analysis: result.analysis || {
            energy_state: 'unknown',
            schedule_health: 'unknown',
            recommendation: 'AI analysis unavailable',
        },
        options: (result.options || []).slice(0, 3).map((opt: any) => ({
            id: opt.id || `option_${Math.random().toString(36).slice(2, 6)}`,
            label: opt.label || 'Optimization',
            description: opt.description || 'AI-suggested schedule adjustment',
            tradeoff: opt.tradeoff || '',
            ops: (opt.ops || []).filter((op: any) => op.op && ['create_event', 'move_event', 'update_event', 'delete_event'].includes(op.op)),
        })),
    };
}

// ── Fallback ─────────────────────────────────────────────────────

function generateFallbackOptimization(ctx: CalendarContext, blocks: ScheduleBlock[]): OptimizeDayResult {
    const health = blocks.length > 6 ? 'overloaded' : blocks.length > 0 ? 'manageable' : 'light';
    const movable = blocks.filter(b => !b.is_fixed && !b.commitment_id);

    const options: DayOptimization[] = [
        {
            id: 'keep',
            label: 'Keep Current',
            description: blocks.length === 0
                ? 'Schedule is clear — add blocks or plan in the calendar'
                : `Keep your ${blocks.length} remaining blocks as-is`,
            tradeoff: 'No disruption to existing plan',
            ops: [],
        },
    ];

    // If there are movable blocks, offer a "light" option that removes low-priority ones
    if (movable.length > 1) {
        const lowestPriority = movable[movable.length - 1];
        options.push({
            id: 'lighten',
            label: 'Lighten Load',
            description: `Remove "${lowestPriority.title}" to free up time`,
            tradeoff: `You'll skip ${lowestPriority.title} today`,
            ops: [{ op: 'delete_event', event_id: lowestPriority.id }],
        });
    }

    return {
        analysis: {
            energy_state: 'moderate',
            schedule_health: health,
            recommendation: blocks.length === 0
                ? 'No blocks remaining today. Add activities or plan your week.'
                : `${blocks.length} blocks left today (${movable.length} adjustable). ${health === 'overloaded' ? 'Consider reducing.' : 'On track.'}`,
        },
        options,
    };
}
