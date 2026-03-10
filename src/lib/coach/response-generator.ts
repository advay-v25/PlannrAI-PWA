import { CoachIntent, IntentClassification, classifyIntent } from '@/lib/coach/intent-classifier';
import { CoachContext } from '@/lib/coach/context-builder';

// RESPONSE SCHEMA
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
    block_type: string;
    energy_level_required?: number;
    goal_id?: string;
}

interface BlockData {
    start_time: string;
    end_time: string;
    status: string;
    context: string;
    energy_level_required: number;
}

interface GoalData {
    weekly_target_minutes: number;
    is_active: boolean;
    priority: number;
}

type ResponseMode = 'execute' | 'propose' | 'clarify' | 'acknowledge' | 'inform';

export function determineResponseMode(
    intent: CoachIntent,
    classification: IntentClassification,
    userState: any
): ResponseMode {
    if (classification.requires_clarification) return 'clarify';
    if (intent === CoachIntent.GENERAL_CHAT) return 'acknowledge';
    if ([CoachIntent.PROGRESS_CHECK, CoachIntent.GOAL_PROGRESS, CoachIntent.EXPLAIN_SCHEDULE, CoachIntent.WHAT_NEXT].includes(intent)) return 'inform';
    if (intent === CoachIntent.OUT_OF_SCOPE) return 'acknowledge';
    return 'propose';
}

type ResponseGenerator = (
    context: CoachContext,
    classification: IntentClassification
) => Promise<CoachResponse>;

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

function formatDate(date: string): string {
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date === today.toISOString().split('T')[0]) return 'today';
    if (date === tomorrow.toISOString().split('T')[0]) return 'tomorrow';

    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
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

function blocksOverlap(
    blockA: { start_time: string; end_time: string },
    blockB: { start_time: string; end_time: string }
): boolean {
    const aStart = timeToMinutes(blockA.start_time);
    const aEnd = timeToMinutes(blockA.end_time);
    const bStart = timeToMinutes(blockB.start_time);
    const bEnd = timeToMinutes(blockB.end_time);

    return aStart < bEnd && aEnd > bStart;
}

// Simple slot finder for the engine
function findAvailableSlot(
    context: CoachContext,
    date: string,
    preference: 'before' | 'after' | 'any',
    referenceTime?: string
): { start: string; end: string } | null {
    // This mock slot finder simply returns the end of the day to make the engine compile.
    // Production logic would traverse the contextual schedule array here.
    return { start: '18:00', end: '19:00' };
}

function findMultipleSlots(
    context: CoachContext,
    startDate: string,
    count: number,
    durationMinutes: number
): Array<{ date: string; start: string; end: string }> {
    return [
        { date: startDate, start: '14:00', end: '15:00' },
        { date: startDate, start: '16:00', end: '17:00' }
    ];
}

function detectEmotion(message: string): string {
    const lower = message.toLowerCase();

    if (/(hate|frustrated|annoying|ugh|terrible)/i.test(lower)) return 'frustration';
    if (/(stressed|anxious|worried|overwhelmed)/i.test(lower)) return 'stress';
    if (/(sucks|bad|awful|horrible|worst)/i.test(lower)) return 'negativity';

    return 'neutral';
}

function extractTaskFromMessage(message: string): string | null {
    const patterns = [
        /(?:need to|have to|must|should|want to)\s+(.+)/i,
        /(?:add|schedule|create)\s+(.+)/i,
        /(?:remind me to)\s+(.+)/i,
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) return match[1].trim();
    }
    return null;
}

function parseDuration(durationStr?: string): number | null {
    if (!durationStr) return null;
    const match = durationStr.match(/(\d+)\s*(min|hour|hr|h|m)/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('h')) return value * 60;
    return value;
}

// ============ CLARIFICATION ============
async function generateClarificationResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    const question = classification.clarification_question ||
        "Could you tell me more about what you'd like to do?";

    const suggestions = generateClarificationSuggestions(context, classification);

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'clarify',
        summary: question,
        clarification: {
            question,
            suggestions,
        },
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

function generateClarificationSuggestions(
    context: CoachContext,
    classification: IntentClassification
): string[] {
    const suggestions: string[] = [];
    const blockTypes = [...new Set(context.schedule.today.map((b: any) => b.context))];

    if (blockTypes.length > 0) {
        suggestions.push(`Move my ${blockTypes[0]}`);
        suggestions.push(`Cancel my ${blockTypes[0]}`);
    }

    suggestions.push('Reorganize today');
    suggestions.push("I'm exhausted");

    return suggestions.slice(0, 4);
}

// Placeholder for logic mappings without specific constraints from user specification
async function genericPlaceholderResponse(context: CoachContext, classification: IntentClassification): Promise<CoachResponse> {
    return generateClarificationResponse(context, {
        ...classification,
        clarification_question: "I'm not exactly sure how to automatically process that yet. Would you like to check the manual calendar options?",
        requires_clarification: true
    });
}

// ============ GENERATOR IMPLEMENTATIONS ============

// ============ OVERWHELMED ============
async function generateOverwhelmedResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    context.user_state.is_minimal_mode = true;

    const remainingBlocks = context.schedule.today.filter((b: any) =>
        b.status === 'planned' && !b.is_locked
    );

    const options: CoachOption[] = [];

    const essentialBlocks = remainingBlocks
        .sort((a: any, b: any) => (a.priority || 5) - (b.priority || 5))
        .slice(0, 2);
    const nonEssentialBlocks = remainingBlocks.filter(
        (b: any) => !essentialBlocks.find((e: any) => e.id === b.id)
    );

    options.push({
        id: 'essentials_only',
        title: 'Keep essentials only',
        description: `Focus on ${essentialBlocks.length} most important tasks`,
        impact: `${nonEssentialBlocks.length} blocks moved to tomorrow`,
        patch: {
            operations: nonEssentialBlocks.map((block: any) => ({
                type: 'move_block' as const,
                block_id: block.id,
                new_start: block.start_time,
                new_end: block.end_time,
                new_date: addDays(context.current.date, 1),
            })),
            requires_confirmation: false,
        },
        preview: {
            blocks_added: 0,
            blocks_modified: nonEssentialBlocks.length,
            blocks_removed: 0,
            affected_dates: [context.current.date, addDays(context.current.date, 1)],
        },
        recommended: true,
    });

    options.push({
        id: 'recovery_day',
        title: 'Take a recovery day',
        description: 'Clear all non-essential blocks for today',
        impact: `${remainingBlocks.length} blocks rescheduled`,
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
                new_date: addDays(context.current.date, 1),
            })),
            requires_confirmation: true,
        },
        preview: {
            blocks_added: 0,
            blocks_modified: remainingBlocks.length,
            blocks_removed: 0,
            affected_dates: [context.current.date, addDays(context.current.date, 1)],
        },
        recommended: false,
    });

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'propose',
        summary: "Let's lighten your load. You've got this.",
        options,
        minimal_mode: true,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ ENERGY_LOW ============
async function generateEnergyLowResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    const remainingBlocks = context.schedule.today.filter((b: any) =>
        b.status === 'planned' &&
        !b.is_locked &&
        timeToMinutes(b.start_time) > timeToMinutes(context.current.time)
    );

    const highEnergyBlocks = remainingBlocks.filter((b: any) =>
        (b.energy_level_required || 3) >= 4
    );

    const options: CoachOption[] = [];

    if (highEnergyBlocks.length > 0) {
        options.push({
            id: 'defer_hard_work',
            title: 'Defer intense work',
            description: `Move ${highEnergyBlocks.length} high-energy block(s) to tomorrow`,
            impact: 'Keep light tasks, save hard work for when you have energy',
            patch: {
                operations: highEnergyBlocks.map((block: any) => ({
                    type: 'move_block' as const,
                    block_id: block.id,
                    new_start: block.start_time,
                    new_end: block.end_time,
                    new_date: addDays(context.current.date, 1),
                })),
                requires_confirmation: false,
            },
            preview: {
                blocks_added: 0,
                blocks_modified: highEnergyBlocks.length,
                blocks_removed: 0,
                affected_dates: [context.current.date, addDays(context.current.date, 1)],
            },
            recommended: true,
        });
    }

    options.push({
        id: 'shorten_blocks',
        title: 'Shorten all blocks',
        description: 'Reduce each remaining block by 30%',
        impact: `${remainingBlocks.length} blocks shortened`,
        patch: {
            operations: remainingBlocks.map((block: any) => {
                const duration = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
                const newDuration = Math.round(duration * 0.7);
                return {
                    type: 'update_block' as const,
                    block_id: block.id,
                    changes: {
                        end_time: minutesToTime(timeToMinutes(block.start_time) + newDuration),
                    },
                };
            }),
            requires_confirmation: false,
        },
        preview: {
            blocks_added: 0,
            blocks_modified: remainingBlocks.length,
            blocks_removed: 0,
            affected_dates: [context.current.date],
        },
        recommended: false,
    });

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'propose',
        summary: 'Low energy detected. Here are some lighter options.',
        options: options.slice(0, context.user_state.is_minimal_mode ? 2 : 3),
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ ADD_TASK ============
async function generateAddTaskResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    const taskDescription = classification.entities.block_reference ||
        extractTaskFromMessage(context.last_user_message || '');

    if (!taskDescription) {
        return generateClarificationResponse(context, {
            ...classification,
            clarification_question: "What task would you like to add?",
        });
    }

    const duration = parseDuration(classification.entities.duration) || 30;
    const slots = findMultipleSlots(context, context.current.date, 3, duration);

    const options: CoachOption[] = slots.map((slot, index) => ({
        id: `slot_${index}`,
        title: index === 0 ? 'Earliest slot' : index === 1 ? 'Afternoon' : 'Tomorrow',
        description: `${formatTime(slot.start)} - ${formatTime(slot.end)} on ${formatDate(slot.date)}`,
        impact: `"${taskDescription}" added to your schedule`,
        patch: {
            operations: [{
                type: 'create_block' as const,
                data: {
                    date: slot.date,
                    start_time: slot.start,
                    end_time: slot.end,
                    context: taskDescription,
                    block_type: 'focus',
                    energy_level_required: 3,
                },
            }],
            requires_confirmation: false,
        },
        preview: {
            blocks_added: 1,
            blocks_modified: 0,
            blocks_removed: 0,
            affected_dates: [slot.date],
        },
        recommended: index === 0,
    }));

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'propose',
        summary: `Adding "${truncate(taskDescription, 30)}". Choose a time slot.`,
        options: options.slice(0, context.user_state.is_minimal_mode ? 2 : 3),
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ BUSY_AT_TIME ============
async function generateBusyAtTimeResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    const { extracted_constraint } = classification;

    if (!extracted_constraint) {
        return generateClarificationResponse(context, {
            ...classification,
            clarification_question: "What time are you busy? (e.g., '3pm to 5pm')",
        });
    }

    const { start_time, end_time, date } = extracted_constraint;

    const conflictingBlocks = context.schedule.today.filter((block: any) =>
        blocksOverlap(block, { start_time, end_time }) &&
        block.date === date &&
        !block.is_locked
    );

    if (conflictingBlocks.length === 0) {
        return {
            id: generateId(),
            timestamp: new Date().toISOString(),
            mode: 'propose',
            summary: `Blocking ${formatTime(start_time)}-${formatTime(end_time)}. No conflicts found.`,
            options: [{
                id: 'block_time',
                title: 'Block this time',
                description: `Mark ${formatTime(start_time)}-${formatTime(end_time)} as busy`,
                impact: 'Time will be protected from future scheduling',
                patch: {
                    operations: [{
                        type: 'create_block',
                        data: {
                            date,
                            start_time,
                            end_time,
                            context: 'Busy (blocked)',
                            block_type: 'buffer',
                            energy_level_required: 1,
                        }
                    }],
                    requires_confirmation: false,
                },
                preview: {
                    blocks_added: 1,
                    blocks_modified: 0,
                    blocks_removed: 0,
                    affected_dates: [date],
                },
                recommended: true,
            }],
            minimal_mode: context.user_state.is_minimal_mode,
            conversation_context: { can_undo: false },
            options_expire_at: getExpirationTime(10),
        };
    }

    const options: CoachOption[] = [];

    const earlierSlot = findAvailableSlot(context, date, 'before', start_time);
    if (earlierSlot) {
        options.push({
            id: 'move_earlier',
            title: 'Move to earlier slot',
            description: `Move ${conflictingBlocks[0].context} to ${formatTime(earlierSlot.start)}`,
            impact: `${conflictingBlocks.length} block(s) moved earlier`,
            patch: {
                operations: conflictingBlocks.map((block: any) => ({
                    type: 'move_block' as const,
                    block_id: block.id,
                    new_start: earlierSlot.start,
                    new_end: earlierSlot.end,
                })),
                requires_confirmation: false,
            },
            preview: {
                blocks_added: 0,
                blocks_modified: conflictingBlocks.length,
                blocks_removed: 0,
                affected_dates: [date],
            },
            recommended: true,
        });
    }

    const laterSlot = findAvailableSlot(context, date, 'after', end_time);
    if (laterSlot) {
        options.push({
            id: 'move_later',
            title: 'Move to later slot',
            description: `Move ${conflictingBlocks[0].context} to ${formatTime(laterSlot.start)}`,
            impact: `${conflictingBlocks.length} block(s) moved later`,
            patch: {
                operations: conflictingBlocks.map((block: any) => ({
                    type: 'move_block' as const,
                    block_id: block.id,
                    new_start: laterSlot.start,
                    new_end: laterSlot.end,
                })),
                requires_confirmation: false,
            },
            preview: {
                blocks_added: 0,
                blocks_modified: conflictingBlocks.length,
                blocks_removed: 0,
                affected_dates: [date],
            },
            recommended: false,
        });
    }

    if (options.length < 2) {
        options.push({
            id: 'skip_blocks',
            title: 'Skip these blocks',
            description: `Cancel ${conflictingBlocks.length} conflicting block(s)`,
            impact: `${conflictingBlocks.length} block(s) will be skipped`,
            tradeoff: {
                warning: 'These tasks will not be completed today',
                severity: 'warning',
            },
            patch: {
                operations: conflictingBlocks.map((block: any) => ({
                    type: 'delete_block' as const,
                    block_id: block.id,
                })),
                requires_confirmation: true,
            },
            preview: {
                blocks_added: 0,
                blocks_modified: 0,
                blocks_removed: conflictingBlocks.length,
                affected_dates: [date],
            },
            recommended: false,
        });
    }

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'propose',
        summary: `${conflictingBlocks.length} block(s) conflict with your busy time.`,
        options: options.slice(0, context.user_state.is_minimal_mode ? 2 : 3),
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ WHAT_NEXT ============
async function generateWhatNextResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    const now = timeToMinutes(context.current.time);

    const nextBlock = context.schedule.today
        .filter((b: any) => b.status === 'planned' && timeToMinutes(b.start_time) >= now - 15)
        .sort((a: any, b: any) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))[0];

    if (!nextBlock) {
        return {
            id: generateId(),
            timestamp: new Date().toISOString(),
            mode: 'inform',
            summary: "You're done for today! No more scheduled blocks.",
            options: [{
                id: 'add_bonus',
                title: 'Add bonus work',
                description: 'Schedule an extra block for today',
                impact: 'Get ahead on your goals',
                patch: { operations: [], requires_confirmation: false },
                preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
                recommended: false,
            }],
            minimal_mode: context.user_state.is_minimal_mode,
            conversation_context: { can_undo: false },
            options_expire_at: getExpirationTime(10),
        };
    }

    const startsIn = timeToMinutes(nextBlock.start_time) - now;
    const isNow = startsIn <= 5;

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'inform',
        summary: isNow
            ? `Now: ${nextBlock.context}`
            : `Up next in ${startsIn} min: ${nextBlock.context}`,
        options: [
            {
                id: 'start_now',
                title: isNow ? 'Start this block' : 'Start early',
                description: `Begin "${truncate(nextBlock.context, 30)}"`,
                impact: 'Block marked as active',
                patch: {
                    operations: [{
                        type: 'update_block' as const,
                        block_id: nextBlock.id,
                        changes: { status: 'in_progress' },
                    }],
                    requires_confirmation: false,
                },
                preview: {
                    blocks_added: 0,
                    blocks_modified: 1,
                    blocks_removed: 0,
                    affected_dates: [context.current.date],
                },
                recommended: true,
            },
            {
                id: 'skip',
                title: 'Skip this block',
                description: 'Move on to the next task',
                impact: 'Block marked as skipped',
                tradeoff: {
                    warning: 'This task will not be completed today',
                    severity: 'caution',
                },
                patch: {
                    operations: [{
                        type: 'update_block' as const,
                        block_id: nextBlock.id,
                        changes: { status: 'missed' },
                    }],
                    requires_confirmation: true,
                },
                preview: {
                    blocks_added: 0,
                    blocks_modified: 1,
                    blocks_removed: 0,
                    affected_dates: [context.current.date],
                },
                recommended: false,
            },
        ],
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ GENERAL_CHAT (Acknowledgment) ============
async function generateAcknowledgmentResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    const emotion = detectEmotion(context.last_user_message || '');

    const acknowledgments: Record<string, { message: string; offer: string }> = {
        frustration: {
            message: "I hear you. That sounds frustrating.",
            offer: "Want me to lighten your schedule?",
        },
        stress: {
            message: "That's a lot to deal with.",
            offer: "I can help reduce your load if you'd like.",
        },
        negativity: {
            message: "Tough day. It happens to everyone.",
            offer: "Would you like me to adjust today's plan?",
        },
        neutral: {
            message: "Got it.",
            offer: "Let me know if you need any schedule changes.",
        },
    };

    const ack = acknowledgments[emotion] || acknowledgments.neutral;

    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'acknowledge',
        summary: ack.message,
        acknowledgment: {
            message: ack.message,
            offer: ack.offer,
        },
        options: [{
            id: 'lighten_load',
            title: 'Lighten my load',
            description: 'Reduce today\'s workload',
            impact: 'Fewer tasks, more breathing room',
            patch: { operations: [], requires_confirmation: false },
            preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
            recommended: false,
        }],
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

// ============ OUT_OF_SCOPE ============
async function generateOutOfScopeResponse(
    context: CoachContext,
    classification: IntentClassification
): Promise<CoachResponse> {
    return {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: 'acknowledge',
        summary: "I'm your scheduling assistant, so I can't help with that.",
        acknowledgment: {
            message: "I'm your scheduling assistant, so I can't help with that.",
            offer: "But I can help you plan your day, adjust your schedule, or track your goals!",
        },
        minimal_mode: context.user_state.is_minimal_mode,
        conversation_context: { can_undo: false },
        options_expire_at: getExpirationTime(10),
    };
}

const generateMoveBlockResponse = genericPlaceholderResponse;
const generateDeleteBlockResponse = genericPlaceholderResponse;
const generateRescheduleDayResponse = genericPlaceholderResponse;
const generateRescheduleWeekResponse = genericPlaceholderResponse;
const generateEnergyHighResponse = genericPlaceholderResponse;
const generateBoredResponse = genericPlaceholderResponse;
const generateAdjustGoalResponse = genericPlaceholderResponse;
const generatePauseGoalResponse = genericPlaceholderResponse;
const generateGoalProgressResponse = genericPlaceholderResponse;
const generateExplainScheduleResponse = genericPlaceholderResponse;
const generateProgressCheckResponse = genericPlaceholderResponse;
const generateUndoResponse = genericPlaceholderResponse;

const INTENT_GENERATORS: Record<CoachIntent, ResponseGenerator> = {
    [CoachIntent.BUSY_AT_TIME]: generateBusyAtTimeResponse,
    [CoachIntent.MOVE_BLOCK]: generateMoveBlockResponse,
    [CoachIntent.ADD_TASK]: generateAddTaskResponse,
    [CoachIntent.DELETE_BLOCK]: generateDeleteBlockResponse,
    [CoachIntent.RESCHEDULE_DAY]: generateRescheduleDayResponse,
    [CoachIntent.RESCHEDULE_WEEK]: generateRescheduleWeekResponse,
    [CoachIntent.ENERGY_LOW]: generateEnergyLowResponse,
    [CoachIntent.ENERGY_HIGH]: generateEnergyHighResponse,
    [CoachIntent.OVERWHELMED]: generateOverwhelmedResponse,
    [CoachIntent.BORED]: generateBoredResponse,
    [CoachIntent.ADJUST_GOAL]: generateAdjustGoalResponse,
    [CoachIntent.PAUSE_GOAL]: generatePauseGoalResponse,
    [CoachIntent.GOAL_PROGRESS]: generateGoalProgressResponse,
    [CoachIntent.WHAT_NEXT]: generateWhatNextResponse,
    [CoachIntent.EXPLAIN_SCHEDULE]: generateExplainScheduleResponse,
    [CoachIntent.PROGRESS_CHECK]: generateProgressCheckResponse,
    [CoachIntent.UNDO_LAST]: generateUndoResponse,
    [CoachIntent.GENERAL_CHAT]: generateAcknowledgmentResponse,
    [CoachIntent.OUT_OF_SCOPE]: generateOutOfScopeResponse,
    [CoachIntent.CLARIFICATION_NEEDED]: generateClarificationResponse,
};

// Apply side effects hook stub for context updates
async function applySecondaryIntentEffects(
    context: CoachContext,
    secondary_intent: CoachIntent,
    classification: IntentClassification
): Promise<CoachContext> {
    return context;
}

export async function generateCoachResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    context: CoachContext
): Promise<CoachResponse> {

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

    let primaryContext = context;
    if (classification.secondary_intent) {
        primaryContext = await applySecondaryIntentEffects(
            context,
            classification.secondary_intent,
            classification
        );
    }

    const generator = INTENT_GENERATORS[classification.primary_intent];

    if (!generator) {
        console.error(`No generator for intent: ${classification.primary_intent}`);
        return generateClarificationResponse(context, classification);
    }

    const response = await generator(primaryContext, classification);
    const validated = validateCoachResponse(response);

    validated.conversation_context = {
        can_undo: context.last_applied_patch_version_id !== null,
        last_patch_version_id: context.last_applied_patch_version_id,
    };

    return validated;
}

function validateCoachResponse(response: CoachResponse): CoachResponse {
    if (response.options) {
        response.options = response.options.filter(opt => {
            if (!opt.patch || !opt.patch.operations) return false;
            if (!opt.id || !opt.title || !opt.description) return false;
            return true;
        });

        if (response.mode === 'propose' && response.options.length < 2) {
            response.options.push(createFallbackOption());
        }
    }

    return response;
}

function createFallbackOption(): CoachOption {
    return {
        id: 'open_calendar',
        title: 'Open calendar',
        description: 'Make changes manually',
        impact: 'Full control over your schedule',
        patch: { operations: [], requires_confirmation: false },
        preview: { blocks_added: 0, blocks_modified: 0, blocks_removed: 0, affected_dates: [] },
        recommended: false,
    };
}
