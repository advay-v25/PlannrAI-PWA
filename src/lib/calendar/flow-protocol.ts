/**
 * 🧠 PLANNRAI — FLOW-STATE PROTOCOL ENGINE
 * 
 * Encodes cognitive science principles for optimal scheduling:
 * - Ultradian rhythms (90-min deep work + 20-min recovery)
 * - Energy arc management (ramp-up → peak → trough → rebound → wind-down)
 * - Chronotype-aware phase shifting
 * - Cognitive switching cost buffers
 * - Behavior-pattern-aware goal placement
 */

import type { CalendarContext } from './context-builder';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';

// ── Types ────────────────────────────────────────────────────────

export interface DayPhase {
    name: 'ramp_up' | 'peak' | 'trough' | 'rebound' | 'wind_down';
    label: string;
    start_minutes: number;
    end_minutes: number;
    allowed_energy: ('high' | 'medium' | 'low')[];
    max_deep_work_minutes: number;
    recommended_block_types: string[];
    description: string;
}

export interface FlowViolation {
    block_title: string;
    block_time: string;
    violation: string;
    suggestion: string;
}

// ── Phase Computation ────────────────────────────────────────────

/**
 * Computes the 5 energy phases of the day based on wake/sleep times and chronotype.
 *
 * The phases shift based on chronotype:
 * - BEAR (default): Standard schedule, peak 9am-12pm
 * - LARK/EARLY_BIRD: Everything shifts 1-2h earlier, peak 7am-10:30am
 * - OWL/NIGHT_OWL: Everything shifts 2-3h later, peak 11am-2:30pm
 * - WOLF: Late start, peak 1pm-5pm
 *
 * @param wakeMinutes - Minutes from midnight user wakes up (in their local timezone)
 * @param sleepMinutes - Minutes from midnight user sleeps (in their local timezone)
 * @param chronotype - User's chronotype ('bear', 'lark', 'early_bird', 'owl', 'night_owl', 'wolf')
 * @param timezone - User's timezone (e.g., 'America/New_York'); used for validation only
 */
export function computeDayPhases(
    wakeMinutes: number,
    sleepMinutes: number,
    chronotype: string = 'bear',
    timezone: string = DEFAULT_TIMEZONE
): DayPhase[] {
    // Chronotype offsets (minutes to shift the entire energy arc)
    // Negative offsets = earlier peak; positive = later peak
    const chronoOffset: Record<string, number> = {
        'lark': -90,      // Peak 1-2h earlier
        'early_bird': -90, // Peak 1-2h earlier
        'bear': 0,         // Standard peak (9am-12pm)
        'owl': 120,        // Peak 2h later
        'night_owl': 150,  // Peak 2.5h later
        'wolf': 180,       // Peak 3h later
    };

    const offset = chronoOffset[chronotype.toLowerCase()] || 0;

    // Normalize sleep onto a continuous wake-to-sleep timeline FIRST. A
    // bedtime at or before wake time (e.g. wake 07:00, sleep 00:00) is past
    // midnight and must be treated as wake + ~17h, not as an earlier clock
    // minute — computing windDownMinutes from the raw clock value before
    // this normalization previously went negative for any such bedtime,
    // which clamped every phase boundary below it and silently produced
    // zero phases for the whole day.
    let actualSleepMinutes = sleepMinutes;
    if (actualSleepMinutes <= wakeMinutes) {
        actualSleepMinutes += 1440; // Add 24 hours
    }
    const windDownMinutes = actualSleepMinutes - 30; // 30 min before sleep

    // VALIDATION: Ensure wake and sleep times make sense (within 16-20 hours)
    const awakeHours = (actualSleepMinutes - wakeMinutes) / 60;
    if (awakeHours < 16 || awakeHours > 20) {
        // Log warning but don't fail - could be valid edge case (shift worker)
        console.warn(`[Flow Protocol] Unusual wake-sleep window: ${awakeHours.toFixed(1)}h (${chronotype} chronotype, timezone: ${timezone})`);
    }

    // Base phase boundaries (relative to wake time for BEAR)
    // Ramp-Up:  wake → wake+90min (routine, breakfast, light prep)
    // Peak:     wake+90min → wake+5h (deep focus, highest energy)
    // Trough:   wake+5h → wake+7h (post-lunch dip, light tasks)
    // Rebound:  wake+7h → wake+10h (creative work, moderate goals, exercise)
    // Wind-Down: wake+10h → sleep (social, light goals, dinner, evening routine)

    const rampUpStart = wakeMinutes;
    const rampUpEnd = Math.min(wakeMinutes + 90 + offset, windDownMinutes);
    const peakStart = rampUpEnd;
    const peakEnd = Math.min(wakeMinutes + 300 + offset, windDownMinutes); // wake + 5h
    const troughStart = peakEnd;
    const troughEnd = Math.min(wakeMinutes + 420 + offset, windDownMinutes); // wake + 7h
    const reboundStart = troughEnd;
    const reboundEnd = Math.min(wakeMinutes + 600 + offset, windDownMinutes); // wake + 10h

    // Wind-down starts at the later of: rebound end OR (30 min before sleep - 60 min buffer)
    const windDownStart = Math.max(reboundEnd, windDownMinutes - 60);

    const phases: DayPhase[] = [];

    // Only add phases that have positive duration
    if (rampUpEnd > rampUpStart) {
        phases.push({
            name: 'ramp_up',
            label: 'Ramp-Up',
            start_minutes: rampUpStart,
            end_minutes: rampUpEnd,
            allowed_energy: ['low', 'medium'],
            max_deep_work_minutes: 0,
            recommended_block_types: ['routine', 'meal', 'buffer'],
            description: 'Morning activation — routine, breakfast, light review. NO deep work yet.',
        });
    }

    if (peakEnd > peakStart) {
        phases.push({
            name: 'peak',
            label: 'Peak Focus',
            start_minutes: peakStart,
            end_minutes: peakEnd,
            allowed_energy: ['high', 'medium', 'low'], // All energy levels OK; time is prime real estate
            max_deep_work_minutes: Math.min(180, peakEnd - peakStart), // Max 3h of deep work
            recommended_block_types: ['goal', 'buffer'],
            description: 'Highest cognitive capacity. Prioritize high-energy goals, but low-energy maintenance tasks (admin, reviews) also fit here.',
        });
    }

    if (troughEnd > troughStart) {
        phases.push({
            name: 'trough',
            label: 'Recovery Trough',
            start_minutes: troughStart,
            end_minutes: troughEnd,
            allowed_energy: ['low', 'medium'],
            max_deep_work_minutes: 30, // Only lightweight deep work
            recommended_block_types: ['meal', 'flex', 'buffer', 'goal'],
            description: 'Post-lunch energy dip. Lunch, admin tasks, light goals, or a brief nap/walk. Avoid heavy cognitive work.',
        });
    }

    if (reboundEnd > reboundStart) {
        phases.push({
            name: 'rebound',
            label: 'Afternoon Rebound',
            start_minutes: reboundStart,
            end_minutes: reboundEnd,
            allowed_energy: ['high', 'medium', 'low'], // All energy levels; great for creative + body work
            max_deep_work_minutes: Math.min(120, reboundEnd - reboundStart),
            recommended_block_types: ['goal', 'buffer', 'flex'],
            description: 'Second wind. Ideal for creative work, body/exercise goals, and moderate focus. Use 45-60min blocks.',
        });
    }

    if (windDownMinutes > windDownStart) {
        phases.push({
            name: 'wind_down',
            label: 'Wind-Down',
            start_minutes: windDownStart,
            end_minutes: windDownMinutes,
            allowed_energy: ['low'],
            max_deep_work_minutes: 0,
            recommended_block_types: ['meal', 'routine', 'buffer', 'flex'],
            description: 'Evening deceleration. Dinner, light review, social time, evening routine. NO intense work.',
        });
    }

    return phases;
}

// ── Prompt Fragment Builder ──────────────────────────────────────

/**
 * Builds a detailed prompt fragment that describes the day's energy phases
 * with specific time windows and scheduling guidance for the AI.
 */
export function buildFlowPromptFragment(
    phases: DayPhase[],
    ctx: CalendarContext
): string {
    const minutesToTime = (m: number): string => {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    };

    let fragment = `\n━━━ ENERGY ARC & FLOW PROTOCOL ━━━\n`;
    fragment += `Use these phases to decide WHEN to schedule each type of block.\n\n`;

    for (const phase of phases) {
        const duration = phase.end_minutes - phase.start_minutes;
        fragment += `▸ ${phase.label.toUpperCase()} (${minutesToTime(phase.start_minutes)}–${minutesToTime(phase.end_minutes)}) [${duration}min]\n`;
        fragment += `  ${phase.description}\n`;
        fragment += `  Allowed goal energy: ${phase.allowed_energy.join(', ')}\n`;
        if (phase.max_deep_work_minutes > 0) {
            fragment += `  Max deep work: ${phase.max_deep_work_minutes}min\n`;
        }
        fragment += `\n`;
    }

    // Add ultradian rhythm guidance
    fragment += `━━━ ULTRADIAN RHYTHM RULES ━━━\n`;
    fragment += `• Deep work blocks: 60-90 minutes MAX, then a 15-20min Active Recovery\n`;
    fragment += `• Active Recovery = walk, stretch, breathe, hydrate — NOT another task\n`;
    fragment += `• After 2 consecutive deep work cycles, schedule a 30min REAL break (meal, free time)\n`;
    fragment += `• Max 3-4 deep work cycles per day (180-360 min total focused work)\n\n`;

    // Add cognitive switching cost guidance
    fragment += `━━━ TRANSITIONS ━━━\n`;
    fragment += `• Same-pillar back-to-back: 5-10 min buffer (context is warm)\n`;
    fragment += `• Different-pillar switch: 15 min transition buffer\n`;
    fragment += `• After a fixed commitment (e.g. Work): 20 min decompression buffer before new deep work\n\n`;

    // Add habit stack rules
    fragment += `━━━ HABIT STACKS ━━━\n`;
    fragment += `• If you schedule a block that is a "trigger habit" for an active Habit Stack, you MUST immediately append a block for the "action habit" directly after it.\n`;
    fragment += `• Do not separate a trigger habit and its action habit with breaks or other tasks.\n`;

    return fragment;
}

// ── Behavior Insights Builder ────────────────────────────────────

/**
 * Translates behavior pattern data and coach learnings into 
 * human-readable scheduling constraints for the AI prompt.
 */
export function buildBehaviorInsights(ctx: CalendarContext): string {
    const insights: string[] = [];

    // Behavior patterns
    if (ctx.behaviorPatterns) {
        const bp = ctx.behaviorPatterns;

        // Preferred windows
        if (bp.preferred_windows) {
            const windowEntries = Object.entries(bp.preferred_windows);
            if (windowEntries.length > 0) {
                for (const [pillar, windows] of windowEntries) {
                    if (Array.isArray(windows) && windows.length > 0) {
                        insights.push(`User prefers ${pillar.toUpperCase()} goals in the ${windows.join('/')}`);
                    }
                }
            }
        }

        // Completion rates
        if (bp.completion_rates) {
            const rateEntries = Object.entries(bp.completion_rates);
            for (const [pillar, rate] of rateEntries) {
                if (typeof rate === 'number') {
                    if (rate < 40) {
                        insights.push(`⚠️ User only completes ${rate}% of ${pillar} blocks — schedule fewer, shorter ${pillar} blocks`);
                    } else if (rate > 80) {
                        insights.push(`✓ User reliably completes ${pillar} blocks (${rate}%) — can schedule confidently`);
                    }
                }
            }
        }

        // Density tolerance
        if (typeof bp.density_tolerance === 'number') {
            if (bp.density_tolerance < 6) {
                insights.push(`User gets overwhelmed above ${bp.density_tolerance} blocks/day — keep schedule light`);
            } else if (bp.density_tolerance > 10) {
                insights.push(`User handles dense schedules well (${bp.density_tolerance}+ blocks) — can pack more in`);
            }
        }
    }

    // Coach learnings
    if (ctx.coachLearnings && ctx.coachLearnings.length > 0) {
        insights.push('');
        insights.push('COACH INSIGHTS (from past conversations):');
        for (const learning of ctx.coachLearnings.slice(0, 5)) {
            insights.push(`  • [${learning.category}] ${learning.learning}`);
        }
    }

    // Daily energy state
    if (ctx.dailyEnergyState) {
        const { energy_level, emotional_state } = ctx.dailyEnergyState;
        const energyMap: Record<number, string> = {
            1: 'VERY LOW — schedule a recovery day with minimal goals',
            2: 'LOW — lighter schedule, more breaks, fewer deep work blocks',
            3: 'MODERATE — standard schedule',
            4: 'HIGH — can push for more deep work',
            5: 'PEAK — maximize deep work, ambitious schedule',
        };
        insights.push(`TODAY'S CHECK-IN: Energy ${energy_level}/5 (${energyMap[energy_level] || 'standard'}), Mood: ${emotional_state}`);
    }

    if (insights.length === 0) {
        return '';
    }

    return `\n━━━ BEHAVIORAL INTELLIGENCE ━━━\n${insights.join('\n')}\n`;
}

// ── Goal Progress Builder ────────────────────────────────────────

/**
 * Builds a prompt fragment showing weekly progress per goal,
 * so the AI knows which goals to prioritize today.
 */
export function buildGoalProgressFragment(ctx: CalendarContext): string {
    if (!ctx.goalProgress || ctx.goalProgress.length === 0) return '';

    let fragment = `\n━━━ WEEKLY PROGRESS (prioritize goals that are behind) ━━━\n`;

    for (const gp of ctx.goalProgress) {
        const pctComplete = gp.weekly_target_minutes > 0
            ? Math.round((gp.completed_minutes_this_week / gp.weekly_target_minutes) * 100)
            : 0;
        const status = pctComplete >= 100 ? '✅ ON TRACK'
            : pctComplete >= 60 ? '🔶 CLOSE'
            : '🔴 BEHIND';

        fragment += `  ${status} ${gp.goal_title}: ${gp.completed_minutes_this_week}/${gp.weekly_target_minutes}min done`;
        if (gp.daily_target_today > 0 && pctComplete < 100) {
            fragment += ` → needs ~${gp.daily_target_today}min today`;
        }
        fragment += `\n`;
    }

    return fragment;
}

// ── Post-Processing Validator & Auto-Fixer ──────────────────────

/**
 * Validates AI-generated blocks against flow-state constraints and attempts to auto-fix violations.
 *
 * This function performs TWO operations:
 * 1. VALIDATE: Checks blocks against ultradian rhythm, deep work limits, phase alignment, overlaps
 * 2. AUTO-FIX: Shifts overlapping blocks and returns corrected schedule
 *
 * Returns both violations (for logging/feedback) and fixedBlocks (corrected schedule).
 * Caller should use fixedBlocks in the final schedule; violations for user messaging.
 */
export function validateFlowConstraints(
    blocks: any[],
    phases: DayPhase[],
    ctx: CalendarContext
): { valid: boolean; violations: FlowViolation[]; fixedBlocks: any[] } {
    const violations: FlowViolation[] = [];
    const fixedBlocks = blocks.map(b => ({ ...b }));

    const timeToMinutes = (t: string): number => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const minutesToTime = (m: number): string => {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    };

    // 1. Check for overlapping blocks using explicit interval math
    // Create indexed list for tracking during sort
    const indexed = fixedBlocks.map((block, idx) => ({
        ...block,
        originalIndex: idx,
        startMin: timeToMinutes(block.start_time),
        endMin: timeToMinutes(block.end_time),
    }));

    const sorted = indexed.sort((a, b) => a.startMin - b.startMin);

    for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        // Explicit interval overlap check: the next block starts before the current one ends.
        const hasOverlap = current.endMin > next.startMin;

        if (hasOverlap) {
            violations.push({
                block_title: next.title,
                block_time: `${next.start_time}-${next.end_time}`,
                violation: `Overlaps with "${current.title}" (ends ${current.end_time})`,
                suggestion: `Shift to ${minutesToTime(current.endMin + 5)}`, // Add 5min buffer
            });

            // Auto-fix: shift the overlapping block by adding 5min buffer after previous block
            const duration = next.endMin - next.startMin;
            const fixedStart = current.endMin + 5; // 5min buffer
            fixedBlocks[next.originalIndex].start_time = minutesToTime(fixedStart);
            fixedBlocks[next.originalIndex].end_time = minutesToTime(fixedStart + duration);
        }
    }

    // 2. Check deep work blocks are in appropriate phases
    for (const block of fixedBlocks) {
        if (block.block_type !== 'goal') continue;

        const blockStart = timeToMinutes(block.start_time);
        const blockDuration = timeToMinutes(block.end_time) - blockStart;

        // Find which phase this block falls in
        const phase = phases.find(p =>
            blockStart >= p.start_minutes && blockStart < p.end_minutes
        );

        if (!phase) continue;

        // Is this a deep work block (>45 min with high energy demand)?
        const isDeepWork = blockDuration >= 45;
        const goalEnergy = block.energy_demand || 'medium';

        if (isDeepWork && goalEnergy === 'high' && phase.name === 'trough') {
            violations.push({
                block_title: block.title,
                block_time: `${block.start_time}-${block.end_time}`,
                violation: 'High-energy deep work scheduled during energy trough',
                suggestion: 'Consider moving to peak or rebound phase',
            });
        }

        if (isDeepWork && phase.name === 'wind_down') {
            violations.push({
                block_title: block.title,
                block_time: `${block.start_time}-${block.end_time}`,
                violation: 'Deep work scheduled during wind-down phase',
                suggestion: 'Move to earlier in the day or reduce duration',
            });
        }

        if (isDeepWork && phase.name === 'ramp_up') {
            violations.push({
                block_title: block.title,
                block_time: `${block.start_time}-${block.end_time}`,
                violation: 'Deep work scheduled during ramp-up (body not ready)',
                suggestion: 'Move to peak phase for better focus',
            });
        }
    }

    // 3. Check for ultradian rhythm violations (deep work sessions with proper recovery)
    const goalBlocks = sorted.filter(b => b.block_type === 'goal');

    // Track deep work sessions explicitly: contiguous blocks separated by <15min gaps
    interface DeepWorkSession {
        blocks: number[]; // Indices in goalBlocks
        totalDuration: number;
        startTime: number;
        endTime: number;
    }
    const sessions: DeepWorkSession[] = [];
    let currentSession: DeepWorkSession | null = null;

    for (let i = 0; i < goalBlocks.length; i++) {
        const duration = timeToMinutes(goalBlocks[i].end_time) - timeToMinutes(goalBlocks[i].start_time);
        const isDeepWork = duration >= 45;

        if (!isDeepWork) continue; // Skip non-deep-work blocks

        if (currentSession === null) {
            // Start a new session
            currentSession = {
                blocks: [i],
                totalDuration: duration,
                startTime: timeToMinutes(goalBlocks[i].start_time),
                endTime: timeToMinutes(goalBlocks[i].end_time),
            };
        } else {
            // Check gap to previous block in session
            const gapFromPrevious = timeToMinutes(goalBlocks[i].start_time) - currentSession.endTime;

            if (gapFromPrevious < 15) {
                // Extend current session
                currentSession.blocks.push(i);
                currentSession.totalDuration += duration;
                currentSession.endTime = timeToMinutes(goalBlocks[i].end_time);
            } else {
                // Gap >= 15 min: previous session ends, new session starts
                sessions.push(currentSession);
                currentSession = {
                    blocks: [i],
                    totalDuration: duration,
                    startTime: timeToMinutes(goalBlocks[i].start_time),
                    endTime: timeToMinutes(goalBlocks[i].end_time),
                };
            }
        }

        // Check individual block limit: max 90 min per deep work block
        if (duration > 90) {
            violations.push({
                block_title: goalBlocks[i].title,
                block_time: `${goalBlocks[i].start_time}-${goalBlocks[i].end_time}`,
                violation: `Deep work block exceeds 90-min limit (${duration}min)`,
                suggestion: 'Split into two 45min blocks with 15min recovery between',
            });
        }
    }

    // Finalize last session
    if (currentSession) {
        sessions.push(currentSession);
    }

    // Check session-level constraints
    for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];

        // Max 90 min per session
        if (session.totalDuration > 90) {
            violations.push({
                block_title: `Deep Work Session ${i + 1}`,
                block_time: `${minutesToTime(session.startTime)}-${minutesToTime(session.endTime)}`,
                violation: `Session exceeds 90-min ultradian limit (${session.totalDuration}min)`,
                suggestion: 'Insert a 15-20min Active Recovery block in the middle',
            });
        }

        // After 2 sessions, require 30+ min break
        if (i >= 2 && i > 0) {
            const prevSessionEnd = sessions[i - 1].endTime;
            const currSessionStart = session.startTime;
            const breakDuration = currSessionStart - prevSessionEnd;

            if (breakDuration < 30) {
                violations.push({
                    block_title: `Deep Work Session ${i + 1}`,
                    block_time: `${minutesToTime(session.startTime)}`,
                    violation: `Session 3+ requires 30+ min break (only ${breakDuration}min gap)`,
                    suggestion: 'Add a 30min break or shift this session later',
                });
            }
        }
    }

    // Max 4 sessions per day
    if (sessions.length > 4) {
        violations.push({
            block_title: 'Overall Schedule',
            block_time: 'all day',
            violation: `${sessions.length} deep work sessions exceeds recommended 4 per day`,
            suggestion: 'Merge some sessions or move some to next day',
        });
    }

    // 4. Check total deep work doesn't exceed 4 hours (360 min)
    const totalDeepWork = goalBlocks.reduce((sum, b) => {
        const dur = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
        return sum + (dur >= 45 ? dur : 0);
    }, 0);

    if (totalDeepWork > 360) {
        violations.push({
            block_title: 'Overall Schedule',
            block_time: 'all day',
            violation: `${totalDeepWork}min of deep work exceeds recommended 360min max`,
            suggestion: 'Reduce deep work blocks or shorten some to 30min light sessions',
        });
    }

    return {
        valid: violations.length === 0,
        violations,
        fixedBlocks,
    };
}


