/**
 * ⚡ PLANNRAI — SCHEDULING PROTOCOL
 * 
 * Single source of truth for mapping (energy, mood) → scheduling behavior.
 * All calendar generation endpoints consume this protocol to ensure
 * consistent, energy-aware scheduling across the system.
 */

// ── Types ────────────────────────────────────────────────────────

export type ScheduleStrategy = 'momentum' | 'balanced' | 'recovery';

export type MoodLevel = 'great' | 'good' | 'neutral' | 'low' | 'rough';

export interface ScheduleMode {
    strategy: ScheduleStrategy;
    label: string;
    emoji: string;
    maxGoalBlocksPerDay: number;
    maxDeepWorkMins: number;
    bufferBetweenBlocks: number;     // Minutes between goal blocks
    goalEnergyFilter: 'all' | 'no_high' | 'low_only';
    promptFragment: string;
    bannerMessage: string | null;
    bannerType: 'momentum' | 'recovery' | null;
    shouldSuggestReoptimize: boolean;
}

export interface ProtocolInput {
    energy: number;       // 1-5
    mood: MoodLevel;      // great | good | neutral | low | rough
    completionRate7d?: number;  // 0-100, optional performance context
}

// ── Mode Matrix ──────────────────────────────────────────────────

const MOOD_POSITIVE: MoodLevel[] = ['great', 'good'];
const MOOD_NEGATIVE: MoodLevel[] = ['low', 'rough'];

/**
 * Core routing function: (energy, mood) → ScheduleStrategy
 * 
 * | Energy | Positive Mood | Neutral Mood | Negative Mood |
 * |--------|--------------|--------------|---------------|
 * | 4-5    | MOMENTUM     | BALANCED     | BALANCED      |
 * | 3      | BALANCED     | BALANCED     | RECOVERY      |
 * | 1-2    | RECOVERY     | RECOVERY     | RECOVERY      |
 */
function routeToStrategy(energy: number, mood: MoodLevel): ScheduleStrategy {
    const isPositive = MOOD_POSITIVE.includes(mood);
    const isNegative = MOOD_NEGATIVE.includes(mood);

    if (energy >= 4) {
        if (isPositive) return 'momentum';
        return 'balanced';
    }

    if (energy === 3) {
        if (isNegative) return 'recovery';
        return 'balanced';
    }

    // energy 1-2
    return 'recovery';
}

// ── Mode Configurations ──────────────────────────────────────────

const MODE_CONFIGS: Record<ScheduleStrategy, Omit<ScheduleMode, 'shouldSuggestReoptimize'>> = {
    momentum: {
        strategy: 'momentum',
        label: 'Momentum Mode',
        emoji: '⚡',
        maxGoalBlocksPerDay: 5,
        maxDeepWorkMins: 300,
        bufferBetweenBlocks: 5,
        goalEnergyFilter: 'all',
        promptFragment: `ENERGY STATE: MOMENTUM MODE ⚡
The user has HIGH energy and POSITIVE mood today. This is a peak performance day.
- Schedule aggressively — pack the day with productive blocks
- Front-load the hardest, highest-energy tasks in the morning peak
- Minimize buffer time between blocks (5 min transitions only)
- Allow up to 5 goal blocks and 5 hours of deep work
- Push the user to achieve maximum output while they have the capacity
- This is NOT a day for rest — capitalize on the energy`,
        bannerMessage: '⚡ Momentum Mode — Full power. Your schedule is loaded for maximum output.',
        bannerType: 'momentum',
    },
    balanced: {
        strategy: 'balanced',
        label: 'Balanced Mode',
        emoji: '⚖️',
        maxGoalBlocksPerDay: 4,
        maxDeepWorkMins: 240,
        bufferBetweenBlocks: 15,
        goalEnergyFilter: 'no_high',
        promptFragment: `ENERGY STATE: BALANCED MODE ⚖️
The user has moderate energy today. Standard optimized approach.
- Schedule 3-4 goal blocks with 15-minute buffers between them
- Follow ultradian rhythm: 60-90 min deep work → 15-20 min recovery
- Prioritize goals that are behind on weekly progress
- Include active recovery blocks between deep work sessions
- Keep the schedule achievable — quality over quantity`,
        bannerMessage: null,
        bannerType: null,
    },
    recovery: {
        strategy: 'recovery',
        label: 'Recovery Mode',
        emoji: '🛡',
        maxGoalBlocksPerDay: 2,
        maxDeepWorkMins: 90,
        bufferBetweenBlocks: 30,
        goalEnergyFilter: 'low_only',
        promptFragment: `ENERGY STATE: RECOVERY MODE 🛡
The user has LOW energy or is in a ROUGH mood today. PROTECT their recovery.
- Schedule at MOST 2 light goal blocks, totaling no more than 90 minutes
- Use 30-minute buffers between blocks for mental reset
- Only schedule low-energy-demand goals and high-importance goals
- Add extra self-care blocks: walks, breathing, journaling
- DO NOT schedule any high-energy-demand tasks
- Include at least one "Free Time" block of 60+ minutes
- Prioritize soul pillar activities and gentle movement over cognitive work
- The schedule should feel LIGHT and BREATHABLE, not packed`,
        bannerMessage: '🛡 Recovery Mode — Light schedule. Only essentials today.',
        bannerType: 'recovery',
    },
};

// ── Public API ───────────────────────────────────────────────────

export class SchedulingProtocol {

    /**
     * Compute the scheduling mode from energy + mood.
     * This is the primary entry point used by all scheduling endpoints.
     */
    static computeMode(input: ProtocolInput): ScheduleMode {
        const energy = Math.max(1, Math.min(5, Math.round(input.energy || 3)));
        const mood = input.mood || 'neutral';

        const strategy = routeToStrategy(energy, mood);
        const config = MODE_CONFIGS[strategy];

        // For balanced mode at energy=3, still allow high-energy goals
        // (only filter at energy ≤ 2)
        let adjustedFilter = config.goalEnergyFilter;
        if (strategy === 'balanced' && energy >= 3) {
            adjustedFilter = 'no_high';
        }
        if (strategy === 'balanced' && energy >= 4) {
            adjustedFilter = 'all';
        }

        // Determine if we should suggest re-optimization
        // (only when mode changed from what was previously planned)
        const shouldSuggestReoptimize = strategy !== 'balanced';

        return {
            ...config,
            goalEnergyFilter: adjustedFilter,
            shouldSuggestReoptimize,
        };
    }

    /**
     * Filter goals based on the current schedule mode.
     * Replaces the old inline filterGoalsByEnergy function.
     */
    static filterGoals(goals: any[], mode: ScheduleMode): any[] {
        switch (mode.goalEnergyFilter) {
            case 'all':
                return goals;
            case 'no_high':
                return goals.filter((g: any) => {
                    const demand = (g.energy_demand || 'medium').toLowerCase();
                    return demand !== 'high' && demand !== 'heavy';
                });
            case 'low_only':
                return goals.filter((g: any) => {
                    const demand = (g.energy_demand || 'medium').toLowerCase();
                    const importance = (g.importance || 'medium').toLowerCase();
                    // Allow low-energy goals OR high-importance goals regardless of energy
                    return demand === 'low' || demand === 'light' || importance === 'high';
                });
            default:
                return goals;
        }
    }

    /**
     * Get the plan-week strategy override.
     * If the user didn't explicitly choose a mode, auto-select based on energy.
     */
    static getWeekModeOverride(
        requestedMode: ScheduleStrategy | undefined,
        energy: number,
        mood: MoodLevel
    ): ScheduleStrategy {
        // If user explicitly selected a mode in the UI, respect it
        if (requestedMode) return requestedMode;

        // Otherwise, auto-route based on current energy/mood
        const computed = this.computeMode({ energy, mood });
        return computed.strategy;
    }

    /**
     * Build a prompt fragment for AI scheduling endpoints.
     * Includes energy state + intensity directives.
     */
    static buildPromptFragment(mode: ScheduleMode, energy: number, mood: MoodLevel): string {
        return `${mode.promptFragment}
- Current energy level: ${energy}/5
- Current mood: ${mood}
- Max goal blocks today: ${mode.maxGoalBlocksPerDay}
- Max deep work minutes: ${mode.maxDeepWorkMins}
- Buffer between blocks: ${mode.bufferBetweenBlocks} minutes`;
    }

    /**
     * Get the scheduling intensity string for generate-today.
     * Replaces the inline computation in generate-today/route.ts.
     */
    static getIntensityDescription(
        mode: ScheduleMode,
        energy: number,
        completionRate7d: number
    ): string {
        switch (mode.strategy) {
            case 'momentum':
                return `HIGH MOMENTUM — User has strong energy (${energy}/5) and positive mood. Schedule aggressively with ${mode.maxGoalBlocksPerDay} goal blocks. 7-day completion: ${completionRate7d}%.`;
            case 'recovery':
                return `RECOVERY — User has low energy (${energy}/5) or rough mood. Max ${mode.maxGoalBlocksPerDay} light goal blocks, ${mode.maxDeepWorkMins}min total deep work. Prioritize rest and self-care.`;
            default:
                if (completionRate7d > 70) {
                    return `BALANCED — Standard day. ${mode.maxGoalBlocksPerDay} goal blocks, ${mode.bufferBetweenBlocks}min buffers. 7-day completion: ${completionRate7d}% (strong).`;
                }
                if (completionRate7d < 40) {
                    return `BALANCED (CAUTIOUS) — Completion rate is low (${completionRate7d}%). Make schedule ACHIEVABLE — fewer blocks, shorter durations.`;
                }
                return `BALANCED — Standard day. ${mode.maxGoalBlocksPerDay} goal blocks with adequate breaks. 7-day completion: ${completionRate7d}%.`;
        }
    }

    /**
     * Get the banner response for energy check-in API.
     */
    static getBannerResponse(mode: ScheduleMode): {
        schedule_mode: ScheduleStrategy;
        schedule_mode_label: string;
        suggestion: string | null;
        should_reoptimize: boolean;
        banner: {
            type: string;
            message: string;
            action_label: string;
        } | null;
    } {
        if (!mode.bannerMessage) {
            return {
                schedule_mode: mode.strategy,
                schedule_mode_label: mode.label,
                suggestion: null,
                should_reoptimize: false,
                banner: null,
            };
        }

        const suggestion = mode.strategy === 'recovery'
            ? 'Your energy is low. Want me to lighten today\'s schedule?'
            : mode.strategy === 'momentum'
                ? 'High energy detected! Want me to load up today\'s schedule?'
                : null;

        return {
            schedule_mode: mode.strategy,
            schedule_mode_label: mode.label,
            suggestion,
            should_reoptimize: mode.shouldSuggestReoptimize,
            banner: {
                type: mode.strategy,
                message: mode.bannerMessage,
                action_label: mode.strategy === 'recovery' ? 'Lighten Schedule' : 'Boost Schedule',
            },
        };
    }
}
