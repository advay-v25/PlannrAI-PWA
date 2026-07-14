/**
 * 🧭 PLANNRAI — PRACTICAL SCHEDULING CONSTRAINTS
 *
 * Real-world placement rules for the Tier-3 (goal block) layer of the
 * deterministic week generator (`plan-week.ts`). Encodes things a purely
 * mathematical bin-packer would never know: don't put two tough tasks back
 * to back, don't schedule intense work right before bed, respect the day's
 * energy arc, and give a real break after a couple of deep-work sessions.
 *
 * Reuses the phase model from `flow-protocol.ts` (already correct, but
 * previously only consumed by the separate LLM single-day generator) —
 * imports only the pure phase-computation pieces, not anything tied to that
 * other pipeline.
 */

import { computeDayPhases, type DayPhase } from '@/lib/calendar/flow-protocol';

export { computeDayPhases };
export type { DayPhase };

type EnergyLevel = 'low' | 'medium' | 'high';
type Strategy = 'momentum' | 'balanced' | 'recovery';

function timeToMinutesLocal(t: string): number {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// ── Phase-Aware Window Filtering ──────────────────────────────────

/**
 * Splits a window into phase-aligned pieces. Pieces with no covering phase
 * (a gap in the phase model, e.g. right at the boundary of a non-default
 * wind-down setting) are marked `phase: null` and treated as compatible by
 * `filterWindowsByEnergyCompat` — fail-open, so imperfect phase-boundary
 * math never silently eats real scheduling capacity.
 */
export function splitWindowByPhases(
    window: { start: number; end: number },
    phases: DayPhase[]
): Array<{ start: number; end: number; phase: DayPhase | null }> {
    const sortedPhases = [...phases].sort((a, b) => a.start_minutes - b.start_minutes);
    const pieces: Array<{ start: number; end: number; phase: DayPhase | null }> = [];
    let cursor = window.start;

    for (const phase of sortedPhases) {
        if (phase.end_minutes <= cursor || phase.start_minutes >= window.end) continue;
        const segStart = Math.max(cursor, phase.start_minutes);
        const segEnd = Math.min(window.end, phase.end_minutes);
        if (segStart > cursor) {
            pieces.push({ start: cursor, end: segStart, phase: null });
        }
        if (segEnd > segStart) {
            pieces.push({ start: segStart, end: segEnd, phase });
        }
        cursor = Math.max(cursor, segEnd);
    }
    if (cursor < window.end) {
        pieces.push({ start: cursor, end: window.end, phase: null });
    }
    return pieces.filter(p => p.end > p.start);
}

/**
 * Hard filter: a goal's energy demand must be compatible with the phase(s)
 * covering a candidate window. High-energy goals become restricted to
 * peak/rebound; wind_down becomes unavailable to medium/high energy.
 */
export function filterWindowsByEnergyCompat(
    windows: Array<{ start: number; end: number }>,
    phases: DayPhase[],
    goalEnergy: EnergyLevel
): Array<{ start: number; end: number }> {
    if (!phases || phases.length === 0) return windows; // no phase data — don't filter
    const result: Array<{ start: number; end: number }> = [];
    for (const w of windows) {
        for (const piece of splitWindowByPhases(w, phases)) {
            if (!piece.phase || piece.phase.allowed_energy.includes(goalEnergy)) {
                result.push({ start: piece.start, end: piece.end });
            }
        }
    }
    return result;
}

/**
 * Soft signal: how well a candidate window's phase matches a goal's energy
 * demand. 0.5x (poor fit, only reachable if a caller bypasses the hard
 * filter above) to 2.0x (ideal fit). Use as a tiebreaker on top of the hard
 * filter, not a replacement for it.
 */
export function scoreWindowAffinity(
    windowStartMins: number,
    goalEnergy: EnergyLevel,
    phases: DayPhase[]
): number {
    const phase = phases.find(p => windowStartMins >= p.start_minutes && windowStartMins < p.end_minutes);
    if (!phase) return 1.0;

    if (!phase.allowed_energy.includes(goalEnergy)) return 0.5;
    if (goalEnergy === 'high' && (phase.name === 'peak' || phase.name === 'rebound')) return 2.0;
    if (goalEnergy === 'low' && (phase.name === 'trough' || phase.name === 'wind_down')) return 2.0;
    return 1.0;
}

// ── Ultradian Session Pacing ───────────────────────────────────────

export interface SessionState {
    /** Completed sessions today, NOT counting one `candidateStart` might extend. */
    sessionCount: number;
    lastSessionEnd: number | null;
    /** Minutes already accumulated in the session `candidateStart` would extend (0 if starting fresh). */
    currentSessionMinutes: number;
}

interface MinimalBlock { date: string; start_time: string; end_time: string; block_type: string; }

/**
 * Reconstructs today's deep-work session shape from already-placed blocks.
 * Contiguous goal blocks (≥45min each, <15min gap between them) merge into
 * one session — mirrors flow-protocol.ts's own session-merging logic,
 * re-implemented as a placement-time gate instead of a post-hoc validator.
 */
export function getDaySessionState(
    dateStr: string,
    blocks: MinimalBlock[],
    candidateStart: number
): SessionState {
    const dayDeepBlocks = blocks
        .filter(b => b.date === dateStr && b.block_type === 'goal')
        .map(b => ({ start: timeToMinutesLocal(b.start_time), end: timeToMinutesLocal(b.end_time) }))
        .filter(b => (b.end - b.start) >= 45)
        .sort((a, b) => a.start - b.start);

    const sessions: Array<{ start: number; end: number }> = [];
    for (const b of dayDeepBlocks) {
        const last = sessions[sessions.length - 1];
        if (last && b.start - last.end < 15) {
            last.end = Math.max(last.end, b.end);
        } else {
            sessions.push({ start: b.start, end: b.end });
        }
    }

    const last = sessions[sessions.length - 1];
    const extendsLast = !!last && candidateStart >= last.end && (candidateStart - last.end) < 15;
    const priorSessions = extendsLast ? sessions.slice(0, -1) : sessions;

    return {
        sessionCount: priorSessions.length,
        lastSessionEnd: priorSessions.length > 0 ? priorSessions[priorSessions.length - 1].end : null,
        currentSessionMinutes: extendsLast ? (last!.end - last!.start) : 0,
    };
}

/** Minutes of room left in the session `candidateStart` would extend, capped at `maxSessionMinutes` (default 90). */
export function computeSessionRoomLeft(sessionState: SessionState, maxSessionMinutes: number = 90): number {
    return Math.max(0, maxSessionMinutes - sessionState.currentSessionMinutes);
}

/** Extra gap (minutes) required before `candidateStart` can start a 3rd+ same-day session; 0 if none needed. */
export function requiresSessionBreakGap(
    sessionState: SessionState,
    candidateStart: number,
    breakAfterCount: number = 2,
    requiredGapMins: number = 30
): number {
    if (sessionState.sessionCount >= breakAfterCount && sessionState.lastSessionEnd !== null) {
        const gap = candidateStart - sessionState.lastSessionEnd;
        if (gap < requiredGapMins) return requiredGapMins - gap;
    }
    return 0;
}

// ── Cross-Goal / Cross-Pillar Adjacency Floor ──────────────────────

interface PrevBlockInfo {
    pillar?: string;
    energy_demand?: string;
    block_type: string; // 'anchor' | 'goal' | ...
}

/**
 * Wraps an already-resolved baseline buffer (from getBufferMinutes) with a
 * practical floor: two high-energy-demand blocks never land too close
 * together, regardless of mode. Momentum keeps its near-zero stylistic
 * buffer EXCEPT for this specific risky adjacency; Balanced/Recovery use a
 * fuller relationship-based floor (same-pillar / different-pillar /
 * after-anchor), sourced from flow-protocol.ts's own stated transition-cost
 * intent (5-10min same-pillar, 15min different-pillar, 20min after-anchor).
 */
export function resolveAdjacencyBuffer(
    strategyId: string,
    baseBuffer: number,
    prevBlock: PrevBlockInfo | null,
    nextGoalEnergy: EnergyLevel,
    nextGoalPillar: string
): number {
    if (!prevBlock) return baseBuffer;

    const prevEnergy = (prevBlock.energy_demand || 'medium') as EnergyLevel;
    const bothHighEnergy = prevEnergy === 'high' && nextGoalEnergy === 'high';

    if (strategyId === 'momentum') {
        // Momentum stays near-zero UNLESS the adjacency is specifically risky.
        return bothHighEnergy ? Math.max(baseBuffer, 15) : baseBuffer;
    }

    let floor = 5; // same-pillar baseline
    if (prevBlock.block_type === 'anchor') floor = 20;
    else if (prevBlock.pillar && prevBlock.pillar !== nextGoalPillar) floor = 15;

    if (bothHighEnergy) {
        const riskyFloor = prevBlock.block_type === 'anchor' ? 25
            : (prevBlock.pillar !== nextGoalPillar ? 20 : 10);
        floor = Math.max(floor, riskyFloor);
    }

    return Math.max(baseBuffer, floor);
}

// ── Failure-Mode-Driven Adjustments ────────────────────────────────

export interface FailureModeAdjustments {
    /** Added to maxGoalBlocksPerDay (negative = fewer blocks allowed). */
    blockCountDelta: number;
    /** Multiplies maxDeepWorkMins. */
    minsMultiplier: number;
    /** Extra minutes added on top of resolveAdjacencyBuffer's result. */
    bufferFloorBonus: number;
    /** If true, trough phase allows 'low' energy only (hard 0 for medium/high), not just discouraged. */
    troughFullyProtected: boolean;
    /** If true, high-importance goals are steered toward the peak phase first. */
    forceHighImportanceToPeak: boolean;
    /** Extra minutes added to the pre-wind-down decompression gap. */
    preWindDownGapBonus: number;
    /** Overrides the 90-min default single-session cap when lower. */
    maxSessionBlockMins: number;
    /** Overrides the "break required after N sessions" threshold (default 2) when lower. */
    sessionBreakAfterCount: number;
}

const DEFAULT_ADJUSTMENTS: FailureModeAdjustments = {
    blockCountDelta: 0,
    minsMultiplier: 1,
    bufferFloorBonus: 0,
    troughFullyProtected: false,
    forceHighImportanceToPeak: false,
    preWindDownGapBonus: 0,
    maxSessionBlockMins: 90,
    sessionBreakAfterCount: 2,
};

interface FailureModeEffect {
    minsMultiplierDelta?: number;       // e.g. -0.25 = up to 25% reduction at full (Recovery) strength
    blockCountDelta?: number;           // full-strength value, tempered per mode below
    bufferFloorBonus?: number;          // minutes, full-strength value
    preWindDownGapBonus?: number;       // minutes, full-strength value
    troughFullyProtected?: boolean;     // boolean rules apply at full strength in every mode — a
    forceHighImportanceToPeak?: boolean; // stated real problem isn't something any mode should ignore
    maxSessionBlockMinsOverride?: number;
    sessionBreakAfterCountOverride?: number;
}

// Values grounded where possible in existing constants (the 45/60/90/120min
// figures used elsewhere in this engine); the deltas themselves are a
// reasoned calibration, not lifted from a pre-existing config — flagged as
// such so they're easy to retune from one place if they feel off in practice.
const FAILURE_MODE_EFFECTS: Record<string, FailureModeEffect> = {
    unexpected_meetings: { minsMultiplierDelta: -0.15, bufferFloorBonus: 10 },
    low_afternoon_energy: { troughFullyProtected: true },
    social_commitments: { bufferFloorBonus: 5 },
    procrastination: { forceHighImportanceToPeak: true },
    overcommitting: { blockCountDelta: -1, minsMultiplierDelta: -0.25 },
    no_buffer_time: { bufferFloorBonus: 10 },
    distractions: { maxSessionBlockMinsOverride: 60, sessionBreakAfterCountOverride: 1 },
    underestimating_time: { bufferFloorBonus: 10 },
    sleep_deprivation: { preWindDownGapBonus: 10 },
    none: {},
};

// How strongly each mode is affected by a stated failure mode — Recovery
// gets the full protective effect, Momentum the lightest (but never zero,
// per product decision: no mode can fully ignore a real stated problem).
const MODE_TEMPER_FACTOR: Record<Strategy, number> = {
    recovery: 1.0,
    balanced: 0.7,
    momentum: 0.4,
};

/**
 * Aggregates (not multiplicatively stacks) adjustments across every failure
 * mode the user reported, tempered by how aggressive the chosen strategy is.
 * A user with several failure modes selected still gets a usable schedule —
 * the most-restrictive minutes multiplier wins, block-count deltas sum but
 * floor at -2, buffer/gap bonuses take the max across modes.
 */
export function getFailureModeAdjustments(
    failureModes: string[] | undefined,
    strategyId: string
): FailureModeAdjustments {
    const result: FailureModeAdjustments = { ...DEFAULT_ADJUSTMENTS };
    if (!failureModes || failureModes.length === 0) return result;

    const factor = MODE_TEMPER_FACTOR[strategyId as Strategy] ?? 0.7;

    let minMultiplier = 1;
    let sumBlockCountDelta = 0;
    let maxBufferBonus = 0;
    let maxGapBonus = 0;
    let minSessionBlockMins = 90;
    let minSessionBreakAfter = 2;

    for (const mode of failureModes) {
        const effect = FAILURE_MODE_EFFECTS[mode];
        if (!effect) continue;

        if (effect.minsMultiplierDelta) {
            minMultiplier = Math.min(minMultiplier, 1 + effect.minsMultiplierDelta * factor);
        }
        if (effect.blockCountDelta) {
            sumBlockCountDelta += Math.round(effect.blockCountDelta * factor);
        }
        if (effect.bufferFloorBonus) {
            maxBufferBonus = Math.max(maxBufferBonus, Math.round(effect.bufferFloorBonus * factor));
        }
        if (effect.preWindDownGapBonus) {
            maxGapBonus = Math.max(maxGapBonus, Math.round(effect.preWindDownGapBonus * factor));
        }
        if (effect.troughFullyProtected) result.troughFullyProtected = true;
        if (effect.forceHighImportanceToPeak) result.forceHighImportanceToPeak = true;
        if (effect.maxSessionBlockMinsOverride) {
            const tempered = Math.round(90 - (90 - effect.maxSessionBlockMinsOverride) * factor);
            minSessionBlockMins = Math.min(minSessionBlockMins, tempered);
        }
        if (effect.sessionBreakAfterCountOverride) {
            const tempered = Math.round(2 - (2 - effect.sessionBreakAfterCountOverride) * factor);
            minSessionBreakAfter = Math.min(minSessionBreakAfter, Math.max(1, tempered));
        }
    }

    result.minsMultiplier = minMultiplier;
    result.blockCountDelta = Math.max(-2, sumBlockCountDelta); // never reduce by more than 2 blocks/day total
    result.bufferFloorBonus = maxBufferBonus;
    result.preWindDownGapBonus = maxGapBonus;
    result.maxSessionBlockMins = minSessionBlockMins;
    result.sessionBreakAfterCount = minSessionBreakAfter;

    return result;
}
