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

    // ── Build Prompt ────────────────────────────────────────────

    const systemPrompt = `You are PlannrAI's schedule optimizer. Analyze the remaining day and suggest adjustments.

CRITICAL RULES:
1. NEVER move or delete FIXED blocks (is_fixed=true or has commitment_id)
2. Wind-down starts at ${windDown} — no work after this
3. Sleep starts at ${context.user.sleep_start} — everything must end before wind-down
4. Generate exactly 2 optimization options
5. Each option should be meaningfully different
6. Include specific ops (create_event, move_event, delete_event) for each option
7. Use existing block IDs for move/delete operations

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

REMAINING BLOCKS (${remainingBlocks.length}):
${blocksText || '  (No remaining blocks)'}

FIXED BLOCKS (${fixedBlocks.length}): Cannot be moved or deleted
MOVABLE BLOCKS (${movableBlocks.length}): Can be rearranged or removed

USER PERFORMANCE: ${context.performance.last_7_days_completion_rate}% completion rate last 7 days

INSTRUCTIONS:
${focus === 'reduce_overwhelm' ? 'User feels overwhelmed. Remove non-essential blocks, add breaks.' :
            focus === 'maximize_output' ? 'User wants max productivity. Tighten schedule, remove gaps.' :
                'Balance the schedule — ensure breaks and focus time.'}

Generate 2 options:

Option 1: "Realistic" — Keep essential blocks, defer or remove what won't fit
Option 2: "Focused" — Prioritize the most important block, simplify everything else

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
        {"op": "delete_event", "event_id": "block-uuid"}
      ]
    }
  ]
}`;

    // ── Call AI ──────────────────────────────────────────────────

    const response = await callAI<OptimizeDayResult>({
        prompt: userPrompt,
        systemPrompt,
        model: 'fast',
        temperature: 0.5,
        maxTokens: 3000,
        requireJSON: true,
        timeout: 25000,
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
