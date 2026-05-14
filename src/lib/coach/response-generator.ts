import { CoachIntent, IntentClassification, classifyIntent } from '@/lib/coach/intent-classifier';
import { CoachContext } from '@/lib/coach/context-builder';
import { buildCalendarContext, CalendarContext } from '@/lib/calendar/context-builder';
import { callAI } from '@/lib/ai/unified-client';
import { format } from 'date-fns';
import {
    computeDayPhases,
    buildFlowPromptFragment,
    buildGoalProgressFragment
} from '@/lib/calendar/flow-protocol';

// ============ RESPONSE SCHEMA ============

export interface CoachResponse {
    id: string;
    timestamp: string;
    mode: 'execute' | 'propose' | 'clarify' | 'acknowledge' | 'inform';
    summary: string;
    options?: CoachOption[];
    clarification?: {
        question: string;
        suggestions?: string[];
    };
    acknowledgment?: {
        message: string;
        offer?: string;
    };
    minimal_mode: boolean;
    conversation_context: {
        can_undo: boolean;
        last_patch_version_id?: string;
    };
    options_expire_at: string;
}

export interface CoachOption {
    id: string;
    title: string;
    description: string;
    impact: string;
    tradeoff?: {
        warning: string;
        severity: 'info' | 'caution' | 'warning';
    };
    patch: SchedulePatch;
    preview: {
        blocks_added: number;
        blocks_modified: number;
        blocks_removed: number;
        affected_dates: string[];
    };
    recommended: boolean;
}

export interface SchedulePatch {
    operations: PatchOperation[];
    requires_confirmation: boolean;
}

export type PatchOperation =
    | { type: 'create_block'; data: NewBlockData }
    | { type: 'move_block'; block_id: string; title?: string; new_start: string; new_end: string; new_date?: string }
    | { type: 'update_block'; block_id: string; changes: Partial<BlockData> }
    | { type: 'delete_block'; block_id: string }
    | { type: 'replan_week'; mode?: 'balanced' | 'momentum' | 'recovery'; allow_weekend?: boolean }
    | { type: 'update_goal'; goal_id: string; changes: Partial<GoalData> }
    | { type: 'create_goal'; data: NewGoalData }
    | { type: 'delete_goal'; goal_id: string }
    | { type: 'create_todo'; data: NewTodoData }
    | { type: 'update_todo'; todo_id: string; changes: Partial<TodoData> }
    | { type: 'delete_todo'; todo_id: string };

interface NewGoalData {
    title: string;
    pillar: string;
    minutes_per_day: number;
    days_per_week: number;
}

interface NewTodoData {
    title: string;
    due_date?: string;
    priority?: 'low' | 'medium' | 'high';
}

interface TodoData {
    title: string;
    is_completed: boolean;
    due_date: string | null;
    priority: 'low' | 'medium' | 'high';
}

interface NewBlockData {
    date: string;
    start_time: string;
    end_time: string;
    context: string;
    title: string;
    block_type: string;
    energy_level_required?: number;
    goal_id?: string;
    pillar?: string;
    checklist?: Array<{ text: string }>;
}

interface BlockData {
    start_time: string;
    end_time: string;
    status: string;
    context: string;
    title: string;
    energy_level_required: number;
}

interface GoalData {
    weekly_target_minutes: number;
    is_active: boolean;
    priority: number;
}

const VALID_BLOCK_TYPES = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];

// ============ UTILITY FUNCTIONS ============

function generateId(): string {
    return `coach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getExpirationTime(minutes: number): string {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m}${ampm}`;
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function getDayOfWeek(date: string): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date(date + 'T12:00:00').getDay()];
}

function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// ============ REAL SLOT FINDER ============

function findAvailableSlots(
    blocks: Array<{ start_time: string; end_time: string; date: string }>,
    date: string,
    durationMinutes: number,
    wakeTime: string,
    sleepTime: string,
    count: number = 3
): Array<{ start: string; end: string }> {
    const dayBlocks = blocks
        .filter(b => b.date === date)
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

    const wakeMin = timeToMinutes(wakeTime);
    const sleepMin = timeToMinutes(sleepTime);
    const results: Array<{ start: string; end: string }> = [];

    // Find gaps between existing blocks
    let cursor = wakeMin;
    for (const block of dayBlocks) {
        const blockStart = timeToMinutes(block.start_time);
        const blockEnd = timeToMinutes(block.end_time);

        if (blockStart - cursor >= durationMinutes) {
            results.push({
                start: minutesToTime(cursor),
                end: minutesToTime(cursor + durationMinutes),
            });
            if (results.length >= count) return results;
        }
        cursor = Math.max(cursor, blockEnd);
    }

    // Check end of day gap
    if (sleepMin - cursor >= durationMinutes) {
        results.push({
            start: minutesToTime(cursor),
            end: minutesToTime(cursor + durationMinutes),
        });
    }

    return results.slice(0, count);
}

// ============ AI-POWERED RESPONSE GENERATOR ============

/**
 * Build a comprehensive prompt context from both Coach and Calendar contexts.
 */
function buildScheduleContextForAI(
    coachCtx: CoachContext,
    calCtx?: CalendarContext | null
): string {
    const now = coachCtx.current;
    const todayBlocks = coachCtx.schedule.today;
    const tomorrowBlocks = coachCtx.schedule.tomorrow || [];
    const weekBlocks = coachCtx.schedule.this_week || [];

    const wakeTime = coachCtx.user.sleep_end || '07:00';
    const sleepTime = coachCtx.user.sleep_start || '23:00';
    const tomorrowDate = addDays(now.date, 1);

    const todayFreeSlots = findAvailableSlots(todayBlocks, now.date, 30, wakeTime, sleepTime, 8);
    const tomorrowFreeSlots = findAvailableSlots(tomorrowBlocks, tomorrowDate, 30, wakeTime, sleepTime, 8);

    const todayText = todayBlocks.length > 0
        ? todayBlocks.map((b: any) =>
            `  ${b.start_time}–${b.end_time}: "${b.context || b.title}" [${b.block_type}] (${b.status})${b.goal_id ? ` → Goal: ${b.goal_id}` : ''}${b.id ? ` ID:${b.id}` : ''}`
        ).join('\n')
        : '  (No blocks scheduled today)';

    const tomorrowText = tomorrowBlocks.length > 0
        ? tomorrowBlocks.slice(0, 10).map((b: any) =>
            `  ${b.start_time}–${b.end_time}: "${b.context || b.title}" [${b.block_type}] (${b.status})${b.id ? ` ID:${b.id}` : ''}`
        ).join('\n')
        : '  (No blocks for tomorrow)';

    const freeSlotsText = `
━━━ VERIFIED FREE SLOTS (USE ONLY THESE — DO NOT SCHEDULE OUTSIDE THESE) ━━━
Today (${now.date}): ${todayFreeSlots.length > 0 ? todayFreeSlots.map(s => `${s.start}–${s.end}`).join(', ') : 'NO FREE SLOTS — suggest tomorrow or replan_week'}
Tomorrow (${tomorrowDate}): ${tomorrowFreeSlots.length > 0 ? tomorrowFreeSlots.map(s => `${s.start}–${s.end}`).join(', ') : 'NO FREE SLOTS'}
⚠️ These slots are mathematically guaranteed to be empty. Any other time is OCCUPIED.`;

    const goalsText = coachCtx.goals.length > 0
        ? coachCtx.goals.map((g: any) =>
            `  - "${g.title}" (Pillar: ${g.pillar}, ${g.minutes_per_day || 60}min/day, ${g.days_per_week || 5}d/week, ${g.weekly_target_minutes || 0}min/week total, Priority: ${g.priority || 'medium'}) ID:${g.id}`
        ).join('\n')
        : '  (No active goals)';

    const commitmentsText = coachCtx.commitments.length > 0
        ? coachCtx.commitments.map((c: any) =>
            `  - "${c.title}" ${c.start_time}–${c.end_time} on ${(c.days_of_week || []).join(', ')} [LOCKED]`
        ).join('\n')
        : '  (No fixed commitments)';

    const todosText = coachCtx.todos && coachCtx.todos.length > 0
        ? coachCtx.todos.map((t: any) =>
            `  - [${t.is_completed ? 'x' : ' '}] "${t.title}" (Priority: ${t.priority || 'medium'})${t.due_date ? ` Due: ${t.due_date}` : ''} ID:${t.id}`
        ).join('\n')
        : '  (No active tasks)';

    let bioContext = '';
    let flowContext = '';

    if (calCtx) {
        const energyDesc = calCtx.user.energy_level >= 7 ? 'HIGH energy' :
            calCtx.user.energy_level >= 4 ? 'MODERATE energy' : 'LOW energy';
        const stressDesc = calCtx.user.stress_level >= 7 ? 'HIGH stress' :
            calCtx.user.stress_level >= 4 ? 'MODERATE stress' : 'LOW stress';

        const wakeMins = timeToMinutes(calCtx.user.sleep_end || '07:00');
        const sleepMins = timeToMinutes(calCtx.user.sleep_start || '23:00');
        const phases = computeDayPhases(wakeMins, sleepMins, (calCtx.user.chronotype || 'bear') as any);
        flowContext = buildFlowPromptFragment(phases, calCtx);
        const progressContext = buildGoalProgressFragment(calCtx);
        flowContext += '\n' + progressContext;

        bioContext = `
━━━ BIO-CONTEXT ━━━
Energy: ${energyDesc} (${calCtx.user.energy_level}/10)
Stress: ${stressDesc} (${calCtx.user.stress_level}/10)
Chronotype: ${calCtx.user.chronotype}
Meals/day: ${calCtx.user.meals_per_day}
Performance (7-day): ${calCtx.performance.last_7_days_completion_rate}% completion (${calCtx.performance.completed_blocks_last_7}/${calCtx.performance.total_blocks_last_7} blocks)
Capacity: ${calCtx.capacity.daily_awake_hours}h awake, ${calCtx.capacity.weekly_available_hours}h available/week
${calCtx.capacity.is_overcommitted ? '⚠️ USER IS OVERCOMMITTED — reduce load' : '✓ Capacity OK'}

━━━ HABIT STACKS ━━━
${calCtx.habitStacks.length > 0
                ? calCtx.habitStacks.map(h => `  When "${h.trigger_habit}" → "${h.action_habit}" (${h.action_duration_mins}min)`).join('\n')
                : '  (None)'}`;
    }

    const prefsText = coachCtx.learned_preferences?.length > 0
        ? coachCtx.learned_preferences.map(p => `  - ${p.natural_language}`).join('\n')
        : '  (No learned preferences)';

    return `
━━━ CURRENT STATE ━━━
Date: ${now.date} (${now.day_of_week})
Time: ${now.time}
User: ${coachCtx.user.first_name}
Sleep: ${coachCtx.user.sleep_end} wake → ${coachCtx.user.sleep_start} sleep
Minimal mode: ${coachCtx.user_state.is_minimal_mode}
Recent missed blocks: ${coachCtx.user_state.recent_missed_blocks}
${bioContext}

━━━ TODAY'S SCHEDULE (${now.date}) ━━━
${todayText}

━━━ TOMORROW'S SCHEDULE ━━━
${tomorrowText}
${freeSlotsText}

━━━ THIS WEEK'S FULL SCHEDULE ━━━
${weekBlocks.length > 0
    ? (() => {
        // Group by date
        const byDate = new Map<string, any[]>();
        weekBlocks.forEach((b: any) => {
            const d = b.date;
            if (!byDate.has(d)) byDate.set(d, []);
            byDate.get(d)!.push(b);
        });
        return Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, blocks]) => {
                const dayName = getDayOfWeek(date).toUpperCase();
                const lines = blocks.map((b: any) =>
                    `    ${b.start_time}–${b.end_time}: "${b.context || b.title}" [${b.block_type}] (${b.status})${b.goal_id ? ` → Goal: ${b.goal_id}` : ''}${b.id ? ` ID:${b.id}` : ''}`
                ).join('\n');
                return `  ${dayName} (${date}):\n${lines}`;
            }).join('\n');
    })()
    : '  (No blocks this week)'}

━━━ ACTIVE GOALS (with daily/weekly constraints) ━━━
${goalsText}

━━━ TO-DO LIST (TASKS) ━━━
${todosText}

━━━ FIXED COMMITMENTS (LOCKED — NEVER MODIFY) ━━━
${commitmentsText}

━━━ LEARNED PREFERENCES ━━━
${prefsText}

${flowContext}`;
}

// Intent categories
const SCHEDULE_MODIFICATION_INTENTS = new Set([
    CoachIntent.MOVE_BLOCK,
    CoachIntent.ADD_TASK,
    CoachIntent.COMPLETE_TASK,
    CoachIntent.DELETE_TASK,
    CoachIntent.DELETE_BLOCK,
    CoachIntent.RESCHEDULE_DAY,
    CoachIntent.RESCHEDULE_WEEK,
    CoachIntent.BUSY_AT_TIME,
    CoachIntent.ENERGY_LOW,
    CoachIntent.ENERGY_HIGH,
    CoachIntent.OVERWHELMED,
    CoachIntent.BORED,
    CoachIntent.ADJUST_GOAL,
    CoachIntent.PAUSE_GOAL,
]);

const INFORMATION_INTENTS = new Set([
    CoachIntent.WHAT_NEXT,
    CoachIntent.EXPLAIN_SCHEDULE,
    CoachIntent.PROGRESS_CHECK,
    CoachIntent.GOAL_PROGRESS,
]);

/**
 * AI-powered response generator for schedule modification intents.
 * Uses the full calendar context + user message to produce real CalendarPatch options.
 */
async function generateAIScheduleResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    coachCtx: CoachContext,
    classification: IntentClassification,
    calCtx?: CalendarContext | null
): Promise<CoachResponse> {
    const scheduleContext = buildScheduleContextForAI(coachCtx, calCtx);

const systemPrompt = `You are Donna, PlannrAI's Flow State and Performance Coach. You operate with 'Tough Love'. You are direct, no-nonsense, highly empathetic but fiercely protective of the user's potential. You do not coddle. If they are slacking, you call it out respectfully. If they are overwhelmed, you aggressively cut the fat from their schedule. Your priority is their long-term growth and immediate flow state. You manage their focus as their most precious resource.

STRATEGIC DIRECTIVES:
1. FLOW STATE PROTECTION: Prioritize deep work blocks (90-120 min) during the user's PEAK energy phases.
2. TROUGH MANAGEMENT: Place administrativia, meals, and low-cognitive tasks in TROUGH phases.
3. BUFFERS: Proactively insert 15-30 min "Neural Buffers" after high-intensity blocks.
4. AGGRESSIVE OPTIMIZATION: If the user is overwhelmed, don't just "ask"—actively propose clearing or deferring low-priority tasks. Use your tough love persona to explain why they need a break.
5. PRIORITY ENFORCEMENT: When a high-priority goal needs time, displace lower-priority blocks to make room. Buffers, breaks, and flex blocks are always fair game. Goal blocks can be displaced only if a higher-priority goal needs that slot. Never sacrifice sleep, meals, or anchor commitments.
6. ONE BODY GOAL PER DAY: Max ONE body-pillar goal per day (Gym, Football, Cardio, etc.). Never propose a workout if one already exists or is being added.
6. AUTO-EXECUTION VS PROPOSAL:
   - SELECT "suggested_mode": "execute" ONLY for:
     * Single block MOVE of < 60 minutes for a non-anchor block.
     * Single block CREATION of a 'flex' block.
     * Single to-do task creation (create_todo).
     * Status updates for existing blocks.

🎯 GOAL TIME ENFORCEMENT (CRITICAL):
- Each goal has a minutes_per_day and days_per_week constraint shown in ACTIVE GOALS.
- NEVER schedule more than the goal's minutes_per_day for any single goal on any day.
- NEVER schedule a goal on more days than its days_per_week limit.
- When the user asks to schedule a goal, check how much time is already allocated for that goal today/this week before adding more.
- If the goal is already fully scheduled, tell the user instead of creating more blocks.
   - SELECT "suggested_mode": "propose" ALWAYS for:
     * ANY change involving 'anchor' blocks.
     * Multi-block rescheduling (> 1 block moved/created).
     * Any change spanning multiple days.
     * Large-scale optimizations or deletions.

🔀 MOVING EXISTING BLOCKS (CRITICAL — READ CAREFULLY):
- When the user asks to "move", "reschedule", "shift", or "put [block] at [time]":
  1. Search THIS WEEK'S FULL SCHEDULE for the block they mentioned by title/context.
  2. Copy its EXACT ID value from the "ID:xxxxx" part of the schedule listing.
  3. Use ONLY move_block with that exact ID — NEVER create_block for a move.
  4. Always include new_date when moving to a different day (format: YYYY-MM-DD).
  5. NEVER move a block to a date or time that is in the past (before TODAY). Blocks can only be moved to the current day or any day after in the week.
  6. If you cannot find the block ID in the schedule, say so — do NOT invent an ID.
- create_block is ONLY for adding a brand-new block that doesn't already exist.
- If you use create_block when move_block was needed, you will duplicate the block and leave the original in place — this is WRONG.

🚫 IMMUTABLE BLOCKS (ABSOLUTE — NEVER VIOLATE):
- NEVER move, delete, modify, or reschedule blocks of type: sleep, meal, wind_down, anchor.
- These are biological necessities and fixed commitments. They are SACRED.
- A replanned or rescheduled block should NEVER be scheduled for a time that is covered by anchors, sleep, meal, or wind_down. These slots are completely off-limits for new or moved blocks.
- To free up time, you MUST work around goal blocks, buffer blocks, routine blocks, or flex blocks ONLY.
- If the user asks to skip sleep or meals, REFUSE and explain why it's harmful.
- If all remaining blocks are immutable, tell the user there's nothing to optimize.

🔄 MISSED BLOCK WATERFALL PROTOCOL (STRICT EXECUTION ORDER):
When the user says they missed or will miss a block and want to reschedule, you MUST follow these exact steps in order:

1. FREE SLOT (Ideal):
   - Move the missed block to a verified free time slot later in the week.
   - Set the block's 'block_type' to 'anchor' (using update_block or setting it in move_block) so it becomes locked and no new blocks can be scheduled over it.
   - The original time slot becomes blank naturally via the move.

2. LOWER PRIORITY DISPLACEMENT (No free slots):
   - Find a block scheduled *after* the missed time that has a LOWER priority.
   - Priority order: user-flagged goals > craft/mind/body goal blocks > flex/buffer > routine > break.
   - CRITICAL RULE: NEVER replace a block that belongs to the SAME goal as the missed block. The net number of blocks for this goal must not decrease.
   - Generate a delete_block for the lower-priority block (it is removed from the week).
   - Generate a move_block putting the missed block exactly in that newly freed slot.

3. SAME PILLAR (Multiple Blocks):
   - If no lower priority blocks exist, look for a block under the SAME PILLAR that has multiple blocks scheduled later in the week.
   - Do NOT execute immediately. Use 'suggested_mode: "propose"' to ask the user if they are okay with sacrificing one of these same-pillar blocks.

4. SISTER PILLAR (Craft <-> Mind):
   - If the above fails, look for a block under the "sister" pillar that has multiple blocks in the week.
   - If the missed block is Craft, look for a Mind block to sacrifice. If the missed block is Mind, look for a Craft block to sacrifice.
   - CRITICAL RULE: The BODY pillar is the absolute last resort. Avoid touching it entirely unless explicitly instructed by the user.
   - Use 'suggested_mode: "propose"' to ask the user to sacrifice one of these blocks.

5. MANUAL NEGOTIATION:
   - If all targeted lookups fail, use 'suggested_mode: "clarify"' to explicitly ask the user: "Which pillar or goal are you okay with reducing by one block for the week?"
   - When proposing *any* displacement, clearly explain what is being removed and where the missed block is going.

6. FULL WEEK REPLAN:
   - If the user denies the options or no slots exist at all, propose a full 'replan_week' operation (e.g. { type: "replan_week", mode: "balanced" }) to regenerate the remainder of the week and perfectly fit the missed block back in.

⚖️ PRIORITY-BASED DISPLACEMENT (GENERAL BEHAVIOUR):
When the user wants to move a block to a time slot that is already occupied (NOT following the missed block waterfall):
- Compare the priority/importance of the target block vs the occupying block.
- If the target is HIGHER priority: generate delete_block OR move_block for the occupying block FIRST, THEN move_block for the high-priority block.
- Immutable blocks (sleep, meal, wind_down, anchor) can NEVER be displaced regardless of priority.

🚨 CONFLICT RESOLUTION — ALWAYS GENERATE A COMPLETE PATCH:
- If a slot is occupied by a displaceable block, generate BOTH the removal AND the placement — never generate just one.
- Operation order matters: displacement ops FIRST, then the placement op.
- Before every move_block or create_block, check THIS WEEK'S FULL SCHEDULE for conflicts.
- TASKS VS BLOCKS: Use create_todo for tasks without a specific time; create_block only for calendar time blocks.
- block_type MUST be one of: anchor, goal, meal, buffer, routine, sleep, wind_down, flex. Never use "task", "shopping", "errand", or custom values.

🔁 COUNTER-PROPOSALS & SWAPS (CRITICAL):
- If the user REJECTED a previous option and suggests an alternative:
  1. Identify the existing block they referenced. Use the EXACT block ID from the schedule.
  2. If replacing: generate delete_block for the displaced block FIRST, then place the new one.
  3. If just changing time: generate move_block at the user's requested time.
  4. State clearly what was replaced and why.
- Swapped blocks MUST go on the SAME DATE as the displaced block.
- Use the EXACT date from the schedule (e.g., "2026-05-14") — never guess or default to today.

PATCH OPERATION TYPES:
- create_block: { type: "create_block", data: { date, start_time, end_time, title, context, block_type, goal_id?, pillar?, checklist? } }
- move_block: { type: "move_block", block_id: "existing-id", title: "Block Title", new_start: "HH:MM", new_end: "HH:MM", new_date?: "YYYY-MM-DD" }
- update_block: { type: "update_block", block_id: "existing-id", title: "Block Title", changes: { status?, title?, start_time?, end_time? } }
- delete_block: { type: "delete_block", block_id: "existing-id", title: "Block Title" }
- replan_week: { type: "replan_week", mode: "balanced|momentum|recovery", allow_weekend: boolean } Use this when user wants to replan the rest of their week or accommodate missed blocks by regenerating future blocks.
- create_goal: { type: "create_goal", data: { title, pillar, minutes_per_day, days_per_week } }
- update_goal: { type: "update_goal", goal_id: "existing-id", changes: { ... } }
- delete_goal: { type: "delete_goal", goal_id: "existing-id", title: "Goal Title" }
- create_todo: { type: "create_todo", data: { title, due_date?, priority? } }
- update_todo: { type: "update_todo", todo_id: "existing-id", changes: { is_completed?, title?, due_date?, priority? } }
- delete_todo: { type: "delete_todo", todo_id: "existing-id" }

🚨 OUTPUT FORMAT (STRICT JSON ONLY):
- Return a single valid JSON object.
- NO markdown formatting (no \`\`\`json).
- NO text before or after the JSON.
- "summary": Must be a conversational string in your persona. NEVER include JSON or operations inside the summary string.
{
  "summary": "Donna's conversational response. Speak directly to the user with tough love, high standards, and actionable advice. (2-3 sentences)",
  "confidence_score": 0.0-1.0,
  "suggested_mode": "propose" | "execute",
  "strategic_insight": "A single sentence explaining WHY this optimization matters for their goals",
  "options": [
    {
      "id": "option_1",
      "title": "Short title",
      "description": "What this option does",
      "impact": "Concrete positive outcome (e.g., 'Reclaims 2 hours of peak focus')",
      "tradeoff": { "warning": "Any downsides", "severity": "info|caution|warning" },
      "operations": [
        { "type": "create_block|move_block|update_block|delete_block|replan_week|create_todo|update_todo|delete_todo|create_goal|update_goal|delete_goal", ... }
      ],
      "recommended": true
    }
  ]
}`;

    const recentHistory = conversationHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

    const userPrompt = `${scheduleContext}

━━━ RECENT CONVERSATION ━━━
${recentHistory}

━━━ CURRENT REQUEST ━━━
Intent: ${classification.primary_intent}
User message: "${userMessage}"
${classification.entities.time ? `Mentioned time: ${classification.entities.time}` : ''}
${classification.entities.date ? `Mentioned date: ${classification.entities.date}` : ''}
${classification.entities.block_reference ? `Block reference: ${classification.entities.block_reference}` : ''}
${classification.entities.duration ? `Duration: ${classification.entities.duration}` : ''}
${classification.extracted_constraint ? `Constraint: ${classification.extracted_constraint.type} ${classification.extracted_constraint.start_time}-${classification.extracted_constraint.end_time} on ${classification.extracted_constraint.date}` : ''}

Generate 2-3 actionable options with concrete patch operations. Return valid JSON only.`;

    try {
        const response = await callAI<{
            summary: string;
            confidence_score: number;
            suggested_mode: 'execute' | 'propose';
            strategic_insight?: string;
            options: Array<{
                id: string;
                title: string;
                description: string;
                impact: string;
                tradeoff?: { warning: string; severity: string };
                operations: PatchOperation[];
                blocks_added: number;
                blocks_modified: number;
                blocks_removed: number;
                affected_dates: string[];
                recommended: boolean;
            }>;
        }>({
            prompt: userPrompt,
            systemPrompt,
            model: 'smart',
            temperature: 0.5,
            maxTokens: 2500,
            requireJSON: true,
            timeout: 45000,
        });

        if (response.success && response.data && response.data.options?.length) {
            const data = response.data;

            // Determine the final mode: if AI is confident and recommends 'execute', we double-check complexity
            const option = data.options[0];
            const opCount = option.operations?.length || 0;
            const hasAnchorMove = option.operations?.some(op => 
                (op.type === 'move_block' || op.type === 'update_block') && 
                (op as any).block_type === 'anchor'
            );

            // Simple = High confidence, suggested execute, small op count, no anchors
            const isSimple = data.suggested_mode === 'execute' && 
                             data.confidence_score > 0.9 && 
                             opCount <= 1 && 
                             !hasAnchorMove;

            const aiMode = isSimple ? 'execute' : 'propose';

            const options: CoachOption[] = data.options.map((opt, i) => {
                const normalizedOps = (opt.operations || []).map(normalizeOperation);
                // Convert to CalendarPatchOp format for the UI card
                const calendarOps = normalizedOps.map(convertToCalendarPatchOp);
                // Compute preview counts from actual operations (don't trust AI)
                const blocksAdded = normalizedOps.filter(o => o.type === 'create_block' || o.type === 'create_todo' || o.type === 'create_goal').length;
                const blocksModified = normalizedOps.filter(o => o.type === 'move_block' || o.type === 'update_block' || o.type === 'update_todo' || o.type === 'update_goal').length;
                const blocksRemoved = normalizedOps.filter(o => o.type === 'delete_block' || o.type === 'delete_todo' || o.type === 'delete_goal').length;
                const dates = new Set<string>();
                normalizedOps.forEach(o => {
                    if (o.type === 'create_block' && o.data?.date) dates.add(o.data.date);
                    else if (o.type === 'move_block' && o.new_date) dates.add(o.new_date);
                    else dates.add(coachCtx.current.date);
                });

                return {
                    id: opt.id || `option_${i}`,
                    title: opt.title,
                    description: opt.description,
                    impact: opt.impact || data.strategic_insight || "Optimizing your schedule",
                    tradeoff: opt.tradeoff ? {
                        warning: opt.tradeoff.warning,
                        severity: (opt.tradeoff.severity as 'info' | 'caution' | 'warning') || 'info',
                    } : undefined,
                    patch: {
                        operations: normalizedOps,
                        ops: calendarOps,
                        requires_confirmation: aiMode === 'execute' ? false : true,
                    },
                    preview: {
                        blocks_added: blocksAdded,
                        blocks_modified: blocksModified,
                        blocks_removed: blocksRemoved,
                        affected_dates: Array.from(dates),
                    },
                    recommended: opt.recommended || false,
                };
            });

            // Ensure at least one is recommended
            if (!options.some(o => o.recommended) && options.length > 0) {
                options[0].recommended = true;
            }

            return {
                id: generateId(),
                timestamp: new Date().toISOString(),
                mode: aiMode,
                summary: data.summary || "Here are some options for you.",
                options,
                minimal_mode: coachCtx.user_state.is_minimal_mode,
                conversation_context: { can_undo: false },
                options_expire_at: getExpirationTime(15),
            };
        }

        // AI failed — generate a simple fallback based on intent
        console.warn('[CoachAI] AI response failed, using fallback for intent:', classification.primary_intent);
        return generateFallbackResponse(coachCtx, classification, userMessage);
    } catch (error) {
        console.error('[CoachAI] Error in AI schedule response:', error);
        return generateFallbackResponse(coachCtx, classification, userMessage);
    }
}

/**
 * Normalize AI-generated operations to ensure correct types
 */
function normalizeOperation(op: any): PatchOperation {
    const type = op.type || op.op;
    switch (type) {
        case 'create_block':
        case 'create':
        case 'create_event': {
            const rawBlockType = op.data?.block_type || op.block_type || 'flex';
            return {
                type: 'create_block',
                data: {
                    date: op.data?.date || op.date,
                    start_time: op.data?.start_time || op.start_time,
                    end_time: op.data?.end_time || op.end_time,
                    context: op.data?.context || op.data?.title || op.context || op.title || 'New Block',
                    title: op.data?.title || op.data?.context || op.title || 'New Block',
                    block_type: VALID_BLOCK_TYPES.includes(rawBlockType) ? rawBlockType : 'flex',
                    energy_level_required: op.data?.energy_level_required,
                    goal_id: op.data?.goal_id || op.goal_id,
                    pillar: op.data?.pillar || op.pillar,
                    checklist: op.data?.checklist || op.checklist,
                },
            };
        }
        case 'move_block':
        case 'move':
        case 'move_event':
            return {
                type: 'move_block',
                block_id: op.block_id || op.event_id || op.id,
                title: op.title || op.data?.title || op.data?.context,
                new_start: op.new_start || op.to_start || op.start_time,
                new_end: op.new_end || op.to_end || op.end_time,
                new_date: op.new_date || op.date,
            };
        case 'update_block':
        case 'update':
        case 'update_event':
            return {
                type: 'update_block',
                block_id: op.block_id || op.event_id || op.id,
                changes: op.changes || op.fields || {},
            };
        case 'delete_block':
        case 'delete':
        case 'delete_event':
            return {
                type: 'delete_block',
                block_id: op.block_id || op.event_id || op.id,
                title: op.title || op.data?.title || op.data?.context,
            } as any;
        case 'replan_week':
            return {
                type: 'replan_week',
                mode: op.mode || 'balanced',
                allow_weekend: op.allow_weekend !== undefined ? op.allow_weekend : true
            };
        case 'create_goal':
            return {
                type: 'create_goal',
                data: {
                    title: op.data?.title || op.title,
                    pillar: op.data?.pillar || op.pillar || 'General',
                    minutes_per_day: op.data?.minutes_per_day || op.minutes_per_day || 60,
                    days_per_week: op.data?.days_per_week || op.days_per_week || 5,
                },
            };
        case 'update_goal':
            return {
                type: 'update_goal',
                goal_id: op.goal_id || op.id,
                changes: op.changes || op.fields || {},
            };
        case 'delete_goal':
            return {
                type: 'delete_goal',
                goal_id: op.goal_id || op.id,
            };
        case 'create_todo':
            return {
                type: 'create_todo',
                data: {
                    title: op.data?.title || op.title,
                    due_date: op.data?.due_date || op.due_date,
                    priority: op.data?.priority || op.priority || 'medium',
                },
            };
        case 'update_todo':
            return {
                type: 'update_todo',
                todo_id: op.todo_id || op.id,
                changes: op.changes || op.fields || {},
            };
        case 'delete_todo':
            return {
                type: 'delete_todo',
                todo_id: op.todo_id || op.id,
            };
        default:
            console.warn('[CoachAI] Unknown operation type:', type);
            return op;
    }
}

/**
 * Convert internal PatchOperation to CalendarPatchOp format for UI rendering.
 * The UI card (CoachOptionCard) reads option.patch.ops[] which uses CalendarPatchOp shape.
 */
function convertToCalendarPatchOp(op: PatchOperation): any {
    switch (op.type) {
        case 'create_block':
            return {
                op: 'create_event',
                event: op.data,
                payload: op.data,
                title: op.data?.title,
                start_time: op.data?.start_time,
                end_time: op.data?.end_time,
                date: op.data?.date,
            };
        case 'move_block':
            return {
                op: 'move_event',
                event_id: op.block_id,
                to_start: op.new_start,
                to_end: op.new_end,
                date: op.new_date,
                title: (op as any).title || 'Block',
            };
        case 'update_block':
            return {
                op: 'update_event',
                event_id: op.block_id,
                fields: op.changes,
                title: (op as any).title || 'Block',
            };
        case 'delete_block':
            return {
                op: 'delete_event',
                event_id: op.block_id,
                title: (op as any).title || 'Block',
            };
        case 'replan_week':
            return {
                op: 'replan_week',
                payload: { mode: op.mode, allow_weekend: op.allow_weekend },
                title: 'Regenerate Week'
            };
        case 'create_goal':
            return {
                op: 'create_goal',
                payload: op.data,
                title: op.data?.title || 'Goal',
            };
        case 'update_goal':
            return {
                op: 'update_goal',
                goal_id: op.goal_id,
                fields: op.changes,
            };
        case 'delete_goal':
            return {
                op: 'delete_goal',
                goal_id: op.goal_id,
                title: (op as any).title || 'Goal',
            };
        case 'create_todo':
            return {
                op: 'create_todo',
                payload: op.data,
                title: op.data?.title,
            };
        case 'update_todo':
            return {
                op: 'update_todo',
                todo_id: op.todo_id,
                fields: op.changes,
                title: (op as any).title || 'Task',
            };
        case 'delete_todo':
            return {
                op: 'delete_todo',
                todo_id: op.todo_id,
                title: (op as any).title || 'Task',
            };
        default:
            return op;
    }
}

/**
 * Fallback response when AI can't generate proper schedule modifications.
 */
function generateFallbackResponse(
    coachCtx: CoachContext,
    classification: IntentClassification,
    userMessage: string
): CoachResponse {
    const intent = classification.primary_intent;
    const todayBlocks = coachCtx.schedule.today || [];
    const remainingBlocks = todayBlocks.filter((b: any) =>
        b.status === 'planned' && timeToMinutes(b.start_time) > timeToMinutes(coachCtx.current.time)
    );

    let summary = "I understand what you need. Here's what I can do:";
    const options: CoachOption[] = [];

    if (intent === CoachIntent.OVERWHELMED || intent === CoachIntent.ENERGY_LOW) {
        summary = "I hear you. Let's lighten your load.";

        if (remainingBlocks.length > 0) {
            // Option 1: Keep essentials only (first 2 blocks)
            const essential = remainingBlocks.slice(0, 2);
            const nonEssential = remainingBlocks.slice(2);

            if (nonEssential.length > 0) {
                options.push({
                    id: 'essentials_only',
                    title: 'Keep essentials only',
                    description: `Focus on your ${essential.length} most important tasks, defer ${nonEssential.length} to tomorrow`,
                    impact: `${nonEssential.length} blocks moved to tomorrow`,
                    patch: {
                        operations: nonEssential.map((block: any) => ({
                            type: 'move_block' as const,
                            block_id: block.id,
                            new_start: block.start_time,
                            new_end: block.end_time,
                            new_date: addDays(coachCtx.current.date, 1),
                        })),
                        requires_confirmation: false,
                    },
                    preview: {
                        blocks_added: 0,
                        blocks_modified: nonEssential.length,
                        blocks_removed: 0,
                        affected_dates: [coachCtx.current.date, addDays(coachCtx.current.date, 1)],
                    },
                    recommended: true,
                });
            }

            // Option 2: Recovery day
            options.push({
                id: 'recovery_day',
                title: 'Take a recovery day',
                description: `Clear all ${remainingBlocks.length} remaining blocks`,
                impact: 'Full recovery — all blocks deferred to tomorrow',
                tradeoff: {
                    warning: "Today's goals won't be met, but you'll recover",
                    severity: 'info',
                },
                patch: {
                    operations: remainingBlocks.map((block: any) => ({
                        type: 'move_block' as const,
                        block_id: block.id,
                        new_start: block.start_time,
                        new_end: block.end_time,
                        new_date: addDays(coachCtx.current.date, 1),
                    })),
                    requires_confirmation: true,
                },
                preview: {
                    blocks_added: 0,
                    blocks_modified: remainingBlocks.length,
                    blocks_removed: 0,
                    affected_dates: [coachCtx.current.date, addDays(coachCtx.current.date, 1)],
                },
                recommended: false,
            });
        }
    } else if (intent === CoachIntent.WHAT_NEXT) {
        const nextBlock = remainingBlocks[0];
        if (nextBlock) {
            const startsIn = timeToMinutes(nextBlock.start_time) - timeToMinutes(coachCtx.current.time);
            summary = startsIn <= 5
                ? `Now: ${(nextBlock as any).context || (nextBlock as any).title}`
                : `Up next in ${startsIn} min: ${(nextBlock as any).context || (nextBlock as any).title}`;
        } else {
            summary = "You're done for today! No more scheduled blocks.";
        }
    } else {
        summary = `I'd like to help with that. Let me know more specifics — for example, what time or which block you'd like to change.`;
    }

    // Add a manual fallback option
    options.push({
        id: 'open_calendar',
        title: 'Open calendar',
        description: 'Make changes manually in the calendar',
        impact: 'Full control over your schedule',
        patch: { operations: [], requires_confirmation: false },
        preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
        recommended: options.length === 0,
    });

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: options.length > 1 ? 'propose' : 'inform',
        summary,
        options,
        minimal_mode: coachCtx.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(15),
    };
}

/**
 * AI-powered response for informational intents (progress, what's next, explain schedule).
 */
async function generateAIInformResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    coachCtx: CoachContext,
    classification: IntentClassification,
    calCtx?: CalendarContext | null
): Promise<CoachResponse> {
    const scheduleContext = buildScheduleContextForAI(coachCtx, calCtx);

    const systemPrompt = `You are Donna, PlannrAI's Flow State and Performance Coach. You operate with 'Tough Love'. You are direct, no-nonsense, highly empathetic but fiercely protective of the user's potential. You do not coddle. If they are behind on goals, you call it out. If they're crushing it, you celebrate briefly and push for more.

The user is asking about their schedule, goals, or progress. Give them a data-driven answer using REAL numbers from their schedule. Be specific — mention block titles, completion percentages, and concrete insights.

OUTPUT FORMAT (strict JSON):
{
  "summary": "Donna's direct, data-driven response. Use tough love tone. Reference specific schedule data. (2-4 sentences max)",
  "suggestions": ["Optional actionable suggestion 1", "Optional actionable suggestion 2"]
}`;


    const userPrompt = `${scheduleContext}

User asks: "${userMessage}"
Intent: ${classification.primary_intent}

Respond with helpful, data-driven information. Return valid JSON only.`;

    try {
        const response = await callAI<{ summary: string; suggestions?: string[] }>({
            prompt: userPrompt,
            systemPrompt,
            model: 'fast',
            temperature: 0.4,
            maxTokens: 1000,
            requireJSON: true,
            timeout: 30000,
            useNvidia: true,
        });

        if (response.success && response.data?.summary) {
            return {
                id: generateId(),
                timestamp: new Date().toISOString(),
                mode: 'inform',
                summary: response.data.summary,
                options: (response.data.suggestions || []).map((s, i) => ({
                    id: `suggestion_${i}`,
                    title: s,
                    description: s,
                    impact: '',
                    patch: { operations: [], requires_confirmation: false },
                    preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
                    recommended: i === 0,
                })),
                minimal_mode: coachCtx.user_state.is_minimal_mode,
                conversation_context: { can_undo: false },
                options_expire_at: getExpirationTime(10),
            };
        }
    } catch (error) {
        console.error('[CoachAI] Info response error:', error);
    }

    // Fallback for info requests
    return generateFallbackResponse(coachCtx, classification, userMessage);
}

/**
 * Response for general chat / acknowledgment
 */
function generateAcknowledgmentResponse(
    coachCtx: CoachContext
): CoachResponse {
    const message = coachCtx.last_user_message || '';
    const lower = message.toLowerCase();
    const missedBlocks = coachCtx.user_state.recent_missed_blocks;

    // Tough Love acknowledgments based on emotional context + schedule state
    let ack = { message: "Got it. Now let's make it count.", offer: "Need me to optimize something?" };

    if (/(hate|frustrated|annoying|ugh|terrible)/i.test(lower)) {
        ack = missedBlocks >= 3
            ? { message: `I hear you. But ${missedBlocks} missed blocks today isn't frustration — that's avoidance. Let's fix the root cause.`, offer: "Want me to cut the fat from your schedule?" }
            : { message: "Frustration is signal, not noise. Something about your schedule isn't working. Let's fix it.", offer: "Tell me what's not working and I'll restructure." };
    } else if (/(stressed|anxious|worried|overwhelmed)/i.test(lower)) {
        ack = { message: "Your brain is telling you it's overloaded. That's actually useful data. Let's lighten the load strategically — not randomly.", offer: "I can clear everything except your top 2 priorities." };
    } else if (/(thanks|thank you|great|awesome|perfect)/i.test(lower)) {
        ack = { message: "Good. Stay locked in. 💪", offer: "What's next on your radar?" };
    } else if (/(tired|sleepy|exhausted|drained)/i.test(lower)) {
        ack = { message: "Your body is keeping score. Rest isn't weakness — it's strategy. Let me adjust your remaining blocks.", offer: "Want me to switch to recovery mode?" };
    }

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'acknowledge',
        summary: ack.message,
        acknowledgment: { message: ack.message, offer: ack.offer },
        options: [{
            id: 'lighten_load',
            title: 'Lighten my load',
            description: "Reduce today's workload",
            impact: 'Fewer tasks, more breathing room',
            patch: { operations: [], requires_confirmation: false },
            preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
            recommended: false,
        }],
        minimal_mode: coachCtx.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

/**
 * Out of scope response
 */
function generateOutOfScopeResponse(coachCtx: CoachContext): CoachResponse {
    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'acknowledge',
        summary: "I'm your scheduling assistant — I focus on helping you plan your time, manage goals, and optimize your calendar.",
        acknowledgment: {
            message: "I'm your scheduling assistant — I focus on helping you plan your time.",
            offer: "Try asking me to reorganize your day, add a task, or check your progress!",
        },
        minimal_mode: coachCtx.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

/**
 * Clarification response
 */
function generateClarificationResponse(
    coachCtx: CoachContext,
    classification: IntentClassification
): CoachResponse {
    const question = classification.clarification_question ||
        "Could you tell me more about what you'd like to do?";

    const blockTypes = [...new Set(coachCtx.schedule.today.map((b: any) => b.context || b.title))];
    const suggestions: string[] = [];

    if (blockTypes.length > 0) {
        suggestions.push(`Move my ${blockTypes[0]}`);
        suggestions.push(`Cancel my ${blockTypes[0]}`);
    }
    suggestions.push('Reorganize today');
    suggestions.push("I'm exhausted");

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'clarify',
        summary: question,
        clarification: { question, suggestions: suggestions.slice(0, 4) },
        minimal_mode: coachCtx.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

/**
 * Undo response — special handling
 */
function generateUndoResponse(coachCtx: CoachContext): CoachResponse {
    if (coachCtx.last_applied_patch_version_id) {
        return {
            id: generateId(),
            timestamp: new Date().toISOString(),
            mode: 'execute',
            summary: "I'll undo the last change for you.",
            options: [{
                id: 'undo',
                title: 'Undo last change',
                description: 'Revert the most recent schedule modification',
                impact: 'Schedule restored to previous state',
                patch: { operations: [], requires_confirmation: false },
                preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
                recommended: true,
            }],
            minimal_mode: coachCtx.user_state.is_minimal_mode,
            conversation_context: {
                can_undo: true,
                last_patch_version_id: coachCtx.last_applied_patch_version_id,
            },
            options_expire_at: getExpirationTime(5),
        };
    }

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'inform',
        summary: "There's nothing to undo right now.",
        minimal_mode: coachCtx.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ MAIN ENTRY POINT ============

export async function generateCoachResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    context: CoachContext,
    supabase?: any,
    prebuiltCalCtx?: CalendarContext | null
): Promise<CoachResponse> {
    // 1. Classify intent
    const classification = await classifyIntent(
        userMessage,
        conversationHistory,
        {
            current_time: context.current.time,
            today_blocks: context.schedule.today,
            goals: context.goals,
            recent_energy: context.user_state.last_energy_checkin,
        }
    );

    const intent = classification.primary_intent;

    // 2. Use pre-built calendar context if provided, otherwise build fresh (deduplication)
    let calCtx: CalendarContext | null = prebuiltCalCtx || null;
    if (!calCtx && supabase) {
        try {
            calCtx = await buildCalendarContext(context.user.id, supabase);
        } catch (e) {
            console.warn('[CoachAI] Failed to build calendar context:', e);
        }
    }

    // 3. Route to appropriate handler
    if (classification.requires_clarification && intent === CoachIntent.CLARIFICATION_NEEDED) {
        return generateClarificationResponse(context, classification);
    }

    if (intent === CoachIntent.UNDO_LAST) {
        return generateUndoResponse(context);
    }

    if (intent === CoachIntent.GENERAL_CHAT) {
        return generateAcknowledgmentResponse(context);
    }

    if (intent === CoachIntent.OUT_OF_SCOPE) {
        return generateOutOfScopeResponse(context);
    }

    if (INFORMATION_INTENTS.has(intent)) {
        return generateAIInformResponse(userMessage, conversationHistory, context, classification, calCtx);
    }

    if (SCHEDULE_MODIFICATION_INTENTS.has(intent)) {
        return generateAIScheduleResponse(userMessage, conversationHistory, context, classification, calCtx);
    }

    // Default: try AI schedule response for anything unrecognized
    return generateAIScheduleResponse(userMessage, conversationHistory, context, classification, calCtx);
}
