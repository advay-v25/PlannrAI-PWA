/**
 * 🗓️ PLANNRAI — PLAN WEEK DETERMINISTIC GENERATOR
 * Generates 3 weekly schedule variants using strict mathematical constraints.
 * Replaces unreliable LLM bin-packing with guaranteed day/minute accuracy.
 */

import type { CalendarContext } from '@/lib/calendar/context-builder';
import { addDays, format, parseISO } from 'date-fns';
import {
    computeDayPhases,
    type DayPhase,
    filterWindowsByEnergyCompat,
    scoreWindowAffinity,
    getDaySessionState,
    computeSessionRoomLeft,
    requiresSessionBreakGap,
    resolveAdjacencyBuffer,
    getFailureModeAdjustments,
} from './practical-constraints';

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
        unscheduled_minutes: Record<string, number>;
    };
}

interface PlanBlock {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    block_type: string;
    goal_id?: string;
    pillar?: string;
    checklist?: Array<{ text: string }>;
    energy_demand?: string; // stored on goal blocks so later adjacency checks don't need to re-look-up the goal
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

function safeAddMins(hhmm: string, mins: number) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + mins) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

// ── Protocol Config (from SchedulingProtocol) ───────────────────

export interface ProtocolConfig {
    bufferMinutes?: number;
    maxGoalBlocksPerDay?: number;
    maxDeepWorkMins?: number;
}

// ── Buffer Routing Helper ────────────────────────────────────────

/**
 * Returns the appropriate buffer size (minutes) for a given strategy and variant.
 * Ensures strategy choice is respected consistently throughout plan generation.
 *
 * MOMENTUM: 0 min (back-to-back blocks for maximum output)
 * BALANCED: 15 min (default cognitive switching buffer)
 * RECOVERY: 60-120 min (depends on variant: Spaced Mindfulness/Gentle Afternoon=120, Weekend Shift=60)
 */
function getBufferMinutes(
    strategyId: string,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday',
    userDefaultBuffer?: number
): number {
    if (strategyId === 'momentum') {
        return 0; // Zero buffers: back-to-back blocks
    } else if (strategyId === 'balanced') {
        return userDefaultBuffer || 15; // Default cognitive switching buffer
    } else if (strategyId === 'recovery') {
        // Recovery variants have different spacing:
        // - Spaced Mindfulness: 120 min gaps (timeFocus undefined)
        // - Weekend Shift: 60 min gaps (timeFocus 'weekend')
        // - Gentle Afternoon (no-weekend fallback): 120 min gaps (timeFocus 'afternoon', forceLightWeekend true)
        return timeFocus === 'weekend' ? 60 : 120; // 60 for Weekend Shift, 120 for others
    }
    return userDefaultBuffer || 15; // Safe default
}

// ── Day-Capacity Helpers ──────────────────────────────────────────

const RECOVERY_LIGHT_LOAD_THRESHOLD = 0.75;

/**
 * Relaxes mode-level daily caps (maxGoalBlocksPerDay / maxDeepWorkMins) when
 * the user's total weekly goal load is already comfortably under what the
 * caps would allow across the week. The caps exist to force lighter days
 * when there's real cramming pressure — they shouldn't block a genuinely
 * light week from being fully scheduled.
 */
function computeEffectiveDailyCaps(
    totalWeeklyMinsNeeded: number,
    protocolConfig: ProtocolConfig | undefined,
    eligibleDayCount: number
): { maxGoalBlocksPerDay?: number; maxDeepWorkMins?: number } {
    if (!protocolConfig?.maxDeepWorkMins) {
        return { maxGoalBlocksPerDay: protocolConfig?.maxGoalBlocksPerDay, maxDeepWorkMins: protocolConfig?.maxDeepWorkMins };
    }
    const weeklyCapacityUnderCaps = protocolConfig.maxDeepWorkMins * Math.max(1, eligibleDayCount);
    const isLightLoad = totalWeeklyMinsNeeded <= weeklyCapacityUnderCaps * RECOVERY_LIGHT_LOAD_THRESHOLD;
    if (isLightLoad) {
        return { maxGoalBlocksPerDay: undefined, maxDeepWorkMins: undefined };
    }
    return { maxGoalBlocksPerDay: protocolConfig.maxGoalBlocksPerDay, maxDeepWorkMins: protocolConfig.maxDeepWorkMins };
}

interface DayCapacity {
    hasBlockRoom: boolean;
    minutesHeadroom: number; // Infinity if no cap is set
}

/**
 * Checks remaining room for a given day against the (possibly relaxed)
 * daily caps. Block-count and minutes are tracked GLOBALLY per day across
 * ALL goals within one generateVariant() run — the caps are a total-per-day
 * ceiling, not per-goal or per-pillar.
 */
function getDayCapacity(
    isoDay: number,
    goalBlockCountPerDay: Map<number, number>,
    workloadPerDay: Map<number, number>,
    effectiveCaps: { maxGoalBlocksPerDay?: number; maxDeepWorkMins?: number }
): DayCapacity {
    const maxBlocks = effectiveCaps.maxGoalBlocksPerDay ?? Infinity;
    const maxMins = effectiveCaps.maxDeepWorkMins ?? Infinity;
    const blockCount = goalBlockCountPerDay.get(isoDay) || 0;
    const minutesUsed = workloadPerDay.get(isoDay) || 0;
    return {
        hasBlockRoom: blockCount < maxBlocks,
        minutesHeadroom: Math.max(0, maxMins - minutesUsed),
    };
}

/**
 * Records a placed block against BOTH global per-day trackers in one call —
 * keeps block-count tracking from ever drifting out of sync with minutes.
 */
function recordGoalBlockPlacement(
    isoDay: number,
    minsPlaced: number,
    goalBlockCountPerDay: Map<number, number>,
    workloadPerDay: Map<number, number>
): void {
    goalBlockCountPerDay.set(isoDay, (goalBlockCountPerDay.get(isoDay) || 0) + 1);
    workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + minsPlaced);
}

// ── Window Ordering & Anchoring Helpers ───────────────────────────

/**
 * Orders candidate windows within a day by mode/timeFocus preference. Shared
 * by both Pass 1 and the Cram Pass so they can't drift apart — previously
 * only Pass 1 had this and Cram Pass fell back to raw chronological order.
 */
function sortWindowsByPreference(
    windows: Array<{ start: number; end: number }>,
    opts: {
        timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday';
        pillar?: string;
        strategyId: string;
        goalImportance?: number;
        // "Energy-Synced" variant only: energy-phase affinity becomes the
        // PRIMARY sort key (windows in the goal's best-matched phase come
        // first) instead of the usual time-of-day/pillar tiebreakers, which
        // only apply among windows of equal affinity.
        energyPrimary?: { goalEnergy: 'low' | 'medium' | 'high'; phases: DayPhase[] };
    }
): Array<{ start: number; end: number }> {
    const { timeFocus, pillar, strategyId, goalImportance, energyPrimary } = opts;
    return [...windows].sort((a, b) => {
        if (energyPrimary) {
            const aScore = scoreWindowAffinity(a.start, energyPrimary.goalEnergy, energyPrimary.phases);
            const bScore = scoreWindowAffinity(b.start, energyPrimary.goalEnergy, energyPrimary.phases);
            if (aScore !== bScore) return bScore - aScore; // best-matched phase first
        }
        if (timeFocus === 'morning') return a.start - b.start;
        if (timeFocus === 'afternoon') return Math.abs(a.start - 780) - Math.abs(b.start - 780);
        if (timeFocus === 'evening') return b.start - a.start;
        // Weekday Sprint's real identity isn't a time-of-day preference at
        // all (unlike morning/afternoon/evening) — it's day-of-week
        // concentration, already handled by the Mon-Thu day-bucket sort
        // above. But leaving window-level ordering unhandled here meant it
        // silently fell through to the same pillar-based default Peak Hour
        // Blitz uses, which under abundant capacity converges to a
        // byte-identical schedule (day order alone doesn't change the final
        // block set once every day has room). Bias toward later-in-day
        // slots — "grinding through Mon-Thu" rather than Blitz's strict
        // early-morning clustering — so the two variants stay genuinely
        // distinct even when nothing is capacity-constrained.
        if (timeFocus === 'weekday') return b.start - a.start;

        if (pillar === 'mind') return a.start - b.start;
        if (pillar === 'body') {
            if (strategyId === 'momentum') {
                if ((goalImportance || 5) >= 8) return a.start - b.start; // Frog-eating: early morning
                return a.start - b.start;
            }
            if (strategyId === 'recovery') {
                const aIsAfternoon = a.start >= 720;
                const bIsAfternoon = b.start >= 720;
                if (aIsAfternoon && !bIsAfternoon) return -1;
                if (!aIsAfternoon && bIsAfternoon) return 1;
                return a.start - b.start;
            }
            return a.start - b.start; // balanced: flexible/ascending
        }
        return a.start - b.start;
    });
}

/**
 * Decides WHERE within a chosen window a block starts. An explicit
 * timeFocus anchors the block toward that edge of the window (the window
 * itself was already preference-ordered by sortWindowsByPreference);
 * mathematical centering is reserved for the mode's undefined-timeFocus
 * ("Standard"/default) variant. Momentum always packs at the early edge.
 */
function computeWindowAnchorStart(
    winStart: number,
    winEnd: number,
    blockMins: number,
    buffer: number,
    strategyId: string,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday'
): number {
    if (strategyId !== 'balanced' && strategyId !== 'recovery') {
        return winStart; // momentum: pack at the window's early edge
    }
    if (timeFocus === 'evening') {
        return Math.max(winStart, winEnd - blockMins); // hug the late edge
    }
    if (timeFocus === 'morning' || timeFocus === 'afternoon') {
        // Window was already chosen for morning/afternoon proximity; hug its
        // early edge rather than centering further within it.
        return winStart;
    }
    // timeFocus undefined (mode's default/"Standard" variant): original
    // mathematical-centering behavior, preserved as-is.
    const available = winEnd - winStart;
    if (available > blockMins + buffer * 2) {
        const freeSpace = available - blockMins;
        return winStart + Math.floor(freeSpace / 2);
    }
    if (strategyId === 'recovery') {
        const possibleStart = winStart + Math.min(buffer, available - blockMins);
        return Math.max(winStart, possibleStart);
    }
    return winStart;
}

// Snap a computed start time to the nearest 15-minute mark. Nothing in this
// file previously snapped a start (only a duration, at the splinter-prevention
// site above), so centering math like `winStart + Math.floor(freeSpace / 2)`
// — and non-15 buffer/gap constants feeding a chained `winStart += consumed`
// — could drift a block onto an arbitrary minute (e.g. 17:11). Clamped back
// inside [winStart, winEnd - blockMins] so rounding can never push a block
// past its window's real edge into whatever it was placed to avoid.
function snapStartToGrid(start: number, winStart: number, winEnd: number, blockMins: number): number {
    const snapped = Math.round(start / 15) * 15;
    return Math.max(winStart, Math.min(snapped, winEnd - blockMins));
}

function slugify(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

/**
 * How many minutes of this goal are actually left to schedule this week.
 * Single source of truth shared by the main per-goal placement loop and the
 * body-pillar day-lane apportionment (which runs before that loop) — they
 * must never compute this independently or the lane math can drift out of
 * sync with what the main loop actually tries to place.
 */
function computeRemainingWeeklyMins(
    goal: any,
    ctx: CalendarContext,
    replanFromDate?: string
): number {
    const progress = ctx.goalProgress?.find(p => p.goal_id === goal.id);
    const remainingMins = progress ? progress.remaining_minutes : (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
    if (!replanFromDate) return remainingMins;
    const targetMins = (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
    const minsBeforeReplan = ctx.schedule.this_week
        .filter(b => b.goal_id === goal.id && b.date < replanFromDate && b.status !== 'cancelled' && b.status !== 'missed')
        .reduce((sum, b) => {
            const duration = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
            return sum + Math.max(0, duration);
        }, 0);
    return Math.max(0, targetMins - minsBeforeReplan);
}

/**
 * Largest Remainder Method: apportions `totalSlots` integer slots across
 * `needs` proportionally to each entry's `need`, capped so no entry ever
 * receives more than its own `need`. Used to split a week's body-pillar
 * "1 block/day" slots fairly between competing body goals when their
 * combined need exceeds what the week can hold.
 */
function largestRemainderApportion(
    needs: Array<{ id: string; need: number }>,
    totalSlots: number
): Map<string, number> {
    const totalNeed = needs.reduce((s, n) => s + n.need, 0);
    const quotas = new Map<string, number>();
    if (totalNeed === 0) {
        needs.forEach(n => quotas.set(n.id, 0));
        return quotas;
    }
    const entries = needs.map(n => {
        const exact = totalSlots * n.need / totalNeed;
        return { id: n.id, need: n.need, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    entries.forEach(e => quotas.set(e.id, Math.min(e.floor, e.need)));
    let remainder = totalSlots - entries.reduce((s, e) => s + quotas.get(e.id)!, 0);
    const byFracDesc = [...entries].sort((a, b) => b.frac - a.frac);
    let idx = 0;
    let safety = 0;
    while (remainder > 0 && safety < byFracDesc.length * 3) {
        const e = byFracDesc[idx % byFracDesc.length];
        const current = quotas.get(e.id)!;
        if (current < e.need) {
            quotas.set(e.id, current + 1);
            remainder--;
        }
        idx++;
        safety++;
    }
    return quotas;
}

/**
 * Finds the nearest already-placed goal block or anchor ending at-or-before
 * `candidateStart` on the same day — used by the cross-goal/cross-pillar
 * adjacency floor to know what a new placement would actually sit next to.
 */
function findPrevAdjacentBlock(
    dateStr: string,
    candidateStart: number,
    dayBlocks: PlanBlock[],
    dayExclusions: Array<{ start: number; end: number; title: string; type: string }>
): { pillar?: string; energy_demand?: string; block_type: string } | null {
    let best: { end: number; pillar?: string; energy_demand?: string; block_type: string } | null = null;

    for (const b of dayBlocks) {
        if (b.date !== dateStr || b.block_type !== 'goal') continue;
        const bEnd = timeToMinutes(b.end_time);
        if (bEnd <= candidateStart && (!best || bEnd > best.end)) {
            best = { end: bEnd, pillar: b.pillar, energy_demand: b.energy_demand, block_type: 'goal' };
        }
    }
    for (const ex of dayExclusions) {
        if (ex.type !== 'anchor') continue;
        if (ex.end <= candidateStart && (!best || ex.end > best.end)) {
            best = { end: ex.end, block_type: 'anchor' };
        }
    }
    return best;
}

// ── Tier-2 Bio-Block Overlap Resolver ─────────────────────────────
// Anchors (Tier 1) are never moved. Meals/sleep/routine/wind-down (Tier 2)
// are movable ONLY by the minimum amount needed to clear a Tier-1 overlap —
// this is that minimal-nudge algorithm, applied uniformly to every bio
// element so none of them can silently double-book with an anchor.

interface HardZone { start: number; end: number; }

function mergeIntervals(sorted: HardZone[]): HardZone[] {
    const out: HardZone[] = [];
    for (const z of sorted) {
        const last = out[out.length - 1];
        if (last && z.start <= last.end) last.end = Math.max(last.end, z.end);
        else out.push({ ...z });
    }
    return out;
}

/**
 * Computes the smallest forward/backward shift of a bio block's template
 * [start, end) that clears all overlaps with a day's hard zones (anchors +
 * already-resolved earlier bio blocks that day), preserving the block's
 * original duration. Returns null if no placement fits anywhere within
 * [minBound, maxBound) — caller should skip the element for that day only.
 */
function resolveBioBlockOverlap(
    tmplStart: number,
    tmplEnd: number,
    hardZones: HardZone[],
    minBound: number,
    maxBound: number
): { start: number; end: number } | null {
    const duration = tmplEnd - tmplStart;
    const merged = mergeIntervals([...hardZones].sort((a, b) => a.start - b.start));

    const firstOverlap = (s: number): HardZone | null => {
        const e = s + duration;
        for (const z of merged) { if (s < z.end && e > z.start) return z; }
        return null;
    };

    const tryForward = (): number | null => {
        let s = tmplStart;
        let guard = 0;
        while (guard++ <= merged.length + 1) {
            if (s + duration > maxBound) return null;
            const z = firstOverlap(s);
            if (!z) return s;
            s = z.end;
        }
        return null;
    };

    const tryBackward = (): number | null => {
        let s = tmplStart;
        let guard = 0;
        while (guard++ <= merged.length + 1) {
            if (s < minBound) return null;
            const z = firstOverlap(s);
            if (!z) return s;
            const newS = z.start - duration;
            if (newS < minBound) return null;
            s = newS;
        }
        return null;
    };

    const z0 = firstOverlap(tmplStart);
    if (!z0) return { start: tmplStart, end: tmplEnd }; // no overlap at all

    // Pure trailing-edge overlap (zone starts inside the block, extends past
    // its end) prefers pulling the block earlier first; leading-edge and
    // full-span overlaps default to pushing the block later first.
    const isTrailingEdge = z0.start > tmplStart && z0.start < tmplEnd && z0.end >= tmplEnd;
    const order = isTrailingEdge ? [tryBackward, tryForward] : [tryForward, tryBackward];

    for (const attempt of order) {
        const s = attempt();
        if (s !== null) return { start: s, end: s + duration };
    }
    return null; // no room anywhere — skip this bio element for this day
}

/**
 * Computes energy affinity score for placing a goal in a given time window.
 * Matches goal energy_demand with phase allowed_energy to optimize placement.
 *
 * Returns multiplier 0.5x (poor fit) to 2.0x (excellent fit).
 * High-energy goals strongly prefer peak/rebound; low-energy prefer trough/wind_down.
 */
// (Energy-affinity scoring now lives in practical-constraints.ts as
// scoreWindowAffinity, alongside the hard energy-phase filter it complements
// — this file's own long-dead copy of the same logic has been removed.)

// ── Main Deterministic Generator ─────────────────────────────────

export async function generateWeekPlan(
    context: CalendarContext,
    weekStartDate: string,
    mode: 'balanced' | 'momentum' | 'recovery' = 'balanced',
    allowWeekend: boolean = true,
    protocolConfig?: ProtocolConfig,
    replanFromDate?: string
): Promise<WeekPlanVariant[]> {
    const windDown = calculateWindDown(context);
    const wakeMins = timeToMinutes(context.user.sleep_end || '07:00');
    const windDownMins = timeToMinutes(windDown);
    // We no longer manually constrain windows with wakeMins and windDownMins.
    // Instead, we just let Sleep and Wind Down blocks act as natural bounds.
    
    // 1. Build Base Bio Blocks
    const bioTemplates = [];
    const mealsPerDay = context.user.meals_per_day || 3;
    const mealWindows = context.user.meal_windows || {};
    
    const sleepStart = context.user.sleep_start || '23:00';
    const sleepEnd = context.user.sleep_end || '07:00';

    if (timeToMinutes(sleepStart) < timeToMinutes(sleepEnd)) {
        // Sleep happens entirely within the same calendar day (e.g., 01:00 to 08:00 or 00:00 to 08:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: sleepEnd });
        if (sleepStart === '00:00') {
            // Sleep starts at midnight — wind down occupies the tail end of the active calendar day
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
        } else if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        }
    } else {
        // Sleep crosses midnight (e.g., 23:00 to 07:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: '00:00', end: sleepEnd });
        if (timeToMinutes(sleepStart) < 1439) { // 1439 is 23:59
            bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: '23:59' });
        }
        if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        } else {
            // Wind down crosses midnight
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
            if (timeToMinutes(sleepStart) > 0) {
                bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: '00:00', end: sleepStart });
            }
        }
    }

    // Morning routine occupies wake → wake + routine mins; breakfast must never clash with it.
    // Built BEFORE the meal templates (and pushed into bioTemplates first) so the
    // Tier-2 resolver processes it first and Breakfast naturally lands after
    // wherever Morning Routine's REAL (possibly anchor-shifted) position ends up.
    const morningRoutineMins = (context.user as any).morning_routine_mins || 0;
    if (morningRoutineMins > 0) {
        const wakeTimeMins = timeToMinutes(context.user.sleep_end || '07:00');
        const morningRoutineEnd = wakeTimeMins + morningRoutineMins;
        bioTemplates.push({
            title: 'Morning Routine',
            block_type: 'routine',
            start: minutesToTime(wakeTimeMins),
            end: minutesToTime(morningRoutineEnd)
        });
    }

    if (mealsPerDay >= 1) {
        const wakeTime = context.user.sleep_end || '07:00';
        const effWakeMins = timeToMinutes(wakeTime) + morningRoutineMins;
        const windowStart = (mealWindows as any)?.breakfast?.start;
        // Prefer the user's onboarding breakfast time. If it falls during the
        // morning routine (or before wake), the routine wins and breakfast
        // follows immediately after it.
        const start = (windowStart && timeToMinutes(windowStart) >= effWakeMins)
            ? windowStart
            : minutesToTime(effWakeMins);
        bioTemplates.push({ title: 'Breakfast', block_type: 'meal', start, end: safeAddMins(start, 30) });
    }
    if (mealsPerDay >= 2) {
        const start = (mealWindows as any)?.lunch?.start || '12:30';
        bioTemplates.push({ title: 'Lunch', block_type: 'meal', start, end: safeAddMins(start, 45) });
    }
    if (mealsPerDay >= 3) {
        let start = (mealWindows as any)?.dinner?.start || '19:30';
        let end = safeAddMins(start, 45);
        // Ensure dinner ends before wind down starts to avoid clashing
        const wdMins = timeToMinutes(windDown);
        const endMins = timeToMinutes(end);
        if (wdMins > 720 && endMins > wdMins) {
            // Dinner overlaps with wind down, compress or shift back
            const startMins = timeToMinutes(start);
            if (wdMins - startMins >= 30) {
                end = minutesToTime(wdMins); // Compress to at least 30 mins
            } else {
                start = minutesToTime(wdMins - 45); // Shift back
                end = minutesToTime(wdMins);
            }
        }
        bioTemplates.push({ title: 'Dinner', block_type: 'meal', start, end });
    }

    const commitmentsByDay = new Map<number, Array<{ start: number; end: number; title: string, type: string }>>();
    for (let i = 1; i <= 7; i++) commitmentsByDay.set(i, []);

    // Load anchors into exclusion zones
    for (const cmt of context.commitments) {
        if (!cmt.is_active) continue;
        const days = ((cmt.days_of_week || []) as any[]).map(Number);
        for (let d of days) {
            if (d === 0) d = 7;
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(cmt.start_time) - 15, // 15m buffer before
                end: timeToMinutes(cmt.end_time) + 15,   // 15m buffer after
                title: cmt.title,
                type: 'anchor'
            });
        }
    }

    // NOTE: bio blocks (Sleep/Wind Down/Morning Routine/meals) are deliberately
    // NOT loaded into commitmentsByDay/baseExclusions here anymore. They are
    // resolved per-day against anchors inside generateVariant() (Tier-2 nudge
    // resolver) since their real position can shift; baseExclusions now holds
    // ONLY anchors and existing/fixed blocks (Tier 1 — truly immovable).

    // NEW: Load existing schedule blocks (fixed or done) into exclusion zones to prevent overwrites
    for (const block of context.schedule.this_week) {
        if (block.status === 'done' || block.is_fixed || block.commitment_id) {
            const date = parseISO(block.date);
            let d = date.getDay(); // 0=Sun
            if (d === 0) d = 7;
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(block.start_time),
                end: timeToMinutes(block.end_time),
                title: block.title,
                type: 'existing_block'
            });
        }
    }

    // Generate Variants: 2-option matrix per mode (6 total). Reduced from the
    // earlier 8-option matrix — fewer, more practically-trustworthy choices
    // rather than many numerically-differentiated ones. Index 0 of every
    // mode keeps its original label/identity since patch-service.ts's coach
    // replan path relies on variants[0].
    const variants: WeekPlanVariant[] = [];

    if (mode === 'balanced') {
        // BALANCED MODE: Consistency & Rhythm
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Standard Balanced', 'Evenly distributed tasks throughout the week to maintain consistent rhythm and ultradian rhythm.', 'Consistency builds momentum.', false, false, protocolConfig, undefined, replanFromDate));
        // Energy-Synced: energy-phase affinity is the PRIMARY window sort key
        // (not just a tiebreaker) — goals actively chase their chronotype-
        // matched peak/rebound window instead of following a flat time rule.
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'balanced', 'Energy-Synced', 'Tasks are matched to your personal energy phases (chronotype-aware) instead of a fixed time-of-day rule — demanding work lands when you are naturally sharpest.', 'Work with your energy, not against it.', false, false, protocolConfig, undefined, replanFromDate, true));
    } else if (mode === 'momentum') {
        // MOMENTUM MODE: Output Maximization
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Peak Hour Blitz', 'Zero buffers, hard goals clustered at chronotype peak (usually 9am-12pm). High intensity, high output.', 'Attack your peak energy.', false, false, protocolConfig, 'morning', replanFromDate));
        // NOTE: previously hardcoded `false` here, permanently locking this
        // variant out of weekends regardless of the user's real Weekend Work
        // setting or how much was left unfulfilled. `timeFocus:'weekday'`'s
        // day-sort is day-number-dominated (Mon tried before Sun in every
        // pass, including fully-relaxed ones), so "Fri-Sun lighter" still
        // emerges naturally as the first preference — weekends now remain
        // available as real overflow capacity instead of being categorically
        // excluded.
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'momentum', 'Weekday Sprint', 'Compress hard goals Mon-Thu with back-to-back blocks and minimal buffers; Fri-Sun are lighter unless needed to fully cover your goals.', 'Sprint mode: full throttle Mon-Thu.', false, false, protocolConfig, 'weekday', replanFromDate));
    } else if (mode === 'recovery') {
        // RECOVERY MODE: Sustainable Pace
        variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Spaced Mindfulness', '120-min gaps between sessions for mental reset and genuine recovery. Max 2 blocks/day.', 'Slow and steady wins.', false, false, protocolConfig, undefined, replanFromDate));
        if (allowWeekend) {
            variants.push(generateVariant(context, weekStartDate, allowWeekend, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Weekend Shift', 'Concentrate goals Fri-Sun to protect weekday lightness. 60-min buffers for gentle spacing.', 'Protect your weekdays.', false, false, protocolConfig, 'weekend', replanFromDate));
        } else {
            // Weekends are off entirely, so a weekend-shift identity makes no
            // sense — fall back to an afternoon-leaning, ultra-spaced variant
            // that still gives a genuinely different second choice.
            variants.push(generateVariant(context, weekStartDate, false, wakeMins, windDownMins, bioTemplates, commitmentsByDay, 'recovery', 'Gentle Afternoon', 'Ultra-light: 1-2 blocks/day max, afternoon preferred, generous spacing. Maximum whitespace.', 'Rest is productive.', true, false, protocolConfig, 'afternoon', replanFromDate));
        }
    }

    return variants;
}

function generateVariant(
    ctx: CalendarContext,
    weekStart: string,
    allowWeekend: boolean,
    wakeMins: number,
    windDownMins: number,
    bioTemplates: any[],
    baseExclusions: Map<number, Array<{ start: number; end: number; title: string, type: string }>>,
    strategyId: string,
    label: string,
    description: string,
    philosophy: string,
    forceLightWeekend: boolean = false,
    forceBonusFill: boolean = false,
    protocolConfig?: ProtocolConfig,
    timeFocus?: 'morning' | 'afternoon' | 'evening' | 'weekend' | 'weekday',
    replanFromDate?: string,
    energySyncPrimary: boolean = false
): WeekPlanVariant {
    const blocks: PlanBlock[] = [];
    const unscheduled_minutes: Record<string, number> = {};

    // Track workload per day to intelligently distribute goals
    const workloadPerDay = new Map<number, number>();
    for (let i = 1; i <= 7; i++) workloadPerDay.set(i, 0);
    // Global per-day goal-block count, shared across ALL goals and BOTH Pass 1
    // and the Cram Pass within this run — the mode's maxGoalBlocksPerDay cap
    // is a total-per-day ceiling, not per-goal or per-pillar.
    const goalBlockCountPerDay = new Map<number, number>();
    for (let i = 1; i <= 7; i++) goalBlockCountPerDay.set(i, 0);

    // 1. Materialize bio blocks per day (Tier 2), resolving each against that
    // day's Tier-1 anchors with the minimal-shift rule. Processed in
    // bioTemplates order, accumulating each RESOLVED position as a hard zone
    // for subsequent templates that day — this is why Sleep/Wind-Down/Morning
    // Routine are constructed before the meals in generateWeekPlan(): Breakfast
    // naturally lands after wherever Morning Routine's real (possibly
    // anchor-shifted) position ends up, instead of a hardcoded fallback.
    const resolvedBioByDay = new Map<number, Array<{ tmpl: any; start: number; end: number }>>();

    for (let day = 0; day < 7; day++) {
        const date = format(addDays(parseISO(weekStart), day), 'yyyy-MM-dd');
        const jsDay = parseISO(date).getDay();
        const dayNum = jsDay === 0 ? 7 : jsDay;
        const hardZoneSeed: HardZone[] = (baseExclusions.get(dayNum) || [])
            .filter(x => x.type === 'anchor' || x.type === 'existing_block')
            .map(x => ({ start: x.start, end: x.end }));

        const dayHardZones: HardZone[] = [...hardZoneSeed];
        const resolvedForDay: Array<{ tmpl: any; start: number; end: number }> = [];

        for (const tmpl of bioTemplates) {
            const tmplStart = timeToMinutes(tmpl.start);
            const tmplEnd = timeToMinutes(tmpl.end);
            // Sleep/Wind-Down midnight-wraparound pieces may touch 00:00/23:59;
            // daytime elements are bounded by the user's actual wake/wind-down.
            const isOvernightPiece = tmpl.block_type === 'sleep' || tmpl.block_type === 'wind_down';
            const minBound = isOvernightPiece ? 0 : wakeMins;
            const maxBound = isOvernightPiece ? 1439 : windDownMins;

            const resolved = resolveBioBlockOverlap(tmplStart, tmplEnd, dayHardZones, minBound, maxBound);
            if (!resolved) continue; // no room anywhere today — skip this element only

            resolvedForDay.push({ tmpl, start: resolved.start, end: resolved.end });
            const exclusionEnd = resolved.end + (tmpl.block_type === 'meal' ? 15 : 0);
            dayHardZones.push({ start: resolved.start, end: exclusionEnd });

            // Keep resolving/simulating bio blocks for every day of the week
            // (hard-zone tracking below depends on it) but only emit blocks
            // for days on/after replanFromDate — this is what lets an
            // initial onboarding generation start mid-week (e.g. Wed) and
            // stop at Sunday without also backfilling Sleep/meals/etc. onto
            // days that have already passed (Mon/Tue).
            if (!replanFromDate || date >= replanFromDate) {
                blocks.push({
                    date,
                    start_time: minutesToTime(resolved.start),
                    end_time: minutesToTime(resolved.end),
                    title: tmpl.title,
                    block_type: tmpl.block_type
                });
            }
        }
        resolvedBioByDay.set(dayNum, resolvedForDay);
    }

    // Deep copy exclusions so we can modify them per variant — Tier 1 only
    // (anchors + existing/fixed blocks) at this point.
    const exclusions = new Map<number, Array<{ start: number; end: number; title: string, type: string }>>();
    const weekendIntensity = forceLightWeekend ? 'light' : (ctx.user.weekend_intensity || 'normal');
    // Light weekend = hard 4PM (960 mins) cutoff on Sat/Sun
    const LIGHT_WEEKEND_CUTOFF = 960; // 16:00

    for (const [d, ex] of baseExclusions.entries()) {
        exclusions.set(d, ex.map(e => ({ ...e })));
    }
    // Add Tier-2 bio blocks from their REAL resolved positions (not stale
    // template positions) so goal placement sees exactly what's on the
    // rendered calendar.
    for (const [d, resolvedList] of resolvedBioByDay.entries()) {
        for (const { tmpl, start, end } of resolvedList) {
            exclusions.get(d)?.push({
                start,
                end: end + (tmpl.block_type === 'meal' ? 15 : 0),
                title: tmpl.title,
                type: tmpl.block_type
            });
        }
    }

    // Sort goals using a mathematical probability tree: Weekly Progress -> Importance -> Energy Demand -> Total Minutes
    let sortedGoals = [...ctx.goals].sort((a, b) => {
        // Priority 1: Weekly Progress (Behind schedule comes first)
        const aProgress = ctx.goalProgress?.find(p => p.goal_id === a.id);
        const bProgress = ctx.goalProgress?.find(p => p.goal_id === b.id);
        const aBehind = aProgress && aProgress.weekly_target_minutes > 0
            ? aProgress.completed_minutes_this_week / aProgress.weekly_target_minutes : 0;
        const bBehind = bProgress && bProgress.weekly_target_minutes > 0
            ? bProgress.completed_minutes_this_week / bProgress.weekly_target_minutes : 0;

        if (aBehind < 0.5 && bBehind >= 0.5) return -1;
        if (bBehind < 0.5 && aBehind >= 0.5) return 1;

        // Priority 2: Importance
        const aImportance = a.importance || 5;
        const bImportance = b.importance || 5;
        if (bImportance !== aImportance) return bImportance - aImportance;

        // Priority 3: Energy Demand (High energy first)
        const energyOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const aEnergy = energyOrder[(a.energy_demand || 'medium').toLowerCase()] || 2;
        const bEnergy = energyOrder[(b.energy_demand || 'medium').toLowerCase()] || 2;
        if (bEnergy !== aEnergy) return bEnergy - aEnergy;

        // Priority 4: Total Minutes
        const aTotal = (a.days_per_week || 5) * (a.minutes_per_day || 60);
        const bTotal = (b.days_per_week || 5) * (b.minutes_per_day || 60);
        return bTotal - aTotal;
    });

    // ENERGY-AWARE FILTERING: Adjust sorting based on user's current energy level
    // If user has low energy, deprioritize high-energy goals (move them down)
    const userEnergy = ctx.dailyEnergyState?.energy_level || 3;
    if (userEnergy < 3) {
        // Low energy: separate high/medium/low energy goals, prioritize low energy
        const lowEnergyGoals = sortedGoals.filter(g => (g.energy_demand || 'medium').toLowerCase() === 'low');
        const mediumEnergyGoals = sortedGoals.filter(g => (g.energy_demand || 'medium').toLowerCase() === 'medium');
        const highEnergyGoals = sortedGoals.filter(g => (g.energy_demand || 'medium').toLowerCase() === 'high');
        sortedGoals = [...lowEnergyGoals, ...mediumEnergyGoals, ...highEnergyGoals];
    } else if (userEnergy >= 4) {
        // High energy: high-energy goals stay prioritized (no reordering needed)
    }
    // else moderate energy (3): use default sort as-is

    // Light-load cap relaxation (#2/#3): sum each goal's remaining weekly
    // minutes using the SAME formula the main loop below uses per-goal, so
    // the light-load check reflects exactly what's about to be scheduled.
    let totalWeeklyMinsNeeded = 0;
    for (const g of sortedGoals) {
        const gProgress = ctx.goalProgress?.find(p => p.goal_id === g.id);
        let gRemaining = gProgress ? gProgress.remaining_minutes : (g.days_per_week || 5) * (g.minutes_per_day || 60);
        if (replanFromDate) {
            const gTargetMins = (g.days_per_week || 5) * (g.minutes_per_day || 60);
            const gMinsBeforeReplan = ctx.schedule.this_week
                .filter(b => b.goal_id === g.id && b.date < replanFromDate && b.status !== 'cancelled' && b.status !== 'missed')
                .reduce((sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
            gRemaining = Math.max(0, gTargetMins - gMinsBeforeReplan);
        }
        totalWeeklyMinsNeeded += Math.max(0, gRemaining);
    }
    const eligibleDayCount = allowWeekend ? 7 : 5;
    const effectiveCaps = computeEffectiveDailyCaps(totalWeeklyMinsNeeded, protocolConfig, eligibleDayCount);

    // Failure-mode-driven protective adjustments (applied as a floor in every
    // mode, tempered lighter for Momentum) — only meaningful when the daily
    // caps are actually active (light-load relaxation above already handles
    // "don't over-constrain a week with little to schedule").
    const failureAdjustments = getFailureModeAdjustments((ctx.user as any).failure_modes, strategyId);
    if (effectiveCaps.maxGoalBlocksPerDay !== undefined && failureAdjustments.blockCountDelta !== 0) {
        effectiveCaps.maxGoalBlocksPerDay = Math.max(1, effectiveCaps.maxGoalBlocksPerDay + failureAdjustments.blockCountDelta);
    }
    if (effectiveCaps.maxDeepWorkMins !== undefined && failureAdjustments.minsMultiplier !== 1) {
        effectiveCaps.maxDeepWorkMins = Math.max(30, Math.round(effectiveCaps.maxDeepWorkMins * failureAdjustments.minsMultiplier));
    }

    // Energy-phase model for this variant (ramp_up/peak/trough/rebound/wind_down)
    // — chronotype now flows from onboarding/Settings; defaults to 'bear' for
    // users who haven't set one, preserving today's behavior for them.
    const chronotype = (ctx.user as any).chronotype || 'bear';
    const phases: DayPhase[] = computeDayPhases(wakeMins, timeToMinutes(ctx.user.sleep_start || '23:00'), chronotype);
    // low_afternoon_energy fully protects the trough phase regardless of the
    // failure-mode temper factor (see practical-constraints.ts) — it's a
    // factual self-report about this specific user, not a generic caution.
    const effectivePhases: DayPhase[] = failureAdjustments.troughFullyProtected
        ? phases.map(p => p.name === 'trough' ? { ...p, allowed_energy: ['low'] as Array<'high' | 'medium' | 'low'> } : p)
        : phases;

    // Body-pillar goals share a single "1 body block per day" slot (avoids
    // stacking two tough physical sessions on the same day). With only one
    // body goal that's a non-issue, but with 2+, the week's eligible days
    // must be apportioned between them based on how much each ACTUALLY still
    // needs — not by goal identity/sort order, which used to let whichever
    // goal sorted first permanently lock a fixed day-lane regardless of
    // whether it still needed all of it, starving a hungrier goal even after
    // a mid-week replan shrank the first goal's remaining work.
    const bodyGoalDayQuota = new Map<string, Set<number>>();
    {
        const eligibleDays = allowWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
        const bodyGoals = sortedGoals
            .filter(g => g.pillar === 'body')
            .map(g => ({
                id: g.id,
                targetPerDay: Math.max(1, g.minutes_per_day || 60),
                remaining: computeRemainingWeeklyMins(g, ctx, replanFromDate),
            }));

        if (bodyGoals.length > 1) {
            const needs = bodyGoals.map(g => ({
                id: g.id,
                need: Math.min(eligibleDays.length, Math.ceil(g.remaining / g.targetPerDay)),
            }));
            const totalNeed = needs.reduce((s, n) => s + n.need, 0);

            if (totalNeed > eligibleDays.length) {
                // Genuine contention: no day-splitting scheme can give every
                // goal every day it wants, so apportion the week's slots
                // proportionally to need (capped per-goal at its own need),
                // then hand out days via greedy fair-queueing — repeatedly
                // give the next day to whichever under-quota goal has used
                // the smallest fraction of its quota so far. This spreads
                // each goal's days evenly through the week instead of
                // clumping them at the start or end.
                const quotas = largestRemainderApportion(needs, eligibleDays.length);
                const assigned = new Map<string, number>();
                for (const n of needs) { assigned.set(n.id, 0); bodyGoalDayQuota.set(n.id, new Set()); }
                for (const day of eligibleDays) {
                    let bestId: string | null = null;
                    let bestRatio = Infinity;
                    for (const n of needs) {
                        const quota = quotas.get(n.id) || 0;
                        const used = assigned.get(n.id)!;
                        if (used >= quota) continue;
                        const ratio = quota > 0 ? used / quota : Infinity;
                        if (ratio < bestRatio) { bestRatio = ratio; bestId = n.id; }
                    }
                    if (!bestId) continue; // every goal already at its quota
                    bodyGoalDayQuota.get(bestId)!.add(day);
                    assigned.set(bestId, assigned.get(bestId)! + 1);
                }
            }
            // else: totalNeed <= eligibleDays.length — no contention this
            // week, leave the map empty for these goals (unrestricted); each
            // goal's own remainingWeeklyMins stopping condition already caps
            // it at exactly what it needs, so no lane is required.
        }
    }

    for (const goal of sortedGoals) {
        // Progress-aware scheduling: how much is ACTUALLY left to do this
        // week, shared with the body-lane computation above so they can't
        // drift out of sync with each other.
        let remainingWeeklyMins = computeRemainingWeeklyMins(goal, ctx, replanFromDate);

        if (remainingWeeklyMins <= 0) continue; // Goal already reached for the week!

        const targetMinsPerDay = goal.minutes_per_day || 60;

        // Goal energy is already normalized to 'low'|'medium'|'high' at the
        // CalendarContext ingestion boundary (context-builder.ts).
        const goalEnergy = ((goal.energy_demand || 'medium').toLowerCase()) as 'low' | 'medium' | 'high';
        // A goal's own stated preferred time of day (from onboarding) is a
        // more specific, reliable signal than the variant's generic
        // mode-level timeFocus — it wins for time-of-day-WITHIN-day window
        // selection. The mode-level timeFocus still governs DAY selection
        // (preferredDays sort below is untouched).
        const goalTimeFocus = (goal.preferred_time_of_day && goal.preferred_time_of_day !== ('flexible' as any))
            ? goal.preferred_time_of_day
            : timeFocus;

        // Determine preferred days based on strategy
        let preferredDays = [1, 2, 3, 4, 5, 6, 7];
        if (!allowWeekend) preferredDays = [1, 2, 3, 4, 5];

        if (timeFocus === 'weekend') {
            preferredDays.sort((a, b) => {
                const aIsWeekend = a >= 6 ? 1 : 0;
                const bIsWeekend = b >= 6 ? 1 : 0;
                if (aIsWeekend !== bIsWeekend) return bIsWeekend - aIsWeekend; // Weekend first
                return (workloadPerDay.get(a) || 0) - (workloadPerDay.get(b) || 0);
            });
        } else if (timeFocus === 'weekday') {
            // Shared by Momentum's "Weekday Sprint" and Balanced's "Workday Focus":
            // both want a genuine Mon-Thu-heavy concentration, not just "not
            // weekend" — bucket Mon-Thu before Fri-Sun explicitly (mirroring
            // the 'weekend' branch above), THEN load-balance within each
            // bucket. A pure `day*1000 + load` weight (the old formula) lets
            // day-number dominate so completely that it converges on the
            // same order as a plain least-loaded-day sort once every day
            // ends up with blocks — collapsing this variant's identity into
            // Peak Hour Blitz's whenever the week fills up. The explicit
            // bucket keeps Mon-Thu genuinely preferred while still allowing
            // Fri-Sun as real overflow capacity once Mon-Thu is exhausted.
            preferredDays.sort((a, b) => {
                const aIsCore = a <= 4 ? 0 : 1;
                const bIsCore = b <= 4 ? 0 : 1;
                if (aIsCore !== bIsCore) return aIsCore - bIsCore;
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return a - b;
            });
        } else if (strategyId === 'momentum') {
            // Peak Hour Blitz (timeFocus='morning'): no day-of-week concentration
            // intent of its own — just fill the lightest day first. Its actual
            // differentiation is window-level (morning-anchored placement).
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                return a - b;
            });
        } else if (strategyId === 'recovery') {
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                // Quiet Recovery (forceLightWeekend) sweeps end-of-week-first;
                // Spaced Mindfulness sweeps start-of-week-first.
                return forceLightWeekend ? b - a : a - b;
            });
        } else if (strategyId === 'balanced') {
            preferredDays.sort((a, b) => {
                const loadA = workloadPerDay.get(a) || 0;
                const loadB = workloadPerDay.get(b) || 0;
                if (loadA !== loadB) return loadA - loadB;
                // Reverse the tie-breaker for the secondary "afternoon" option to guarantee a different plan
                return timeFocus === 'afternoon' ? b - a : a - b;
            });
        }

        const allDays = [1, 2, 3, 4, 5, 6, 7];
        const MAX_PASS = 5;

        for (let pass = 0; pass <= MAX_PASS; pass++) {
            if (remainingWeeklyMins <= 0) break;

            const isRelaxedEnergy = pass >= 2;
            const isRelaxedSession = pass >= 3;
            const isRelaxedBuffer = pass >= 4;
            const isRelaxedDayCaps = pass >= 5;

            const daysToTry = pass === 0 ? preferredDays : allDays;

            for (const isoDay of daysToTry) {
                if (remainingWeeklyMins <= 0) break;

                const isWeekend = isoDay >= 6;
                // Always respect allowWeekend! (Even in allDays passes)
                if (!allowWeekend && isWeekend) continue;

                const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
                if (replanFromDate && dateStr < replanFromDate) continue;

                const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
                const scheduledToday = blocksThisDayForGoal.reduce((sum, b) => sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);

                // Body goals: no more than 1 block per day for this goal, AND max 1 body block globally across all goals
                if (goal.pillar === 'body') {
                    if (blocksThisDayForGoal.length > 0) continue;
                    const otherBodyBlocks = blocks.filter(b => b.date === dateStr && b.pillar === 'body' && b.goal_id !== goal.id);
                    if (otherBodyBlocks.length > 0) continue;
                    // With 2+ competing body goals, "1 body block per day globally"
                    // means whichever goal sorts first can claim every day of the
                    // week before a second body goal ever gets a turn — total,
                    // permanent starvation, not just same-day avoidance. Give each
                    // body goal its own round-robin lane of days in the early
                    // (strict) passes; later passes fall back to whatever's left.
                    const bodyLane = bodyGoalDayQuota.get(goal.id);
                    if (bodyLane && !bodyLane.has(isoDay)) continue;
                } else {
                    // Mind/craft goals:
                    // Only restrict max 2 blocks per day in Pass 0 (Strict) to preserve strategy
                    if (pass === 0 && blocksThisDayForGoal.length >= 2) continue;
                }

                const remainingMinsForDayCap = Math.max(0, targetMinsPerDay - scheduledToday);
                if (remainingMinsForDayCap <= 0) continue; // Reached daily cap

                let remainingToPlace = Math.min(remainingMinsForDayCap, remainingWeeklyMins);
                // Splinter prevention...
                if (remainingWeeklyMins - remainingToPlace > 0 && remainingWeeklyMins - remainingToPlace < 30) {
                    remainingToPlace = Math.ceil((remainingWeeklyMins / 2) / 15) * 15;
                }

                // Apply day caps UNLESS relaxed
                const dayCap = getDayCapacity(isoDay, goalBlockCountPerDay, workloadPerDay, effectiveCaps);
                if (!isRelaxedDayCaps) {
                    if (!dayCap.hasBlockRoom || dayCap.minutesHeadroom <= 0) continue;
                    remainingToPlace = Math.min(remainingToPlace, dayCap.minutesHeadroom);
                }

                // The 30-min anti-fragmentation floor must not exceed the goal's
                // OWN daily target — a 15min/day meditation goal is never going
                // to clear a hardcoded 30min bar and would be permanently
                // unplaceable otherwise.
                const minBlockFloor = Math.min(30, targetMinsPerDay);
                if (remainingToPlace < minBlockFloor && goal.pillar !== 'body') continue;
                if (goal.pillar === 'body' && !isRelaxedDayCaps && dayCap.minutesHeadroom < remainingToPlace) continue;

                // Build exclusions and wind down...
                const dayWindDown = (isWeekend && weekendIntensity === 'light')
                    ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
                    : windDownMins;

                const preWindDownGapMins = (goalEnergy === 'low' || isRelaxedBuffer) ? 0
                    : (strategyId === 'recovery' ? 30 : 20) + failureAdjustments.preWindDownGapBonus;
                
                const effectiveDayWindDown = Math.max(wakeMins, dayWindDown - preWindDownGapMins);
                const dayExclusions = exclusions.get(isoDay)!;
                dayExclusions.sort((a, b) => a.start - b.start);

                let windows: Array<{ start: number; end: number }> = [];
                let cursor = wakeMins;

                for (const ex of dayExclusions) {
                    let exEnd = ex.end;
                    if (ex.type === 'meal' && (goal.pillar === 'body' || goalEnergy === 'high')) {
                        exEnd += 45;
                    }
                    if (cursor < ex.start) {
                        windows.push({ start: cursor, end: ex.start });
                    }
                    cursor = Math.max(cursor, exEnd);
                }
                if (cursor < effectiveDayWindDown) {
                    windows.push({ start: cursor, end: effectiveDayWindDown });
                }

                // Body spacing (afternoon for recovery) - ONLY in PASS 0!
                if (goal.pillar === 'body' && pass === 0) {
                    if (strategyId === 'recovery') {
                        windows = windows.filter(w => w.start >= 720 && w.end > 720); // Afternoon only
                    }
                }

                windows = windows.filter(w => w.end > w.start);
                
                // Energy filtering
                if (!isRelaxedEnergy) {
                    windows = filterWindowsByEnergyCompat(windows, effectivePhases, goalEnergy);
                }
                
                windows = sortWindowsByPreference(windows, { timeFocus: goalTimeFocus, pillar: goal.pillar, strategyId, goalImportance: goal.importance, energyPrimary: energySyncPrimary ? { goalEnergy: goalEnergy, phases: effectivePhases } : undefined });

                // Placement loop (body vs mind/craft)
                if (goal.pillar === 'body') {
                    const fitWindows = windows.filter(w => (w.end - w.start) >= remainingToPlace);
                    if (fitWindows.length > 0) {
                        const win = fitWindows[0];
                        let buffer = protocolConfig?.bufferMinutes ?? getBufferMinutes(strategyId, goalTimeFocus, (ctx.user as any).default_buffer_duration);
                        if (isRelaxedBuffer) {
                            buffer = Math.min(buffer, (ctx.user as any).default_buffer_duration || 15);
                            // skip failure mode bonus
                        } else {
                            buffer = resolveAdjacencyBuffer(
                                strategyId, buffer,
                                findPrevAdjacentBlock(dateStr, win.start, blocks, dayExclusions),
                                goalEnergy, goal.pillar
                            ) + failureAdjustments.bufferFloorBonus;
                        }
                        
                        let start = computeWindowAnchorStart(win.start, win.end, remainingToPlace, buffer, strategyId, goalTimeFocus);
                        // Small inset if the window is significantly larger than the block and we're packed at the edge
                        if (start === win.start && (win.end - win.start) > remainingToPlace + 30) {
                            start += 15;
                        }
                        start = snapStartToGrid(start, win.start, win.end, remainingToPlace);

                        if ((win.end - start) < remainingToPlace + buffer) {
                            buffer = Math.max(0, (win.end - start) - remainingToPlace);
                        }
                        
                        blocks.push({
                            date: dateStr,
                            start_time: minutesToTime(start),
                            end_time: minutesToTime(start + remainingToPlace),
                            title: goal.title,
                            block_type: 'goal',
                            goal_id: goal.id,
                            pillar: goal.pillar,
                            energy_demand: goalEnergy,
                            checklist: goal.ai_strategy?.checklist || [{ text: 'Warm up' }, { text: 'Main session' }, { text: 'Cool down' }]
                        });
                        dayExclusions.push({
                            start,
                            end: start + remainingToPlace + buffer,
                            title: goal.title,
                            type: 'goal'
                        });
                        recordGoalBlockPlacement(isoDay, remainingToPlace, goalBlockCountPerDay, workloadPerDay);
                        remainingWeeklyMins -= remainingToPlace;
                    }
                    continue; // Skip the rest of the window loop for body
                }

                // Non-body goals
                for (const win of windows) {
                    if (remainingToPlace <= 0) break;
                    let winStart = win.start;
                    let winEnd = win.end;
                    let availableInWin = winEnd - winStart;

                    while (remainingToPlace > 0 && availableInWin >= minBlockFloor) {
                        const dayCapNow = getDayCapacity(isoDay, goalBlockCountPerDay, workloadPerDay, effectiveCaps);
                        if (!isRelaxedDayCaps) {
                            if (!dayCapNow.hasBlockRoom || dayCapNow.minutesHeadroom <= 0) break;
                        }

                        const sessionState = getDaySessionState(dateStr, blocks, winStart);
                        let sessionMaxBlockMins = Math.min(90, failureAdjustments.maxSessionBlockMins);
                        let sessionRoomLeft = computeSessionRoomLeft(sessionState, sessionMaxBlockMins);
                        let breakShortfall = requiresSessionBreakGap(sessionState, winStart, failureAdjustments.sessionBreakAfterCount);
                        
                        if (isRelaxedSession) {
                            sessionMaxBlockMins = 120;
                            sessionRoomLeft = 120; // Ignore room left limitation
                            breakShortfall = 0; // Waive required break gaps
                        }

                        if (breakShortfall > 0) break;
                        if (!isRelaxedSession && sessionRoomLeft <= 0) break;

                        const MAX_BLOCK = isRelaxedSession ? 120 : Math.min(120, sessionMaxBlockMins);
                        const MIN_BLOCK = 30;
                        let minsToPlace = remainingToPlace;
                        
                        if (!isRelaxedDayCaps) {
                            minsToPlace = Math.min(minsToPlace, dayCapNow.minutesHeadroom);
                        }
                        minsToPlace = Math.min(minsToPlace, availableInWin);
                        if (!isRelaxedSession) {
                            minsToPlace = Math.min(minsToPlace, sessionRoomLeft);
                        }

                        if (remainingToPlace > Math.min(availableInWin, MAX_BLOCK)) {
                            let maxAllowedChunk = Math.min(availableInWin, MAX_BLOCK);
                            if (!isRelaxedSession) {
                                maxAllowedChunk = Math.min(maxAllowedChunk, sessionRoomLeft);
                            }
                            if (maxAllowedChunk < MIN_BLOCK) break;

                            let numSplits = Math.ceil(remainingToPlace / maxAllowedChunk);
                            let bestSplitSize = Math.floor(remainingToPlace / numSplits);

                            while (numSplits > 1 && bestSplitSize < MIN_BLOCK) {
                                numSplits--;
                                bestSplitSize = Math.floor(remainingToPlace / numSplits);
                            }

                            if (bestSplitSize <= availableInWin && bestSplitSize <= MAX_BLOCK) {
                                minsToPlace = bestSplitSize;
                                if (!isRelaxedDayCaps) minsToPlace = Math.min(minsToPlace, dayCapNow.minutesHeadroom);
                                if (!isRelaxedSession) minsToPlace = Math.min(minsToPlace, sessionRoomLeft);
                            } else {
                                minsToPlace = Math.min(MAX_BLOCK, availableInWin);
                                if (!isRelaxedDayCaps) minsToPlace = Math.min(minsToPlace, dayCapNow.minutesHeadroom);
                                if (!isRelaxedSession) minsToPlace = Math.min(minsToPlace, sessionRoomLeft);
                                
                                if (remainingToPlace - minsToPlace > 0 && remainingToPlace - minsToPlace < MIN_BLOCK) {
                                    minsToPlace = remainingToPlace - MIN_BLOCK;
                                    if (minsToPlace < MIN_BLOCK) break;
                                }
                            }
                        }

                        if (minsToPlace < minBlockFloor) break;

                        let buffer = protocolConfig?.bufferMinutes ?? getBufferMinutes(strategyId, goalTimeFocus, (ctx.user as any).default_buffer_duration);
                        if (isRelaxedBuffer) {
                            buffer = Math.min(buffer, (ctx.user as any).default_buffer_duration || 15);
                            // in relaxation, just keep the minimum buffer, e.g. user default or 15, ignoring adjacency floor
                        } else {
                            buffer = resolveAdjacencyBuffer(
                                strategyId, buffer,
                                findPrevAdjacentBlock(dateStr, winStart, blocks, dayExclusions),
                                goalEnergy, goal.pillar
                            ) + failureAdjustments.bufferFloorBonus;
                        }
                        
                        if (isRelaxedSession) {
                            // "keep a 5-15 min micro-gap between consecutive chunks" - let's ensure buffer is at least 5
                            buffer = Math.max(5, buffer);
                        }

                        let start = computeWindowAnchorStart(winStart, win.end, minsToPlace, buffer, strategyId, goalTimeFocus);
                        start = snapStartToGrid(start, winStart, win.end, minsToPlace);

                        if ((win.end - start) < minsToPlace + buffer) {
                            buffer = Math.max(0, (win.end - start) - minsToPlace);
                        }

                        blocks.push({
                            date: dateStr,
                            start_time: minutesToTime(start),
                            end_time: minutesToTime(start + minsToPlace),
                            title: minsToPlace < targetMinsPerDay ? `${goal.title} (Part)` : goal.title,
                            block_type: 'goal',
                            goal_id: goal.id,
                            pillar: goal.pillar,
                            energy_demand: goalEnergy,
                            checklist: goal.ai_strategy?.checklist || [{text: "Focus session"}, {text: "Review progress"}]
                        });

                        dayExclusions.push({
                            start: start,
                            end: start + minsToPlace + buffer,
                            title: goal.title,
                            type: 'goal'
                        });

                        recordGoalBlockPlacement(isoDay, minsToPlace, goalBlockCountPerDay, workloadPerDay);

                        remainingToPlace -= minsToPlace;
                        remainingWeeklyMins -= minsToPlace;

                        // Advance the cursor from the block's ACTUAL placed
                        // position, not the pre-centering winStart. Centering
                        // (computeWindowAnchorStart's default branch) can
                        // return a start well past winStart — advancing from
                        // winStart instead of start left this loop's
                        // "free space begins here" bookkeeping desynced from
                        // the dayExclusions entry just pushed above, so the
                        // NEXT same-goal same-day session's search could
                        // start before this one's real end, landing inside
                        // its own already-recorded exclusion (the same-day
                        // "(Part)" overlap).
                        const consumed = (start - winStart) + minsToPlace + buffer;
                        winStart += consumed;
                        availableInWin -= consumed;
                    }
                }
            }
        }

        if (remainingWeeklyMins > 0) {
            unscheduled_minutes[goal.title] = remainingWeeklyMins;
        }
    }

    // Phase 2: Bounded, capacity-aware top-up pass.
    //
    // A prior "Bonus Fill" pass here was removed for repeatedly over-cramming
    // already-satisfied goals (5-6 blocks/day for a goal that wanted 1). This
    // replacement is deliberately narrow, with each guard answering directly
    // why that one was reverted:
    //  - only iterates goals still present in `unscheduled_minutes` with a
    //    real shortfall — a goal the main loop fully placed is never touched;
    //  - capped at exactly that goal's own remaining shortfall, never a
    //    separate bonus budget;
    //  - only runs when the week is confirmed NOT overcommitted
    //    (`ctx.capacity.is_overcommitted === false`) and the total shortfall
    //    clears a minimum threshold — skipped entirely for rounding noise or
    //    a genuinely tight week;
    //  - single goal-minor sweep (day-outer, under-filled-goal-inner) rather
    //    than the main loop's goal-major structure, so one goal can't
    //    monopolize the sweep before others get a turn — and single-chunk
    //    placement only (no splinter/session-pacing logic), since this is a
    //    small residual mop-up, not a second full placement engine.
    // Body-pillar goals still respect the "1 block/day globally" fatigue
    // rule and their day-lane from the apportionment above — this pass finds
    // genuinely idle capacity elsewhere in the week, it does not relax
    // practical constraints to manufacture room that isn't really there.
    if (ctx.capacity.is_overcommitted === false) {
        const shortfallGoals = sortedGoals.filter(g => (unscheduled_minutes[g.title] || 0) > 0);
        const totalShortfall = shortfallGoals.reduce((s, g) => s + (unscheduled_minutes[g.title] || 0), 0);
        const topUpThreshold = Math.max(15, totalWeeklyMinsNeeded * 0.02);

        if (totalShortfall >= topUpThreshold) {
            const topUpDays = [1, 2, 3, 4, 5, 6, 7];
            for (const isoDay of topUpDays) {
                const isWeekend = isoDay >= 6;
                if (!allowWeekend && isWeekend) continue;
                const dateStr = format(addDays(parseISO(weekStart), isoDay - 1), 'yyyy-MM-dd');
                if (replanFromDate && dateStr < replanFromDate) continue;

                for (const goal of shortfallGoals) {
                    const remaining = unscheduled_minutes[goal.title] || 0;
                    if (remaining <= 0) continue;

                    const goalEnergy = ((goal.energy_demand || 'medium').toLowerCase()) as 'low' | 'medium' | 'high';
                    const targetMinsPerDay = goal.minutes_per_day || 60;
                    const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);

                    if (goal.pillar === 'body') {
                        if (blocksThisDayForGoal.length > 0) continue;
                        const otherBodyBlocks = blocks.filter(b => b.date === dateStr && b.pillar === 'body' && b.goal_id !== goal.id);
                        if (otherBodyBlocks.length > 0) continue;
                        const bodyLane = bodyGoalDayQuota.get(goal.id);
                        if (bodyLane && !bodyLane.has(isoDay)) continue;
                    } else if (blocksThisDayForGoal.length >= 2) {
                        continue; // don't cram a 3rd+ block for the same goal on the same day even in top-up
                    }

                    const scheduledToday = blocksThisDayForGoal.reduce((s, b) => s + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0);
                    const remainingMinsForDayCap = Math.max(0, targetMinsPerDay - scheduledToday);
                    if (remainingMinsForDayCap <= 0) continue;
                    const toPlace = Math.min(remaining, remainingMinsForDayCap);
                    const minBlockFloor = Math.min(30, targetMinsPerDay);
                    // Below the anti-fragmentation floor: a handful of scattered
                    // <30min slivers across the week isn't worth creating even
                    // as a last-resort top-up — same floor concept as the main
                    // loop's, deliberately NOT relaxed here.
                    if (toPlace < minBlockFloor && goal.pillar !== 'body') continue;

                    const dayWindDown = (isWeekend && weekendIntensity === 'light')
                        ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
                        : windDownMins;
                    const effectiveDayWindDown = Math.max(wakeMins, dayWindDown - (goalEnergy === 'low' ? 0 : 15));
                    const dayExclusions = exclusions.get(isoDay)!;
                    dayExclusions.sort((a, b) => a.start - b.start);

                    let windows: Array<{ start: number; end: number }> = [];
                    let cursor = wakeMins;
                    for (const ex of dayExclusions) {
                        let exEnd = ex.end;
                        if (ex.type === 'meal' && (goal.pillar === 'body' || goalEnergy === 'high')) exEnd += 45;
                        if (cursor < ex.start) windows.push({ start: cursor, end: ex.start });
                        cursor = Math.max(cursor, exEnd);
                    }
                    if (cursor < effectiveDayWindDown) windows.push({ start: cursor, end: effectiveDayWindDown });
                    windows = windows.filter(w => w.end > w.start);

                    // Single-chunk only: place as much of `toPlace` as fits in the
                    // single largest window — never split across multiple windows
                    // in the same day, that's the main loop's job, not this pass's.
                    const goalTimeFocus = (goal.preferred_time_of_day && goal.preferred_time_of_day !== ('flexible' as any))
                        ? goal.preferred_time_of_day
                        : timeFocus;
                    const buffer = getBufferMinutes(strategyId, goalTimeFocus, (ctx.user as any).default_buffer_duration);
                    let bestWindow: { start: number; end: number } | null = null;
                    for (const w of windows) {
                        const avail = w.end - w.start;
                        if (avail < minBlockFloor + buffer) continue;
                        if (!bestWindow || avail > (bestWindow.end - bestWindow.start)) bestWindow = w;
                    }
                    if (!bestWindow) continue;

                    const placedMins = Math.min(toPlace, (bestWindow.end - bestWindow.start) - buffer);
                    if (placedMins <= 0 || (placedMins < minBlockFloor && goal.pillar !== 'body')) continue;

                    const start = bestWindow.start;
                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + placedMins),
                        title: goal.title,
                        block_type: 'goal',
                        goal_id: goal.id,
                        pillar: goal.pillar,
                        energy_demand: goalEnergy,
                        checklist: goal.ai_strategy?.checklist || [{ text: 'Focus session' }, { text: 'Review progress' }],
                    });
                    dayExclusions.push({ start, end: start + placedMins + buffer, title: goal.title, type: 'goal' });
                    recordGoalBlockPlacement(isoDay, placedMins, goalBlockCountPerDay, workloadPerDay);

                    const newRemaining = Math.max(0, remaining - placedMins);
                    if (newRemaining <= 0) delete unscheduled_minutes[goal.title];
                    else unscheduled_minutes[goal.title] = newRemaining;
                }
            }
        }
    }

    const finalBlocks = blocks;

    const totalMins = finalBlocks.reduce((sum, b) => {
        if (b.block_type === 'sleep' || b.block_type === 'meal') return sum;
        return sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0);

    const uniqueDays = new Set(finalBlocks.filter(b => b.block_type === 'goal').map(b => b.date));

    return {
        id: `${strategyId}-${slugify(label)}`,
        label,
        description,
        philosophy,
        blocks: finalBlocks,
        stats: {
            total_blocks: finalBlocks.length,
            total_hours: Math.round(totalMins / 60 * 10) / 10,
            days_with_work: uniqueDays.size,
            unscheduled_minutes,
        }
    };
}
