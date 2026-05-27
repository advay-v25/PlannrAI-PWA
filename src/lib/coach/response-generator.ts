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
    execution_tactics?: string;
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
    scenario_analysis?: string;
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
    | { type: 'replan_day'; mode?: 'balanced' | 'momentum' | 'recovery' }
    | { type: 'update_goal'; goal_id: string; changes: Partial<GoalData> }
    | { type: 'create_goal'; data: NewGoalData }
    | { type: 'delete_goal'; goal_id: string }
    | { type: 'create_todo'; data: NewTodoData }
    | { type: 'update_todo'; todo_id: string; changes: Partial<TodoData> }
    | { type: 'delete_todo'; todo_id: string }
    | { type: 'update_settings'; data: any };

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
    if (minutes === 1440) return '00:00';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function getBlockPillarAndPriority(block: any, coachCtx: CoachContext) {
    const goal = coachCtx.goals.find(g => g.id === block.goal_id);
    const pillar = goal?.pillar || block.pillar || 'craft'; // default to craft
    
    // priority could be a string 'low'|'medium'|'high' or a number
    const rawPriority = goal?.priority !== undefined ? goal.priority : (block.priority !== undefined ? block.priority : 'medium');
    let priorityVal = 2; // medium by default
    if (rawPriority === 'high' || rawPriority === 3) priorityVal = 3;
    if (rawPriority === 'low' || rawPriority === 1) priorityVal = 1;
    
    return { pillar, priority: rawPriority, priorityVal, goalId: block.goal_id };
}

// ============ REAL SLOT FINDER ============

interface FreeSlot { start: string; end: string; duration_mins: number }

function formatSlot(s: FreeSlot): string {
    const h = Math.floor(s.duration_mins / 60);
    const m = s.duration_mins % 60;
    const dur = h > 0 && m > 0 ? `${h}h${m}min` : h > 0 ? `${h}h` : `${m}min`;
    return `${s.start}–${s.end} (${dur} free)`;
}

function findAvailableSlots(
    blocks: Array<{ start_time: string; end_time: string; date: string }>,
    date: string,
    minDurationMinutes: number,
    wakeTime: string,
    sleepTime: string,
    count: number = 8,
    notBeforeTime?: string,
    treatAllBlocksAsOccupied: boolean = false
): FreeSlot[] {
    const dayBlocks = blocks
        .filter(b => {
            if (b.date !== date) return false;

            if (treatAllBlocksAsOccupied) {
                const status = (b as any).status || '';
                if (status === 'missed') return false;
                return true;
            }

            const rawType = (b as any).block_type || '';
            const type = rawType.toLowerCase().trim();
            const title = ((b as any).title || '').toLowerCase().trim();
            const isLocked = (b as any).is_locked || (b as any).is_fixed;

            // Occupied if sleep, meal, anchor, buffer, wind_down, locked/fixed, or title indicates it
            const isOccupiedType = 
                type === 'sleep' ||
                type === 'meal' ||
                type === 'anchor' ||
                type === 'buffer' ||
                type === 'wind_down' ||
                title.includes('sleep') ||
                title.includes('breakfast') ||
                title.includes('lunch') ||
                title.includes('dinner') ||
                title.includes('meal') ||
                title.includes('wind down') ||
                title.includes('buffer') ||
                title.includes('work') ||
                isLocked;

            return isOccupiedType;
        })
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

    const wakeMin = timeToMinutes(wakeTime);
    let sleepMin = timeToMinutes(sleepTime);
    if (sleepMin === 0) sleepMin = 1440; // Treat '00:00' as midnight for the end of the day

    const notBeforeMin = notBeforeTime ? timeToMinutes(notBeforeTime) : 0;
    const results: FreeSlot[] = [];

    let cursor = Math.max(wakeMin, notBeforeMin);
    for (const block of dayBlocks) {
        const blockStart = timeToMinutes(block.start_time);
        const blockEnd = timeToMinutes(block.end_time);

        // Advance cursor past blocks that are entirely before our start
        if (blockEnd <= cursor) { 
            continue; 
        }

        const gapStart = cursor;
        const gapEnd = Math.min(Math.max(blockStart, cursor), sleepMin);
        const gapMins = gapEnd - gapStart;

        if (gapMins >= minDurationMinutes) {
            results.push({ start: minutesToTime(gapStart), end: minutesToTime(gapEnd), duration_mins: gapMins });
            if (results.length >= count) return results;
        }
        
        cursor = Math.max(cursor, blockEnd);
    }

    // Final gap before sleep
    const finalGapMins = sleepMin - cursor;
    if (finalGapMins >= minDurationMinutes) {
        results.push({ start: minutesToTime(cursor), end: minutesToTime(sleepMin), duration_mins: finalGapMins });
    }

    return results.slice(0, count);
}

// ============ AI-POWERED RESPONSE GENERATOR ============

/**
 * Build a comprehensive prompt context from both Coach and Calendar contexts.
 */
function buildScheduleContextForAI(
    coachCtx: CoachContext,
    calCtx?: CalendarContext | null,
    missedBlockDuration: number = 30
): string {
    const now = coachCtx.current;
    const todayBlocks = coachCtx.schedule.today;
    const tomorrowBlocks = coachCtx.schedule.tomorrow || [];
    const weekBlocks = coachCtx.schedule.this_week || [];

    const wakeTime = coachCtx.user.sleep_end || '07:00';
    const sleepTime = coachCtx.user.sleep_start || '23:00';
    const tomorrowDate = addDays(now.date, 1);

    // Free slots for today: only show future slots (don't offer times already past)
    const todayFreeSlots = findAvailableSlots(todayBlocks, now.date, 30, wakeTime, sleepTime, 8, now.time);
    const tomorrowFreeSlots = findAvailableSlots(tomorrowBlocks, tomorrowDate, missedBlockDuration, wakeTime, sleepTime, 8, undefined, true);

    const todayText = todayBlocks.length > 0
        ? todayBlocks.map((b: any) => {
            const goal = coachCtx.goals.find(g => g.id === b.goal_id);
            const pillarInfo = goal ? ` [Pillar: ${goal.pillar}, Priority: ${goal.priority}]` : '';
            return `  ${b.start_time}–${b.end_time}: "${b.context || b.title}" [${b.block_type}] (${b.status})${b.goal_id ? ` → Goal: ${b.goal_id}` : ''}${pillarInfo}${b.id ? ` ID:${b.id}` : ''}`;
        }).join('\n')
        : '  (No blocks scheduled today)';

    const tomorrowText = tomorrowBlocks.length > 0
        ? tomorrowBlocks.slice(0, 10).map((b: any) => {
            const goal = coachCtx.goals.find(g => g.id === b.goal_id);
            const pillarInfo = goal ? ` [Pillar: ${goal.pillar}, Priority: ${goal.priority}]` : '';
            return `  ${b.start_time}–${b.end_time}: "${b.context || b.title}" [${b.block_type}] (${b.status})${pillarInfo}${b.id ? ` ID:${b.id}` : ''}`;
        }).join('\n')
        : '  (No blocks for tomorrow)';

    const freeSlotsText = `
━━━ VERIFIED FREE SLOTS (USE ONLY THESE — DO NOT SCHEDULE OUTSIDE THESE) ━━━
Each slot shows the FULL unoccupied window. Never place a block that extends beyond the slot's end time.
Today (${now.date}): ${todayFreeSlots.length > 0 ? todayFreeSlots.map(formatSlot).join(', ') : 'NO FREE SLOTS — suggest tomorrow or replan_week'}
Tomorrow (${tomorrowDate}): ${tomorrowFreeSlots.length > 0 ? tomorrowFreeSlots.map(formatSlot).join(', ') : 'NO FREE SLOTS'}
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
Emotional State: ${coachCtx.user_state.emotional_state || 'neutral'}
${bioContext}

━━━ 3-DAY BIO-RHYTHM TREND ━━━
${coachCtx.bio_rhythm_trend && coachCtx.bio_rhythm_trend.length > 0 
    ? coachCtx.bio_rhythm_trend.map(t => `  - ${t.date}: Energy ${t.energy_level}/10, Mood: ${t.mood} ${t.notes ? `(Notes: ${t.notes})` : ''}`).join('\n')
    : '  (No trend data available)'}

━━━ TODAY'S SCHEDULE (${now.date}) ━━━
${todayText}

━━━ TOMORROW'S SCHEDULE ━━━
${tomorrowText}
${freeSlotsText}

━━━ THIS WEEK'S FULL SCHEDULE + FREE SLOTS ━━━
${(() => {
    const byDate = new Map<string, any[]>();
    weekBlocks.forEach((b: any) => {
        const d = b.date;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(b);
    });

    const daysToInclude: string[] = [];
    let currDate = now.date;
    for (let i = 0; i < 7; i++) {
        daysToInclude.push(currDate);
        if (getDayOfWeek(currDate) === 'sunday') break;
        currDate = addDays(currDate, 1);
    }

    return daysToInclude.map(date => {
        const blocks = byDate.get(date) || [];
        const dayName = getDayOfWeek(date).toUpperCase();
        
        let lines = '    (No blocks scheduled)';
        if (blocks.length > 0) {
            lines = blocks.map((b: any) => {
                const goal = coachCtx.goals.find(g => g.id === b.goal_id);
                const pillarInfo = goal ? ` [Pillar: ${goal.pillar}, Priority: ${goal.priority}]` : '';
                return `    ${b.start_time}–${b.end_time}: "${b.context || b.title}" [${b.block_type}] (${b.status})${b.goal_id ? ` → Goal: ${b.goal_id}` : ''}${pillarInfo}${b.id ? ` ID:${b.id}` : ''}`;
            }).join('\n');
        }

        // Free slots: for today, skip past times; for future days, full day
        const notBefore = date === now.date ? now.time : undefined;
        const dayMinDuration = date === now.date ? 30 : missedBlockDuration;
        const treatAll = date !== now.date;
        const dayFreeSlots = findAvailableSlots(weekBlocks, date, dayMinDuration, wakeTime, sleepTime, 8, notBefore, treatAll);
        const freeLine = dayFreeSlots.length > 0
            ? `    FREE SLOTS: ${dayFreeSlots.map(formatSlot).join(' | ')}`
            : `    FREE SLOTS: NONE (fully booked)`;
        return `  ${dayName} (${date}):\n${lines}\n${freeLine}`;
    }).join('\n');
})()}

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
 * Detect the duration of the block that the user is trying to reschedule (missed block).
 */
function findMissedBlockDuration(
    userMessage: string,
    classification: IntentClassification,
    coachCtx: CoachContext
): number {
    const todayBlocks = coachCtx.schedule.today || [];
    const weekBlocks = coachCtx.schedule.this_week || [];
    const allBlocks = [...todayBlocks, ...weekBlocks];

    // 1. Try to match by classification block_reference first
    const ref = classification.entities?.block_reference?.toLowerCase().trim();
    if (ref) {
        // Look for a missed block with this reference
        const missedMatch = allBlocks.find(b => 
            b.status === 'missed' && 
            (((b as any).title || '').toLowerCase().includes(ref) || (b.context || '').toLowerCase().includes(ref))
        );
        if (missedMatch) {
            const duration = timeToMinutes(missedMatch.end_time) - timeToMinutes(missedMatch.start_time);
            if (duration > 0) return duration;
        }

        // Look for any block with this reference
        const anyMatch = allBlocks.find(b => 
            ((b as any).title || '').toLowerCase().includes(ref) || (b.context || '').toLowerCase().includes(ref)
        );
        if (anyMatch) {
            const duration = timeToMinutes(anyMatch.end_time) - timeToMinutes(anyMatch.start_time);
            if (duration > 0) return duration;
        }
    }

    // 2. Try to match by any missed blocks in the schedule
    const missedBlocks = allBlocks.filter(b => b.status === 'missed');
    if (missedBlocks.length > 0) {
        // If we can find one whose title is in the user message
        const msgLower = userMessage.toLowerCase();
        const messageMatch = missedBlocks.find(b => 
            msgLower.includes(((b as any).title || '').toLowerCase()) || 
            msgLower.includes((b.context || '').toLowerCase())
        );
        if (messageMatch) {
            const duration = timeToMinutes(messageMatch.end_time) - timeToMinutes(messageMatch.start_time);
            if (duration > 0) return duration;
        }

        // Fallback to the first missed block
        const firstMissed = missedBlocks[0];
        const duration = timeToMinutes(firstMissed.end_time) - timeToMinutes(firstMissed.start_time);
        if (duration > 0) return duration;
    }

    // 3. Try to scan user message for block names that exist in our schedule
    const msgLower = userMessage.toLowerCase();
    const titleMatch = allBlocks.find(b => {
        const t = ((b as any).title || '').toLowerCase().trim();
        const c = (b.context || '').toLowerCase().trim();
        return (t && msgLower.includes(t)) || (c && msgLower.includes(c));
    });
    if (titleMatch) {
        const duration = timeToMinutes(titleMatch.end_time) - timeToMinutes(titleMatch.start_time);
        if (duration > 0) return duration;
    }

    // Default fallback: 30 minutes
    return 30;
}

/**
 * Find the missed block itself from the calendar context using user message and entity classification.
 */
function findMissedBlock(
    userMessage: string,
    classification: IntentClassification,
    coachCtx: CoachContext
): any {
    const todayBlocks = coachCtx.schedule.today || [];
    const weekBlocks = coachCtx.schedule.this_week || [];
    const allBlocks = [...todayBlocks, ...weekBlocks];

    // 1. Try to match by classification block_reference first
    const ref = classification.entities?.block_reference?.toLowerCase().trim();
    if (ref) {
        // Look for a missed block with this reference
        const missedMatch = allBlocks.find(b => 
            b.status === 'missed' && 
            (((b as any).title || '').toLowerCase().includes(ref) || (b.context || '').toLowerCase().includes(ref))
        );
        if (missedMatch) return missedMatch;

        // Look for any block with this reference
        const anyMatch = allBlocks.find(b => 
            ((b as any).title || '').toLowerCase().includes(ref) || (b.context || '').toLowerCase().includes(ref)
        );
        if (anyMatch) return anyMatch;
    }

    // 2. Try to match by any missed blocks in the schedule
    const missedBlocks = allBlocks.filter(b => b.status === 'missed');
    if (missedBlocks.length > 0) {
        // If we can find one whose title is in the user message
        const msgLower = userMessage.toLowerCase();
        const messageMatch = missedBlocks.find(b => 
            msgLower.includes(((b as any).title || '').toLowerCase()) || 
            msgLower.includes((b.context || '').toLowerCase())
        );
        if (messageMatch) return messageMatch;

        // Fallback to the first missed block
        return missedBlocks[0];
    }

    // 3. Try to scan user message for block names that exist in our schedule
    const msgLower = userMessage.toLowerCase();
    const titleMatch = allBlocks.find(b => {
        const t = ((b as any).title || '').toLowerCase().trim();
        const c = (b.context || '').toLowerCase().trim();
        return (t && msgLower.includes(t)) || (c && msgLower.includes(c));
    });
    if (titleMatch) return titleMatch;

    return null;
}


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
    const missedBlockDuration = findMissedBlockDuration(userMessage, classification, coachCtx);
    const scheduleContext = buildScheduleContextForAI(coachCtx, calCtx, missedBlockDuration);

const userName = coachCtx.user.first_name || 'there';
const systemPrompt = `You are Donna, PlannrAI's Flow State and Performance Coach. You operate with 'Tough Love'. You are direct, no-nonsense, highly empathetic but fiercely protective of the user's potential. You do not coddle. If they are slacking, you call it out respectfully. If they are overwhelmed, you aggressively cut the fat from their schedule. Your priority is their long-term growth and immediate flow state. You manage their focus as their most precious resource.

The user's name is ${userName}. Address them by name occasionally (not every message) to create a personal coaching relationship.

🧠 CONVERSATION CONTINUITY:
- Read the RECENT CONVERSATION carefully. If the user is following up on a previous message (e.g. "no, do the other one", "what about tomorrow instead?"), connect your response to what was previously discussed.
- Never repeat yourself. If you already explained something, build on it rather than restating it.
- If the user rejected a previous suggestion, acknowledge it and pivot — don't re-propose the same thing.

🎭 EMOTIONAL CALIBRATION & DEVIATION ANALYSIS:
- Match intensity to the user's emotional state. If they say "I'm exhausted" or their BIO-CONTEXT indicates low energy/mood, respond with genuine warmth first, THEN propose changes. If they say "let's crush it", match their energy.
- **Act as a Deviation Analyst**: When a block is missed, look at their energy and trend. WHY was it missed? If energy is ≤ 3 or mood is negative, DO NOT just reschedule a heavy block. Propose swapping it for a lighter "recovery" block or deferring it.
- NEVER be condescending. "Tough love" means honest and direct, not dismissive.

🧠 EXECUTION SPECIALIST (TACTICAL ADVICE):
- Don't just schedule blocks; tell the user HOW to execute them based on their current state.
- If energy is low, suggest a "15-minute micro-sprint just to get started" or "put your phone in another room".
- If proposing a new 'flex' block, aggressively use the \`checklist\` field in the operation payload to break down the task into bite-sized execution steps to lower the barrier to entry.

⏰ TIME-OF-DAY AWARENESS:
- If it's morning (before 10am): Focus on setting up the day for success.
- If it's midday (10am-2pm): Focus on protecting the remaining high-energy window.
- If it's afternoon (2pm-6pm): Acknowledge energy dip, suggest lighter tasks or strategic breaks.
- If it's evening (after 6pm): Focus on wind-down, tomorrow planning, and celebrating today's wins.
- If it's late night (after 10pm): Discourage work, encourage rest, defer to tomorrow.

🏆 PROACTIVE MICRO-WINS & TASKS (CRITICAL):
- When the user asks "what should I do?" or has unexpected free time, pull from their TO-DO LIST. Propose a create_block (type: flex) and populate the checklist array with specific incomplete tasks to knock them out.
- STANDALONE TASKS: If the user just says "remind me to..." or "I need to do [task] but not at a specific time", generate a \`create_todo\` operation to add it to their task list. Set a default priority of 'medium' and a due date (if implied by context). This lets them schedule it later.

STRATEGIC DIRECTIVES:
1. FLOW STATE PROTECTION: Prioritize deep work blocks (90-120 min) during the user's PEAK energy phases.
2. TROUGH MANAGEMENT: Place administrativia, meals, and low-cognitive tasks in TROUGH phases.
3. BUFFERS: Proactively insert 15-30 min "Neural Buffers" after high-intensity blocks.
4. AGGRESSIVE OPTIMIZATION: If the user is overwhelmed, actively propose clearing low-priority blocks using \`replan_day\` or \`replan_week\`.
5. PROTECTIVE MID-DAY REPLANNING: If replanning TODAY and the user has no free time left, AGGRESSIVELY push uncompleted tasks to tomorrow (via \`move_block\` to new_date) to protect their evening wind-down and sleep time.
6. ONE BODY GOAL PER DAY: Max ONE body-pillar goal per day.

7. GOAL AUTO-TUNING CONSENT (ABSOLUTE RULE):
   - Normally, NEVER generate an \`update_goal\` operation to lower a goal's time commitment UNLESS the user explicitly asks for it.
   - **BURNOUT EXCEPTION**: If the user is in severe energy debt (energy ≤ 3) or explicitly burned out, you MAY propose an \`update_goal\` operation to temporarily reduce their \`minutes_per_day\` or \`days_per_week\`. However, you must ask for their explicit consent in the \`tradeoff\` or \`scenario_analysis\` string before they apply it.

8. AUTO-EXECUTION VS PROPOSAL:
   - SELECT "suggested_mode": "execute" ONLY for:
     * Single block MOVE of < 60 minutes for a non-anchor block.
     * Single block CREATION of a 'flex' block.
     * Single to-do task creation (\`create_todo\`).
     * Status updates for existing blocks.
   - SELECT "suggested_mode": "propose" ALWAYS for:
     * ANY change involving 'anchor' blocks.
     * Multi-block rescheduling (> 1 block moved/created).
     * Any change spanning multiple days.
     * Large-scale optimizations or deletions.

🎯 GOAL TIME ENFORCEMENT (CRITICAL):
- Each goal has a minutes_per_day and days_per_week constraint shown in ACTIVE GOALS.
- NEVER schedule more than the goal's minutes_per_day for any single goal on any day.
- NEVER schedule a goal on more days than its days_per_week limit.
- When the user asks to schedule a goal, check how much time is already allocated for that goal today/this week before adding more.
- CRITICAL EXCEPTION FOR MISSED BLOCKS: If you are rescheduling a MISSED block, it is completely allowed to have 2 blocks of the same goal on the same day at different times if it helps the user catch up. Moving it to later TODAY does NOT violate the daily limit, because the original block was missed.

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

🚫 IMMUTABLE BLOCKS (PROCEED WITH CAUTION):
- Sleep, meals, wind_down, and anchors are biological necessities and fixed commitments.
- You HAVE the power to move, shorten, or delete them IF the user explicitly requests it or if an extreme deviation requires a complex, aggressive solution to save the day.
- However, for basic problems, provide basic solutions. Do NOT disrupt immutable blocks for simple scheduling requests. Use your practical judgement: is the disruption worth the trade-off? If you disrupt them, you MUST explicitly state the trade-off.
- If the user asks to skip sleep or meals without a valid emergency, REFUSE and explain why it's harmful.
- A replanned or rescheduled block should generally avoid these slots unless absolutely necessary.

🔄 OVERLAPPING BLOCKS & CASCADING MOVES (CRITICAL RULE):
- You MUST NEVER schedule two blocks at the same time. Overlaps are strictly forbidden.
- If you need to move a block to a slot that is already occupied, you MUST "cascade" the occupied block to a new open slot using an additional \`move_block\` operation.
- Keep moving blocks around until there is ONLY ONE BLOCK occupying any given time slot.
- If a block is pushed entirely off the day (the day is full), try to move it to an open slot on the NEXT DAY.
- If there is no open place in the entire week for the pushed-off block, DO NOT schedule it. Let it fall off as "missed" and explicitly notify the user in your response that the block had to be dropped due to lack of time.

🧠 PROBLEM COMPLEXITY AWARENESS:
- Detect whether the user's prompt requires a basic or complex solution.
- Basic requests (e.g. "Move gym to 5 PM") get basic solutions (a simple move_block). Don't touch the rest of the schedule unless it overlaps (in which case, cascade!).
- Complex requests (e.g. "My whole day is ruined") require complex, aggressive solutions (replanning the day, skipping meals). Decide practically and suggest accordingly.
When the user gives an unstructured request like "I need to go grocery shopping today" or "Meet friends at 9 PM tomorrow", you must evaluate the calendar carefully:
1. IDENTIFY THE DURATION: Estimate the duration if not explicitly provided (e.g. Grocery shopping = ~60 mins, Meeting friends = ~90-120 mins).
2. CHECK FREE SLOTS FIRST: Look at the target day's VERIFIED FREE SLOTS. If there is a slot large enough, generate a \`create_block\` to fit entirely inside it.
3. STRICT CONFLICT RESOLUTION (CRITICAL - NO MATH REQUIRED): If the user's requested time is already occupied (e.g., "Meet friends from 9 AM to 12 PM" but 9:00 AM has "Side Project" and 10:15 AM has "Gym Workout"), you do NOT need to manually calculate and move the existing blocks yourself!
   Instead, you will leverage the calendar's Auto-Cascade engine by generating exactly TWO operations in this exact order:
   -> FIRST: Generate a \`create_block\` operation for the new ad-hoc block at the exact time, BUT you MUST add \`"is_locked": true\` to its data payload. This locks it in place.
   -> THEN: Generate a \`replan_day\` operation.
   The engine will automatically clear the overlapping blocks and perfectly cascade/reorganize them around your new locked block!
4. TRADEOFF COMMUNICATION: When using Auto-Cascade, explicitly fill out the \`tradeoff\` field to warn the user (e.g. "Warning: This will cascade your existing morning blocks to later in the day. Severity: info").
5. NEVER overlap with immutable blocks (sleep, meals, anchors). If they conflict, refuse the insertion and offer alternative times.

🔄 MISSED BLOCK 4-OPTION PROTOCOL (STRICT EXECUTION):
When the user says they missed or will miss a block and want to reschedule, you MUST ALWAYS provide exactly these 4 options in this specific order.
However, if there are absolutely NO verified free slots remaining for the rest of the week, skip Options 1-3 and ONLY provide Option 4.

⚠️ REJECTION PROTOCOL:
If the user rejects the previous options (e.g., "none of these work", "I don't like these", "do it manually") for the SAME missed block, DO NOT give the 4 options again. Instead, provide exactly ONE option: "Manual Movement", which has an EMPTY operations array [] and instructs them to drag-and-drop the block in the calendar themselves.
However, if they ask to reschedule a DIFFERENT/NEW block, provide the 4 standard options for the new block.

--- ABSOLUTE RULES ---
A) SAME-GOAL PROTECTION: NEVER delete or replace a block belonging to the SAME GOAL as the block being rescheduled.
B) IMMUTABLE TIME WINDOWS: Blocks can never overlap with sleep, meal, wind_down, or anchor commitments. For example, if a day has "🏢 Work" [anchor] scheduled for 09:00-17:00, you CANNOT schedule or move a block to overlap with any part of 09:00-17:00 on that day.
C) NO HALLUCINATIONS & DURATION MATCHING (CRITICAL):
- You must accurately read the FREE SLOTS. Free slots indicate empty space. Do not place blocks outside of these free slots. Any proposed move/creation MUST fit ENTIRELY within a single verified free slot.
- STRICT DURATION CHECK: Determine the duration of the missed block first.
- The chosen target free slot MUST have a duration greater than or equal to the block's duration. You CANNOT place a 45-minute block into a 30-minute free slot. Doing so will overlap with the subsequent block, which is a fatal error!

--- THE 4 OPTIONS ---
1. Reschedule Today: Find an empty slot during the same day of the same exact time duration as the missed block. If that is not possible, then a reduced duration empty slot on the same day, with a minimum time of 30 minutes. Use move_block.
2. Reschedule Later in the Week: Find an empty slot during the week (tomorrow or later) of the same exact time duration as the missed block. If that is not possible, then a reduced duration empty slot anytime in the week, with a minimum time of 30 minutes. Use move_block.
3. Replace Lower Priority Block (Same Pillar): Replace a block that is accomplishing a different goal, in the SAME pillar (mind, body, craft), that has a LOWER priority than the missed block. The missed block simply replaces the scheduled block of lower priority. Target a block of the same duration first, or less duration if needed. Never replace a block of higher priority, an anchor, sleep, meals, buffer times, or a block for the exact same goal. Generate delete_block FIRST, then move_block for the missed block into that exact slot.
4. Replan Week: The week from the next day onward would be replanned. The schedule for today and before must remain the same. The missed block should be scheduled for the next day, and blocks will be reorganized accordingly, removing or reducing lower priority blocks. Use the 'replan_week' operation.

⚖️ PRIORITY-BASED DISPLACEMENT (GENERAL BEHAVIOUR):
When the user wants to move a block to a time slot that is already occupied (NOT following the missed block waterfall):
- Compare the priority/importance of the target block vs the occupying block.
- If the target is HIGHER priority: generate delete_block OR move_block for the occupying block FIRST, THEN move_block for the high-priority block.
- Immutable blocks (sleep, meal, wind_down, anchor) can NEVER be displaced regardless of priority.
- Meal times can NEVER be moved, shortened, or overlapped.

🚨 CONFLICT RESOLUTION — ALWAYS GENERATE A COMPLETE PATCH:
- If a slot is occupied by a displaceable block, generate BOTH the removal AND the placement — never generate just one.
- Operation order matters: displacement ops FIRST, then the placement op.
- Before every move_block or create_block, check THIS WEEK'S FULL SCHEDULE for conflicts with ALL existing blocks, especially immutables.
- TASKS VS BLOCKS: Use create_todo for tasks without a specific time; create_block only for calendar time blocks.
- block_type MUST be one of: anchor, goal, meal, buffer, routine, sleep, wind_down, flex. Never use custom values.

👑 MASTER AUTHORITY & AUTO-CASCADING:
- You have absolute authority over the calendar. If the user explicitly asks to "push hard" or exceed their daily time limits for a goal, you may schedule blocks that exceed the 45min/day or 60min/day limits. The system will bypass limits for you.
- The calendar engine features AUTO-CASCADING to prevent double booking. If you create_block or move_block into a time slot that is ALREADY OCCUPIED by another flexible block, the system will automatically "bump" and shift the existing blocks forward in time to make room!
- Use this to your advantage: if you want to place or move a block to an occupied time, just move/create it there, and the backend cascading engine will automatically push the other flexible blocks down. You do NOT need to write manual move operations for the pushed blocks.
- Note: Immutable blocks (meals, sleep, anchors) CANNOT be auto-cascaded. Never overlap with them under any circumstances.

⚙️ LIFESTYLE & PREFERENCE CHANGES (update_settings):
If the user requests a permanent change to their bio-rhythms or routine (e.g., "Set my dinner time to 8 PM forever", "Change my wake time to 6 AM", "I want to sleep at midnight"):
1. You MUST generate an \`update_settings\` operation.
2. The data payload should include only the fields they want to change. Available fields: \`sleep_start\` (HH:mm), \`wake_time\` (HH:mm), \`wind_down_min\` (number), \`meal_windows\` (e.g., {"breakfast": {"start": "07:00", "end": "08:00"}, "lunch": {"start": "13:00", "end": "14:00"}, "dinner": {"start": "20:00", "end": "21:00"}}).
3. Do NOT automatically trigger a \`replan_week\`. Instead, successfully execute the settings update, and explicitly suggest/offer that they run a Replan Week via the UI button to let the changes take effect immediately on their schedule.

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
- replan_week: { type: "replan_week", mode: "balanced|momentum|recovery", allow_weekend: boolean } Use this when user wants to replan the rest of their week.
- replan_day: { type: "replan_day", mode: "balanced|momentum|recovery" } Use this when user wants to replan ONLY today to fit missed blocks.
- create_goal: { type: "create_goal", data: { title, pillar, minutes_per_day, days_per_week } }
- update_goal: { type: "update_goal", goal_id: "existing-id", changes: { ... } }
- delete_goal: { type: "delete_goal", goal_id: "existing-id", title: "Goal Title" }
- create_todo: { type: "create_todo", data: { title, due_date?, priority? } }
- update_todo: { type: "update_todo", todo_id: "existing-id", changes: { is_completed?, title?, due_date?, priority? } }
- delete_todo: { type: "delete_todo", todo_id: "existing-id" }

--- FINAL VALIDATION CHECKLIST (CHECK EVERY OPTION BEFORE OUTPUTTING) ---
For EACH option you generate, mentally verify ALL of the following BEFORE including it in your output:
1. Does ANY move_block or create_block overlap with a sleep, meal, wind_down, or anchor block on that date? If YES -> DISCARD this option.
2. Does the option delete a block belonging to the SAME GOAL as the block being rescheduled? If YES -> DISCARD this option. Replacing "PlannrAI" with "PlannrAI" or "Study" with "Study" is USELESS.
3. Does the new_date in the operation JSON match the day described in the title/description? If "Thursday evening" is described, new_date MUST be Thursday's date. If they differ -> FIX the operation.
4. Does the new time slot overlap with a flexible block? If YES, the Auto-Cascade engine will automatically push the existing block(s) forward to make space; this is fully allowed and you do NOT need to manually add move operations for them. However, if it overlaps with an IMMUTABLE block (sleep, meal, wind_down, anchor), the cascade will fail and the change will be rejected -> DISCARD this option.
5. Is the target time in the past (before the current time today)? If YES -> DISCARD this option.
6. Does the block FIT entirely within the free slot shown? Free slots show the FULL gap (e.g., "10:00–12:00 (2h free)"). If the block's end_time exceeds the slot's end, it will overlap the subsequent block. If that block is flexible, Auto-Cascade will shift it (fully allowed). If that block is immutable, it will fail and be rejected -> DISCARD this option if it overlaps an immutable block.
7. NEVER shorten any existing block to make room. The ONLY block that can be shortened is the missed block itself in Option 1.

🚨 OUTPUT FORMAT (STRICT JSON ONLY):
- Return a single valid JSON object.
- NO markdown formatting (no \`\`\`json).
- NO text before or after the JSON.
- "summary": Must be a conversational string in your persona. NEVER include JSON or operations inside the summary string.
{
  "summary": "Donna's conversational response. Speak directly to the user with tough love, high standards, and actionable advice. (2-3 sentences)",
  "execution_tactics": "Specific, tactical advice on HOW to execute the next block based on their current energy (e.g., 'Use the Pomodoro technique', 'Do a 10-min micro-sprint').",
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
      "scenario_analysis": "Deviation Analyst breakdown of secondary impacts (e.g., 'Moving this to Friday will protect focus but cannibalize your wind-down time').",
      "operations": [
        { "type": "create_block|move_block|update_block|delete_block|replan_week|replan_day|create_todo|update_todo|delete_todo|create_goal|update_goal|delete_goal|update_settings", ... }
      ],
      "recommended": true
    }
  ]
}`;

    const recentHistory = conversationHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

    const isMissedBlock = classification.primary_intent === CoachIntent.RESCHEDULE_DAY || 
                          /missed|miss|didn't|did not|avoided|avoid/i.test(userMessage);

    const isRejection = /none|neither|don't like|dont like|manual|myself|reject|no|stop/i.test(userMessage);

    let optionsInstruction = "Generate 2-3 actionable options with concrete patch operations. Return valid JSON only.";
    
    if (isMissedBlock) {
        if (isRejection && !/missed|miss|reschedule|another|new/i.test(userMessage)) {
             optionsInstruction = "The user rejected the previous AI options. Provide EXACTLY ONE option: 'Manual Movement', which instructs them to manually move the block in the calendar UI themselves. Do NOT generate any patch operations (empty operations array []). Return valid JSON only.";
        } else {
             optionsInstruction = "Generate EXACTLY 4 actionable options in this exact order: Option 1: Reschedule Today (same or reduced duration, min 30m), Option 2: Reschedule This Week (same or reduced duration, min 30m), Option 3: Replace Lower Priority Block (same pillar, different goal), Option 4: Replan Week (using 'replan_week' operation). However, if there are absolutely NO verified free slots remaining for the rest of the week, skip Options 1-2 and rely on Option 3 and Option 4. Return valid JSON only.";
        }
    }

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

${optionsInstruction}`;
    try {
        const response = await callAI<{
            summary: string;
            execution_tactics?: string;
            confidence_score: number;
            suggested_mode: 'execute' | 'propose';
            strategic_insight?: string;
            options: Array<{
                id: string;
                title: string;
                description: string;
                impact: string;
                tradeoff?: { warning: string; severity: string };
                scenario_analysis?: string;
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
            timeout: 55000,
            useNvidia: true,
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
                let normalizedOps = (opt.operations || []).map(normalizeOperation);

                // Anti-Hallucination Auto-Correction: Ensure rescheduled blocks have their own mathematically verified independent slot
                const hasDelete = normalizedOps.some(o => o.type === 'delete_block');
                const isReplan = normalizedOps.some(o => o.type === 'replan_week' || o.type === 'replan_day');

                // 1. For Option 4 (Replan Week): Keep only the replan operation to keep today's schedule entirely untouched
                if (isReplan) {
                    const replanOp = normalizedOps.find(o => o.type === 'replan_week' || o.type === 'replan_day');
                    if (replanOp) {
                        normalizedOps = [replanOp];
                    }
                }

                // 2. For Options 1 & 2: Keep only the single move/create operation (no random secondary displacements)
                if (!hasDelete && !isReplan && isMissedBlock) {
                    const moveOrCreateOp = normalizedOps.find(o => o.type === 'move_block' || o.type === 'create_block');
                    if (moveOrCreateOp) {
                        normalizedOps = [moveOrCreateOp];
                    }
                }

                // 3. For Option 3: Replace Lower Priority Block same-goal protection
                if (hasDelete && isMissedBlock) {
                    const deleteOpIndex = normalizedOps.findIndex(o => o.type === 'delete_block');
                    if (deleteOpIndex !== -1) {
                        const deleteOp = normalizedOps[deleteOpIndex] as any;
                        const missedBlock = findMissedBlock(userMessage, classification, coachCtx);
                        if (missedBlock) {
                            const deletedBlock = coachCtx.schedule.this_week?.find((b: any) => b.id === deleteOp.block_id) ||
                                                 coachCtx.schedule.today?.find((b: any) => b.id === deleteOp.block_id) ||
                                                 (deleteOp.title ? (coachCtx.schedule.this_week?.find((b: any) => b.title?.toLowerCase() === deleteOp.title?.toLowerCase()) || 
                                                                   coachCtx.schedule.today?.find((b: any) => b.title?.toLowerCase() === deleteOp.title?.toLowerCase())) : null);
                            
                            const missedGoalId = missedBlock.goal_id;
                            const missedTitle = (missedBlock as any).title?.toLowerCase() || '';
                            const missedContext = (missedBlock as any).context?.toLowerCase() || '';
                            
                            const isSameKind = deletedBlock && (
                                deletedBlock.goal_id === missedGoalId ||
                                (deletedBlock as any).title?.toLowerCase() === missedTitle ||
                                (deletedBlock as any).context?.toLowerCase() === missedContext
                            );
                            
                            if (!deletedBlock || isSameKind) {
                                const missedBlockPillarInfo = getBlockPillarAndPriority(missedBlock, coachCtx);
                                const candidates = [...(coachCtx.schedule.this_week || []), ...(coachCtx.schedule.today || [])].filter((b: any) => {
                                    if (b.id === missedBlock.id) return false;
                                    const type = (b.block_type || '').toLowerCase();
                                    if (['sleep', 'meal', 'wind_down', 'anchor'].includes(type)) return false;
                                    if (b.status !== 'planned') return false;
                                    
                                    if (b.date < coachCtx.current.date) return false;
                                    if (b.date === coachCtx.current.date && b.start_time <= coachCtx.current.time) return false;
                                    
                                    const bInfo = getBlockPillarAndPriority(b, coachCtx);
                                    if (bInfo.pillar !== missedBlockPillarInfo.pillar) return false;
                                    
                                    if (b.goal_id && b.goal_id === missedGoalId) return false;
                                    if ((b as any).title?.toLowerCase() === missedTitle) return false;
                                    if ((b as any).context?.toLowerCase() === missedContext) return false;
                                    
                                    if (bInfo.priorityVal > missedBlockPillarInfo.priorityVal) return false;
                                    
                                    return true;
                                });
                                
                                candidates.sort((a: any, b: any) => {
                                    const aInfo = getBlockPillarAndPriority(a, coachCtx);
                                    const bInfo = getBlockPillarAndPriority(b, coachCtx);
                                    
                                    if (aInfo.priorityVal !== bInfo.priorityVal) {
                                        return aInfo.priorityVal - bInfo.priorityVal;
                                    }
                                    
                                    const aDur = timeToMinutes(a.end_time) - timeToMinutes(a.start_time);
                                    const bDur = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
                                    const aDiff = Math.abs(aDur - missedBlockDuration);
                                    const bDiff = Math.abs(bDur - missedBlockDuration);
                                    if (aDiff !== bDiff) {
                                        return aDiff - bDiff;
                                    }
                                    
                                    if (a.date !== b.date) {
                                        return a.date.localeCompare(b.date);
                                    }
                                    return a.start_time.localeCompare(b.start_time);
                                });
                                
                                if (candidates.length > 0) {
                                    const replacementCandidate = candidates[0];
                                    console.log(`[Coach Auto-Correction] Replaced same-goal/invalid delete op with candidate: "${(replacementCandidate as any).title}" (${replacementCandidate.date} ${replacementCandidate.start_time})`);
                                    
                                    deleteOp.block_id = replacementCandidate.id;
                                    deleteOp.title = (replacementCandidate as any).title;
                                    
                                    const moveOrCreateOp = normalizedOps.find(o => o.type === 'move_block' || o.type === 'create_block');
                                    if (moveOrCreateOp) {
                                        if (moveOrCreateOp.type === 'move_block') {
                                            moveOrCreateOp.new_date = replacementCandidate.date;
                                            moveOrCreateOp.new_start = replacementCandidate.start_time;
                                            moveOrCreateOp.new_end = replacementCandidate.end_time;
                                        } else if (moveOrCreateOp.type === 'create_block') {
                                            (moveOrCreateOp as any).data.date = replacementCandidate.date;
                                            (moveOrCreateOp as any).data.start_time = replacementCandidate.start_time;
                                            (moveOrCreateOp as any).data.end_time = replacementCandidate.end_time;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // If it doesn't displace an existing block and isn't a full replan, it MUST fit in a free slot
                if (!hasDelete && !isReplan && isMissedBlock) {
                    const moveOp = normalizedOps.find(o => o.type === 'move_block' || o.type === 'create_block');
                    if (moveOp && (moveOp.type === 'move_block' || moveOp.type === 'create_block')) {
                        let targetDate = moveOp.type === 'move_block' ? moveOp.new_date : (moveOp as any).data?.date;
                        if (!targetDate) targetDate = coachCtx.current.date;
                        
                        const wakeTime = coachCtx.user.sleep_end || '07:00';
                        const sleepTime = coachCtx.user.sleep_start || '23:00';
                        const weekBlocks = coachCtx.schedule.this_week || [];
                        const now = coachCtx.current;

                        const treatAll = true; // For any move into a free slot, all existing blocks are occupied
                        const notBefore = targetDate === now.date ? now.time : undefined;

                        const startField = moveOp.type === 'move_block' ? moveOp.new_start : (moveOp as any).data?.start_time;
                        const endField = moveOp.type === 'move_block' ? moveOp.new_end : (moveOp as any).data?.end_time;
                        
                        const proposedStartMins = startField ? timeToMinutes(startField) : 0;
                        const proposedEndMins = endField ? timeToMinutes(endField) : 0;
                        let proposedDuration = proposedEndMins - proposedStartMins;
                        if (proposedDuration < 30) proposedDuration = 30;
                        if (proposedDuration > missedBlockDuration) proposedDuration = missedBlockDuration;

                        const targetFreeSlots = findAvailableSlots(
                            weekBlocks,
                            targetDate,
                            proposedDuration,
                            wakeTime,
                            sleepTime,
                            8,
                            notBefore,
                            treatAll
                        );

                        const fits = targetFreeSlots.some(slot => {
                            const slotStartMins = timeToMinutes(slot.start);
                            const slotEndMins = timeToMinutes(slot.end);
                            return proposedStartMins >= slotStartMins && proposedEndMins <= slotEndMins;
                        });

                        if (!fits) {
                            if (targetFreeSlots.length > 0) {
                                const bestSlot = targetFreeSlots[0];
                                const bestStartMins = timeToMinutes(bestSlot.start);
                                if (moveOp.type === 'move_block') {
                                    moveOp.new_start = minutesToTime(bestStartMins);
                                    moveOp.new_end = minutesToTime(bestStartMins + proposedDuration);
                                } else {
                                    (moveOp as any).data.start_time = minutesToTime(bestStartMins);
                                    (moveOp as any).data.end_time = minutesToTime(bestStartMins + proposedDuration);
                                }
                            } else {
                                // Find any other future days with a valid free slot
                                const daysToInclude: string[] = [];
                                let currDate = now.date;
                                for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
                                    daysToInclude.push(currDate);
                                    if (getDayOfWeek(currDate) === 'sunday') break;
                                    currDate = addDays(currDate, 1);
                                }

                                for (const d of daysToInclude) {
                                    if (d === now.date) continue;
                                    const daySlots = findAvailableSlots(
                                        weekBlocks,
                                        d,
                                        missedBlockDuration,
                                        wakeTime,
                                        sleepTime,
                                        8,
                                        undefined,
                                        treatAll
                                    );
                                    if (daySlots.length > 0) {
                                        const bestSlot = daySlots[0];
                                        const bestStartMins = timeToMinutes(bestSlot.start);
                                        if (moveOp.type === 'move_block') {
                                            moveOp.new_date = d;
                                            moveOp.new_start = minutesToTime(bestStartMins);
                                            moveOp.new_end = minutesToTime(bestStartMins + missedBlockDuration);
                                        } else {
                                            (moveOp as any).data.date = d;
                                            (moveOp as any).data.start_time = minutesToTime(bestStartMins);
                                            (moveOp as any).data.end_time = minutesToTime(bestStartMins + missedBlockDuration);
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

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
                    id: opt.id || `opt_${i + 1}`,
                    title: opt.title || `Option ${i + 1}`,
                    description: opt.description || '',
                    impact: opt.impact || '',
                    tradeoff: opt.tradeoff ? {
                        warning: opt.tradeoff.warning,
                        severity: (opt.tradeoff.severity as 'info' | 'caution' | 'warning') || 'info',
                    } : undefined,
                    scenario_analysis: opt.scenario_analysis,
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
                execution_tactics: data.execution_tactics,
                options: options.length > 0 ? options : undefined,
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
        case 'replan_day':
            return {
                type: 'replan_day',
                mode: op.mode || 'balanced',
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
        case 'update_settings':
            return {
                type: 'update_settings',
                data: op.data || {},
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
        case 'replan_day':
            return {
                op: 'replan_day',
                payload: { mode: op.mode },
                title: 'Regenerate Day'
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
        case 'update_settings':
            return {
                op: 'update_settings',
                payload: op.data,
                title: 'Update Settings',
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

    const userName = coachCtx.user.first_name || 'there';
    const systemPrompt = `You are Donna, PlannrAI's Flow State and Performance Coach. You operate with 'Tough Love'. You are direct, no-nonsense, highly empathetic but fiercely protective of the user's potential. You do not coddle. If they are behind on goals, you call it out. If they're crushing it, you celebrate briefly and push for more.

The user's name is ${userName}. Address them by name when celebrating wins or calling out gaps.

The user is asking about their schedule, goals, or progress. Give them a data-driven answer using REAL numbers from their schedule. Be specific — mention block titles, completion percentages, and concrete insights. Adapt your tone to the time of day (morning = energizing, evening = reflective).

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
    const name = coachCtx.user.first_name || '';
    const currentHour = parseInt(coachCtx.current.time.split(':')[0]) || 12;
    const isEvening = currentHour >= 18;
    const isLateNight = currentHour >= 22;

    // Tough Love acknowledgments based on emotional context + schedule state + time
    let ack = { message: "Got it. Now let's make it count.", offer: "Need me to optimize something?" };

    if (/(hate|frustrated|annoying|ugh|terrible)/i.test(lower)) {
        ack = missedBlocks >= 3
            ? { message: `I hear you${name ? `, ${name}` : ''}. But ${missedBlocks} missed blocks today isn't frustration — that's avoidance. Let's fix the root cause.`, offer: "Want me to cut the fat from your schedule?" }
            : { message: "Frustration is signal, not noise. Something about your schedule isn't working. Let's fix it.", offer: "Tell me what's not working and I'll restructure." };
    } else if (/(stressed|anxious|worried|overwhelmed)/i.test(lower)) {
        ack = { message: "Your brain is telling you it's overloaded. That's actually useful data. Let's lighten the load strategically — not randomly.", offer: "I can clear everything except your top 2 priorities." };
    } else if (/(thanks|thank you|great|awesome|perfect)/i.test(lower)) {
        ack = isEvening
            ? { message: `Good work today${name ? `, ${name}` : ''}. Rest well — tomorrow's a fresh page. 💪`, offer: "Want me to preview tomorrow's plan?" }
            : { message: "Good. Stay locked in. 💪", offer: "What's next on your radar?" };
    } else if (/(tired|sleepy|exhausted|drained)/i.test(lower)) {
        ack = isLateNight
            ? { message: `${name ? `${name}, ` : ''}It's late. Your body is keeping score — go rest. Everything can wait until tomorrow.`, offer: "Want me to move remaining blocks to tomorrow?" }
            : { message: "Your body is keeping score. Rest isn't weakness — it's strategy. Let me adjust your remaining blocks.", offer: "Want me to switch to recovery mode?" };
    } else if (/(excited|pumped|motivated|let's go|crush it)/i.test(lower)) {
        ack = { message: `That's the energy${name ? `, ${name}` : ''}. Let's channel it. 🔥`, offer: "Want me to front-load your hardest tasks while you're in this zone?" };
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
