/**
 * ⚡ PLANNRAI — OPTIMIZE DAY AI
 * Analyzes today's schedule and generates optimization options.
 * Uses energy level and time remaining to suggest adjustments.
 */

import { callAI } from '@/lib/ai/unified-client';
import type { CalendarContext, ScheduleBlock } from '@/lib/calendar/context-builder';
import {
    computeDayPhases,
    buildFlowPromptFragment,
    buildBehaviorInsights,
    buildGoalProgressFragment,
} from '@/lib/calendar/flow-protocol';

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

    // ── Bio-Context ─────────────────────────────────────────────

    const userEnergy = context.user.energy_level || 5;
    const userStress = context.user.stress_level || 3;
    const chronotype = context.user.chronotype || 'bear';
    const mealsPerDay = context.user.meals_per_day || 3;
    const mealWindows = context.user.meal_windows || {};

    const chronotypeRules = chronotype === 'early_bird' || chronotype === 'lark'
        ? 'EARLY BIRD: schedule deep work EARLY (7am-11am). Lighter tasks afternoon.'
        : chronotype === 'night_owl' || chronotype === 'owl'
            ? 'NIGHT OWL: schedule deep work LATE (11am-3pm, 4pm-8pm). Light mornings.'
            : chronotype === 'wolf'
                ? 'WOLF: peak productivity LATE (1pm-8pm). Easy mornings.'
                : 'BEAR: deep work MID-MORNING (9am-12pm). Standard schedule.';

    // Compute flow-state phases and behavioral context
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const sleepMins = timeToMinutes(context.user.sleep_start || '23:00');
    const phases = computeDayPhases(wakeMins, sleepMins, chronotype);
    const flowFragment = buildFlowPromptFragment(phases, context);
    const behaviorFragment = buildBehaviorInsights(context);
    const progressFragment = buildGoalProgressFragment(context);

    // ALL blocks for today (including past/done, for goal allocation tracking)
    const allTodayBlocks = context.schedule.today;

    // Filter to remaining blocks (not yet past, not done)
    const remainingBlocks = allTodayBlocks.filter(b => {
        const blockStartMins = timeToMinutes(b.start_time);
        return blockStartMins >= currentMins && b.status !== 'done' && b.status !== 'cancelled';
    });

    const fixedBlocks = remainingBlocks.filter(b => b.is_fixed || b.commitment_id);
    const movableBlocks = remainingBlocks.filter(b => !b.is_fixed && !b.commitment_id);

    // Calculate how many minutes each goal ALREADY has scheduled today
    const goalAllocation = new Map<string, { title: string; scheduledMins: number; targetMins: number }>();
    for (const goal of context.goals) {
        const goalBlocks = allTodayBlocks.filter(b => b.goal_id === goal.id);
        const scheduledMins = goalBlocks.reduce((sum, b) => {
            return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
        }, 0);
        goalAllocation.set(goal.id, {
            title: goal.title,
            scheduledMins,
            targetMins: goal.minutes_per_day || 60,
        });
    }

    // Build goals text with allocation status
    const goalsText = context.goals.length > 0
        ? context.goals.map(g => {
            const alloc = goalAllocation.get(g.id);
            const scheduledMins = alloc?.scheduledMins || 0;
            const targetMins = g.minutes_per_day || 60;
            const isFull = scheduledMins >= targetMins;
            const status = isFull ? '✅ FULLY SCHEDULED — DO NOT ADD MORE' : `⚠️ ${scheduledMins}/${targetMins}min scheduled`;
            return `  - ${g.title} (${g.pillar.toUpperCase()}, ${g.energy_demand} energy): ${targetMins}min/day, ${status}, ID: ${g.id}`;
        }).join('\n')
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

    const systemPrompt = `You are PlannrAI's schedule optimizer — an expert in flow state management and energy-aware scheduling. Analyze the remaining day and suggest adjustments that respect the user's energy arc.

CRITICAL RULES:
1. NEVER move or delete FIXED blocks (is_fixed=true or has commitment_id)
2. Wind-down starts at ${windDown} — no work after this
3. Sleep starts at ${context.user.sleep_start} — everything must end before wind-down
4. Generate exactly 2 optimization options. Each should be meaningfully different.
5. You can use 'move_event' to shift blocks, 'delete_event' to cancel them, or 'create_event' to fill gaps.
6. For 'create_event', payload must match: {"title":"...", "start_time":"HH:MM", "end_time":"HH:MM", "block_type":"goal|routine|meal|buffer|flex", "goal_id":"...", "pillar":"...", "checklist": [{"text": "Action item 1"}]}
7. FLOW-STATE RULES:
   - Follow the Energy Arc: don't move high-energy blocks into trough/wind-down phases
   - After deep work (60-90min), ensure a 15min Active Recovery block exists
   - 10-15 minute transition buffers between different activities
   - If user's energy is low, suggest removing blocks, not adding them
   - CHECKLIST SYNC: For every 'goal' block you create, generate a realistic 2-3 item checklist
8. Use existing block IDs for move/delete operations
9. Use the user's ACTUAL goal names and IDs. Do NOT invent generic blocks.
10. block_type for create_event MUST be one of: goal, routine, meal, buffer, flex. NEVER use "task", "shopping", "errand", or any custom value.
11. OPTION DIVERGENCE (CRITICAL): Option 1 and Option 2 MUST propose completely different operations. If Option 1 moves a block to 2:00 PM, Option 2 MUST move it somewhere else, or delete it, or leave it alone. Do NOT generate identical \`ops\` arrays for both options.

🚫 IMMUTABLE BLOCKS (ABSOLUTE — NEVER VIOLATE):
- NEVER move, delete, modify, or reschedule blocks of type: sleep, meal, wind_down, anchor.
- These are biological necessities and fixed commitments. They are SACRED.
- To free up time, you MUST work around goal blocks, buffer blocks, routine blocks, or flex blocks ONLY.
- If the user asks to skip sleep or meals, REFUSE and explain why it's harmful.
- If all remaining blocks are immutable, tell the user there's nothing to optimize — their schedule is locked.

🎯 GOAL TIME ENFORCEMENT (CRITICAL — HIGHEST PRIORITY):
- Each goal has a minutes_per_day limit shown in the GOALS section below.
- If a goal is marked "✅ FULLY SCHEDULED", you MUST NOT create any new blocks for that goal.
- If a goal shows e.g. "60/90min scheduled", you may only add up to 30min more.
- NEVER exceed the goal's daily minutes_per_day limit under any circumstances.
- This rule overrides all other scheduling logic. Over-scheduling goals is the #1 bug to avoid.
- When you see gaps in the schedule, fill them with buffers, routines, or flex blocks — NOT with more goal blocks if goals are already at their daily limit.
- If a non-body goal (mind/craft) has a high weekly commitment (>120 mins), you MAY schedule multiple blocks for it on the same day to reach its limit.
- You MUST NEVER schedule multiple body blocks (pillar: body) for the same goal on the same day. Body blocks are strictly 1 block per day to prevent physical over-taxing.

BIO-CONTEXT:
- ${chronotypeRules}
- User energy: ${userEnergy}/10, Stress: ${userStress}/10
- Plan density should match energy level. HIGH stress = MORE breaks, FEWER goal blocks.
- Meals per day: ${mealsPerDay}
${(mealWindows as any)?.breakfast ? `- Breakfast window: ${(mealWindows as any).breakfast.start}–${(mealWindows as any).breakfast.end}` : ''}
${(mealWindows as any)?.lunch ? `- Lunch window: ${(mealWindows as any).lunch.start}–${(mealWindows as any).lunch.end}` : ''}
${(mealWindows as any)?.dinner ? `- Dinner window: ${(mealWindows as any).dinner.start}–${(mealWindows as any).dinner.end}` : ''}
${flowFragment}
${behaviorFragment}
Return valid JSON only.`;

    const blocksText = remainingBlocks.map(b =>
        `  - ID: ${b.id} | ${b.start_time}-${b.end_time} | "${b.title}" | ${b.block_type} | ${b.is_fixed ? 'FIXED' : 'movable'} | ${b.status}`
    ).join('\n');

    let strategyInstruction = '';
    let optionsText = '';

    if (focus === 'momentum') {
        strategyInstruction = 'USER STRATEGY: MOMENTUM. Maximize output and deep work. Tighten the schedule and push harder. Minimize non-essential breaks.';
        optionsText = `Generate 2 options:\nOption 1: "Aggressive Sprint" — Maximum density, clustering all work into long uninterrupted blocks.\nOption 2: "Steady Momentum" — High output but retains standard meal breaks.`;
    } else if (focus === 'recovery') {
        strategyInstruction = 'USER STRATEGY: RECOVERY. Reduce overwhelm. Priority is active recovery and avoiding burnout. Aggressively remove low-priority blocks and shorten remaining blocks if needed to preserve wind-down time. Do NOT schedule heavy new goals.';
        optionsText = `Generate 2 options:\nOption 1: "Essential Only" — Strips schedule to only fixed commitments and highest priority goals.\nOption 2: "Active Recovery" — Includes essential goals but heavily spaces them out with large buffers and routine blocks.`;
    } else {
        strategyInstruction = 'USER STRATEGY: BALANCED. Balance the schedule — ensure breaks, meals, and focus time are placed optimally until wind-down. Sustainable mix of deep work and rest.';
        optionsText = `Generate 2 options:\nOption 1: "Realistic" — Balanced plan with standard meal times and plenty of breaks.\nOption 2: "Focused Flow" — Slightly more concentrated work/goals with minimal viable breaks.`;
    }

    // Build the full-day view (ALL blocks, including past) so AI sees what was already planned
    const allBlocksText = allTodayBlocks.map(b =>
        `  - ID: ${b.id} | ${b.start_time}-${b.end_time} | "${b.title}" | ${b.block_type} | ${b.is_fixed ? 'FIXED' : 'movable'} | ${b.status}${b.goal_id ? ` | goal_id: ${b.goal_id}` : ''}`
    ).join('\n');

    const userPrompt = `
OPTIMIZE TODAY'S SCHEDULE

CURRENT TIME: ${context.current.time}
DATE: ${context.current.date}
STRATEGY: ${focus || 'balanced'}
WIND-DOWN: ${windDown}

GOALS (with today's allocation — respect these limits!):
${goalsText}

FIXED COMMITMENTS (Must be scheduled if missing):
${commitmentsText}

FULL TODAY'S SCHEDULE (ALL ${allTodayBlocks.length} blocks — including past):
${allBlocksText || '  (No blocks today)'}

REMAINING BLOCKS (${remainingBlocks.length} — future only):
${blocksText || '  (No remaining blocks)'}

FIXED BLOCKS (${fixedBlocks.length}): Cannot be moved or deleted
MOVABLE BLOCKS (${movableBlocks.length}): Can be rearranged or removed

USER PERFORMANCE: ${context.performance.last_7_days_completion_rate}% completion rate last 7 days

INSTRUCTIONS:
${strategyInstruction}
Identify gaps in the schedule and CREATE routines, Meals, and Focus Blocks for the user's goals if missing. Follow the ENERGY ARC — place deep work in peak/rebound phases, light work in trough/wind-down.
REMEMBER: Check the goal allocation status above. If a goal is ✅ FULLY SCHEDULED, do NOT create more blocks for it. Only fill gaps with buffers, routines, meals, or flex blocks.
${progressFragment}
${optionsText}


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
        timeout: 110000,
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
    const PROTECTED_TYPES = ['sleep', 'meal', 'wind_down', 'anchor', 'buffer'];
    const health = blocks.length > 6 ? 'overloaded' : blocks.length > 0 ? 'manageable' : 'light';
    // Only goal, flex, and routine blocks are movable — NEVER touch sleep, meal, anchor, buffer, wind_down
    const movable = blocks.filter(b => !b.is_fixed && !b.commitment_id && !PROTECTED_TYPES.includes(b.block_type));

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
