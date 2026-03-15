import { CoachIntent, IntentClassification, classifyIntent } from '@/lib/coach/intent-classifier';
import { CoachContext } from '@/lib/coach/context-builder';
import { buildCalendarContext, CalendarContext } from '@/lib/calendar/context-builder';
import { callAI } from '@/lib/ai/unified-client';
import { format } from 'date-fns';

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
    | { type: 'move_block'; block_id: string; new_start: string; new_end: string; new_date?: string }
    | { type: 'update_block'; block_id: string; changes: Partial<BlockData> }
    | { type: 'delete_block'; block_id: string }
    | { type: 'update_goal'; goal_id: string; changes: Partial<GoalData> };

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

    const goalsText = coachCtx.goals.length > 0
        ? coachCtx.goals.map((g: any) =>
            `  - "${g.title}" (Pillar: ${g.pillar}, ${g.weekly_target_minutes}min/week, Priority: ${g.priority || 'medium'}) ID:${g.id}`
        ).join('\n')
        : '  (No active goals)';

    const commitmentsText = coachCtx.commitments.length > 0
        ? coachCtx.commitments.map((c: any) =>
            `  - "${c.title}" ${c.start_time}–${c.end_time} on ${(c.days_of_week || []).join(', ')} [LOCKED]`
        ).join('\n')
        : '  (No fixed commitments)';

    // Enrich with calendar context data if available
    let bioContext = '';
    if (calCtx) {
        const energyDesc = calCtx.user.energy_level >= 7 ? 'HIGH energy' :
            calCtx.user.energy_level >= 4 ? 'MODERATE energy' : 'LOW energy';
        const stressDesc = calCtx.user.stress_level >= 7 ? 'HIGH stress' :
            calCtx.user.stress_level >= 4 ? 'MODERATE stress' : 'LOW stress';

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

━━━ ACTIVE GOALS ━━━
${goalsText}

━━━ FIXED COMMITMENTS (LOCKED — NEVER MODIFY) ━━━
${commitmentsText}

━━━ LEARNED PREFERENCES ━━━
${prefsText}`;
}

// Intent categories
const SCHEDULE_MODIFICATION_INTENTS = new Set([
    CoachIntent.MOVE_BLOCK,
    CoachIntent.ADD_TASK,
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

    const systemPrompt = `You are Donna, PlannrAI's AI scheduling coach. You help users manage their calendar by proposing concrete schedule changes.

RULES:
1. ALWAYS respond with actionable schedule patches — never say "I can't do that"
2. Provide 2-3 options for the user to choose from
3. Each option MUST include concrete patch operations (create_block, move_block, update_block, delete_block)
4. NEVER modify LOCKED commitments
5. All times in 24-hour HH:MM format
6. All dates in YYYY-MM-DD format
7. Be empathetic and strategic — consider the user's energy, stress, and goals
8. If the user is overwhelmed/low-energy, suggest lighter alternatives
9. When moving blocks, use the block's actual ID from the schedule
10. When creating blocks, set realistic durations (20-90 min) and appropriate block_types
11. Block types: goal, meal, buffer, routine, flex, anchor
12. Respect sleep hours (${coachCtx.user.sleep_end} wake → ${coachCtx.user.sleep_start} sleep)
13. Include a "checklist" array with 2-3 action items for goal blocks
14. For reschedule requests, produce a complete day/week plan
15. Mark one option as "recommended": true

PATCH OPERATION TYPES:
- create_block: { type: "create_block", data: { date, start_time, end_time, title, context, block_type, goal_id?, pillar?, checklist? } }
- move_block: { type: "move_block", block_id: "existing-id", new_start: "HH:MM", new_end: "HH:MM", new_date?: "YYYY-MM-DD" }
- update_block: { type: "update_block", block_id: "existing-id", changes: { status?, title?, start_time?, end_time? } }
- delete_block: { type: "delete_block", block_id: "existing-id" }

OUTPUT FORMAT (strict JSON):
{
  "summary": "Brief, empathetic 1-2 sentence response to the user",
  "options": [
    {
      "id": "option_1",
      "title": "Short title",
      "description": "What this option does",
      "impact": "Human-readable impact statement",
      "tradeoff": { "warning": "Any downsides", "severity": "info|caution|warning" },
      "operations": [
        { "type": "create_block|move_block|update_block|delete_block", ... }
      ],
      "blocks_added": 0,
      "blocks_modified": 0,
      "blocks_removed": 0,
      "affected_dates": ["YYYY-MM-DD"],
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
            maxTokens: 4000,
            requireJSON: true,
            timeout: 25000,
        });

        if (response.success && response.data?.options?.length) {
            const options: CoachOption[] = response.data.options.map((opt, i) => ({
                id: opt.id || `option_${i}`,
                title: opt.title,
                description: opt.description,
                impact: opt.impact,
                tradeoff: opt.tradeoff ? {
                    warning: opt.tradeoff.warning,
                    severity: (opt.tradeoff.severity as 'info' | 'caution' | 'warning') || 'info',
                } : undefined,
                patch: {
                    operations: (opt.operations || []).map(normalizeOperation),
                    requires_confirmation: false,
                },
                preview: {
                    blocks_added: opt.blocks_added || 0,
                    blocks_modified: opt.blocks_modified || 0,
                    blocks_removed: opt.blocks_removed || 0,
                    affected_dates: opt.affected_dates || [coachCtx.current.date],
                },
                recommended: opt.recommended || false,
            }));

            // Ensure at least one is recommended
            if (!options.some(o => o.recommended) && options.length > 0) {
                options[0].recommended = true;
            }

            return {
                id: generateId(),
                timestamp: new Date().toISOString(),
                mode: 'propose',
                summary: response.data.summary || "Here are some options for you.",
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
        case 'create_event':
            return {
                type: 'create_block',
                data: {
                    date: op.data?.date || op.date,
                    start_time: op.data?.start_time || op.start_time,
                    end_time: op.data?.end_time || op.end_time,
                    context: op.data?.context || op.data?.title || op.context || op.title || 'New Block',
                    title: op.data?.title || op.data?.context || op.title || 'New Block',
                    block_type: op.data?.block_type || op.block_type || 'flex',
                    energy_level_required: op.data?.energy_level_required,
                    goal_id: op.data?.goal_id || op.goal_id,
                    pillar: op.data?.pillar || op.pillar,
                    checklist: op.data?.checklist || op.checklist,
                },
            };
        case 'move_block':
        case 'move':
        case 'move_event':
            return {
                type: 'move_block',
                block_id: op.block_id || op.event_id || op.id,
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
            };
        case 'update_goal':
            return {
                type: 'update_goal',
                goal_id: op.goal_id || op.id,
                changes: op.changes || op.fields || {},
            };
        default:
            console.warn('[CoachAI] Unknown operation type:', type);
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

    const systemPrompt = `You are Donna, PlannrAI's AI scheduling coach. The user is asking for information about their schedule, goals, or progress.

Respond with a helpful, concise summary. Be strategic and empathetic. If you see opportunities for improvement, mention them.

OUTPUT FORMAT (strict JSON):
{
  "summary": "Your informative response (2-4 sentences max). Include specific data from their schedule.",
  "suggestions": ["Optional suggestion 1", "Optional suggestion 2"]
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
            timeout: 15000,
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

    let ack = { message: "Got it.", offer: "Let me know if you need any schedule changes." };

    if (/(hate|frustrated|annoying|ugh|terrible)/i.test(lower)) {
        ack = { message: "I hear you. That sounds frustrating.", offer: "Want me to lighten your schedule?" };
    } else if (/(stressed|anxious|worried|overwhelmed)/i.test(lower)) {
        ack = { message: "That's a lot to deal with.", offer: "I can help reduce your load if you'd like." };
    } else if (/(thanks|thank you|great|awesome|perfect)/i.test(lower)) {
        ack = { message: "Happy to help! 💪", offer: "Anything else you need?" };
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
    supabase?: any
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

    // 2. Build enriched calendar context if we have supabase
    let calCtx: CalendarContext | null = null;
    if (supabase) {
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
