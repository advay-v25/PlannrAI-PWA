/**
 * 🗓️ PLANNRAI — PLAN WEEK AI
 * Generates 3 weekly schedule variants using AI.
 * Falls back to deterministic schedule if AI fails.
 */

import { callAI } from '@/lib/ai/unified-client';
import type { CalendarContext, ScheduleBlock } from '@/lib/calendar/context-builder';
import { addDays, format, parseISO } from 'date-fns';
import {
    computeDayPhases,
    buildFlowPromptFragment,
    buildBehaviorInsights,
    buildGoalProgressFragment,
} from '@/lib/calendar/flow-protocol';

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

/** Enforces strict overlap rules: zero overlaps with other blocks and commitments. */
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

    // Process day by day to fix overlaps
    for (const [date, dayBlocks] of Object.entries(blocksByDate)) {
        // Sort blocks chronologically
        dayBlocks.sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time));

        // Get commitments for this date
        const dayOfWeek = new Date(date + 'T12:00:00').getDay();
        const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
        const dayCommitments = commitments.filter(c => (c.days_of_week || []).includes(isoDay));

        let processedDay: PlanBlock[] = [];
        let lastEndTime = 0;

        for (let i = 0; i < dayBlocks.length; i++) {
            let b = { ...dayBlocks[i] };
            let bStart = timeToMin(b.start_time);
            let duration = timeToMin(b.end_time) - bStart;

            // 1. Prevent Overlap with previous blocks
            if (bStart < lastEndTime) {
                bStart = lastEndTime;
            }

            // 2. Prevent Overlap with Commitments (Anchor 30-min buffer)
            for (const cmt of dayCommitments) {
                const cStart = timeToMin(cmt.start_time);
                const cEnd = timeToMin(cmt.end_time);
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

    // ── Pre-compute Fixed Bio-Rhythms (Sleep & Meals) ───────────
    const bioTemplates = [];
    bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: '00:00', end: context.user.sleep_end || '07:00' });
    bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: context.user.sleep_start || '22:30', end: '23:59' });
    
    if (mealsPerDay >= 1) bioTemplates.push({ title: 'Breakfast', block_type: 'meal', start: (mealWindows as any)?.breakfast?.start || '08:00', end: (mealWindows as any)?.breakfast?.end || '08:30' });
    if (mealsPerDay >= 2) bioTemplates.push({ title: 'Lunch', block_type: 'meal', start: (mealWindows as any)?.lunch?.start || '12:30', end: (mealWindows as any)?.lunch?.end || '13:15' });
    if (mealsPerDay >= 3) bioTemplates.push({ title: 'Dinner', block_type: 'meal', start: (mealWindows as any)?.dinner?.start || '19:00', end: (mealWindows as any)?.dinner?.end || '20:00' });

    // Tell the AI to avoid these slots by adding them to commitments
    context.commitments = [
        ...context.commitments,
        ...bioTemplates.map((b, i) => ({
            id: `bio-routine-${i}`,
            title: b.title,
            start_time: b.start,
            end_time: b.end,
            days_of_week: ['1','2','3','4','5','6','7'],
            is_active: true
        }))
    ];

    // Generate concrete blocks for the UI
    const globalBioBlocks: PlanBlock[] = [];
    for (let i = 0; i < 7; i++) {
        const currentDate = format(addDays(parseISO(weekStartDate), i), 'yyyy-MM-dd');
        for (const tmpl of bioTemplates) {
            globalBioBlocks.push({
                date: currentDate,
                start_time: tmpl.start,
                end_time: tmpl.end,
                title: tmpl.title,
                block_type: tmpl.block_type
            });
        }
    }

    // ── Compute Flow-State Phases ────────────────────────────────
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const sleepMins = timeToMinutes(context.user.sleep_start || '23:00');
    const phases = computeDayPhases(wakeMins, sleepMins, chronotype);
    const flowFragment = buildFlowPromptFragment(phases, context);
    const behaviorFragment = buildBehaviorInsights(context);
    const progressFragment = buildGoalProgressFragment(context);

    // ── Build Prompt ────────────────────────────────────────────

    const systemPrompt = `You are PlannrAI's Week Architect — an expert in chronobiology, flow state management, and high-performance scheduling. Generate realistic weekly schedules optimized for sustained human performance.

CRITICAL RULES:
1. NEVER schedule during sleep hours (${context.user.sleep_start} to ${context.user.sleep_end})
2. Wind-down starts at ${windDown} — NO work after this time
3. DO NOT generate blocks for fixed commitments — they are managed separately as anchors. Plan AROUND them.
4. NEVER schedule over existing commitments — leave a 30-minute buffer before and after
5. ZERO OVERLAP: Every block MUST have a distinct, non-overlapping time slot
6. CHECKLIST SYNC: For every 'goal' block, generate a realistic 2-3 item checklist with concrete action steps

FLOW-STATE ARCHITECTURE (apply to EVERY day):
- Each day follows the user's energy arc (Ramp-Up → Peak → Trough → Rebound → Wind-Down)
- Deep work blocks: 60-90min MAX, followed by 15-20min Active Recovery
- Max 3-4 deep work cycles per day (180-360 min total)
- Morning (ramp-up): routine, breakfast, light prep — NO deep work
- Peak: highest-energy goal blocks (deep focus)
- Trough (post-lunch): lunch, admin, light tasks
- Rebound: creative work, moderate goals, exercise
- Wind-down: dinner, light review, evening routine
- 15min transition buffers between different types of work

🧠 PILLAR DISTRIBUTION — DYNAMIC, NOT FORMULAIC:
- The number of blocks per pillar depends on the user's ACTUAL goals and weekly targets
- Use WEEKLY PROGRESS data to prioritize goals that are behind schedule
- Schedule the user's EXACT goal names and IDs — NEVER invent generic blocks
- Use block_type "goal" for all goal-linked blocks with the "pillar" field for classification

BLOCK TYPES: "goal", "routine", "meal", "buffer", "flex"

BIO-CONTEXT:
- ${chronotypeRules}
- User energy: ${userEnergy}/10, Stress: ${userStress}/10
- Plan density should match energy level. HIGH stress = MORE breaks, FEWER goal blocks.
- Meals per day: ${mealsPerDay}
${(mealWindows as any)?.breakfast ? `- Breakfast window: ${(mealWindows as any).breakfast.start}–${(mealWindows as any).breakfast.end}` : ''}
${(mealWindows as any)?.lunch ? `- Lunch window: ${(mealWindows as any).lunch.start}–${(mealWindows as any).lunch.end}` : ''}
${(mealWindows as any)?.dinner ? `- Dinner window: ${(mealWindows as any).dinner.start}–${(mealWindows as any).dinner.end}` : ''}

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

🚨 SCHEDULING AROUND COMMITMENTS:
- If the user has a large commitment (e.g., "Work" 09:00-17:00), you MUST still fill the MORNING window (wake to commitment start - 30min) and EVENING window (commitment end + 30min to wind-down) with goal blocks, meals, routines, and buffers.
- Example with Work 09:00-17:00: Morning Routine (07:00), Breakfast (07:30), Goal 1 (08:00-08:30), then after work: Buffer (17:30), Goal 2 (17:45-18:30), Dinner (19:00), Goal 3 (19:45-20:30), Evening Routine, Wind-down.
- NEVER leave the morning or evening windows empty. These are prime goal-completion windows.
- Each weekday should have 3-8 goal/activity blocks OUTSIDE of fixed commitments.
- Generate COMPLETE, FILLED schedules — not just Breakfast + 1 block.

Generate 3 variants:
1. "Balanced" — even Mon-Fri spread, proportional blocks per goal
2. "Front-Loaded" — heavy Mon-Wed, light Thu-Fri
3. "Sustainable" — ${context.capacity.is_overcommitted || context.performance.last_7_days_completion_rate < 60 ? 'reduced load, recovery focus' : 'optimized based on patterns'}

IMPORTANT: Use the EXACT goal names and IDs from the list above. Do NOT create generic blocks like "Mind Boost".
${flowFragment}
${behaviorFragment}
${progressFragment}
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
          "title": "[Exact Goal Name from list above]",
          "block_type": "goal",
          "goal_id": "goal-uuid-from-list",
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
        temperature: 0.7,
        maxTokens: 6000,
        requireJSON: true,
        timeout: 180000,
        calendarKey: true,
    });

    if (!response.success || !response.data?.variants?.length) {
        console.warn('[PlanWeek] AI failed, using fallback:', response.error);
        return generateFallbackSchedule(context, weekStartDate);
    }

    // ── Validate & Clean ────────────────────────────────────────

    const variants: WeekPlanVariant[] = response.data.variants
        .slice(0, 3)
        .map((v: any, i: number) => cleanVariant(v, context, weekStartDate, i, globalBioBlocks));

    return variants;
}

// ── Validate Variant ─────────────────────────────────────────────

function cleanVariant(raw: any, ctx: CalendarContext, weekStart: string, index: number, globalBioBlocks: PlanBlock[] = []): WeekPlanVariant {
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

    // --- Filter out blocks that DIRECTLY overlap with commitment time slots ---
    const commitmentOverlapFiltered = blocks.filter(b => {
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        const dayOfWeek = new Date(b.date + 'T12:00:00').getDay();
        const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

        for (const cmt of ctx.commitments) {
            if (!Array.isArray(cmt.days_of_week) || cmt.days_of_week.length === 0) continue;
            if (!(cmt.days_of_week as any[]).includes(isoDay)) continue;

            const cStart = timeToMinutes(cmt.start_time);
            const cEnd = timeToMinutes(cmt.end_time);

            if (bStart < cEnd && bEnd > cStart) {
                return false;
            }
        }
        return true;
    });

    // Enforce Flow State and Strict Overlaps
    const flowBlocks = enforceFlowState(commitmentOverlapFiltered, ctx.commitments);
    
    // Inject the exact Bio Rhythm Blocks for this variant, effectively returning them to the calendar directly
    const finalBlocks = [...globalBioBlocks, ...flowBlocks];

    const totalMins = finalBlocks.reduce((sum, b) => {
        return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0);

    const uniqueDays = new Set(finalBlocks.map(b => b.date));

    return {
        id: raw.id || defaults[index] || `variant_${index}`,
        label: raw.label || labels[index] || `Option ${index + 1}`,
        description: raw.description || 'AI-generated schedule variant',
        philosophy: raw.philosophy || 'Optimized for your goals and energy.',
        blocks: finalBlocks,
        stats: {
            total_blocks: finalBlocks.length,
            total_hours: Math.round(totalMins / 60 * 10) / 10,
            days_with_work: uniqueDays.size,
        },
    };
}

// ── Fallback (Deterministic) ─────────────────────────────────────

function generateFallbackSchedule(ctx: CalendarContext, weekStart: string): WeekPlanVariant[] {
    const blocks: PlanBlock[] = [];
    const wakeMin = timeToMinutes(ctx.user.sleep_end || '07:00');
    const windDownMin = timeToMinutes(calculateWindDown(ctx));

    // Build commitment exclusion zones per ISO day (1=Mon ... 7=Sun)
    const commitmentsByDay = new Map<number, Array<{ start: number; end: number; title: string }>>();
    for (const cmt of ctx.commitments) {
        const days = ((cmt.days_of_week || []) as any[]).map(Number);
        for (const d of days) {
            if (!commitmentsByDay.has(d)) commitmentsByDay.set(d, []);
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(cmt.start_time),
                end: timeToMinutes(cmt.end_time),
                title: cmt.title,
            });
        }
    }

    // Distribute goals across days in round-robin (3 goals per day)
    const goalsPerDay = 3;

    for (let day = 0; day < 5; day++) {
        const date = format(addDays(parseISO(weekStart), day), 'yyyy-MM-dd');
        const dayOfWeek = new Date(date + 'T12:00:00').getDay();
        const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

        // Get commitments for this day
        const dayCommitments = (commitmentsByDay.get(isoDay) || []).sort((a, b) => a.start - b.start);

        // Build available windows (wake to wind-down, excluding commitments with 15min buffer)
        const windows: Array<{ start: number; end: number }> = [];
        let cursor = wakeMin;

        for (const cmt of dayCommitments) {
            const bufferStart = cmt.start - 15;
            const bufferEnd = cmt.end + 15;
            if (cursor < bufferStart) {
                windows.push({ start: cursor, end: bufferStart });
            }
            cursor = Math.max(cursor, bufferEnd);
        }
        if (cursor < windDownMin) {
            windows.push({ start: cursor, end: windDownMin });
        }

        // Place blocks in available windows
        let windowIdx = 0;
        let windowCursor = windows.length > 0 ? windows[0].start : wakeMin;

        const placeBlock = (title: string, type: string, durationMin: number, goalId?: string, pillar?: string) => {
            if (windowIdx >= windows.length) return false;
            const win = windows[windowIdx];
            
            if (windowCursor + durationMin > win.end) {
                // Move to next window
                windowIdx++;
                if (windowIdx >= windows.length) return false;
                windowCursor = windows[windowIdx].start;
                if (windowCursor + durationMin > windows[windowIdx].end) return false;
            }

            blocks.push({
                date,
                start_time: minutesToTime(windowCursor),
                end_time: minutesToTime(windowCursor + durationMin),
                title,
                block_type: type,
                goal_id: goalId,
                pillar: pillar,
            });
            windowCursor += durationMin + 10; // 10min buffer between blocks
            return true;
        };

        // Morning Routine
        placeBlock('Morning Routine', 'routine', 15);
        
        // Breakfast
        placeBlock('Breakfast', 'meal', 30);

        // Select goals for this day (round-robin distribution)
        const dayGoals = [];
        for (let i = 0; i < goalsPerDay && i < ctx.goals.length; i++) {
            const goalIdx = (day * goalsPerDay + i) % ctx.goals.length;
            dayGoals.push(ctx.goals[goalIdx]);
        }

        // Place morning goals (before any commitment)
        for (const goal of dayGoals.slice(0, 1)) {
            const duration = Math.min(goal.minutes_per_day || 30, 45);
            placeBlock(goal.title, 'goal', duration, goal.id, goal.pillar);
        }

        // Lunch (try to place around 12:00-13:00)
        // Find the window that contains lunch time
        for (let wi = 0; wi < windows.length; wi++) {
            if (windows[wi].start <= 720 && windows[wi].end >= 765) {
                // Can place lunch here
                blocks.push({
                    date,
                    start_time: '12:00',
                    end_time: '12:45',
                    title: 'Lunch',
                    block_type: 'meal',
                });
                break;
            }
        }

        // Place afternoon/evening goals after commitments
        for (const goal of dayGoals.slice(1)) {
            const duration = Math.min(goal.minutes_per_day || 30, 45);
            placeBlock(goal.title, 'goal', duration, goal.id, goal.pillar);
        }

        // Dinner
        placeBlock('Dinner', 'meal', 45);

        // Evening Routine
        placeBlock('Evening Routine', 'routine', 15);
    }

    return [{
        id: 'fallback',
        label: 'Basic Schedule',
        description: 'Commitment-aware schedule with your goals distributed across the week.',
        philosophy: 'A consistent schedule that respects your commitments keeps you on track.',
        blocks,
        stats: {
            total_blocks: blocks.length,
            total_hours: Math.round(blocks.reduce((sum, b) =>
                sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0) / 60 * 10) / 10,
            days_with_work: 5,
        },
    }];
}
