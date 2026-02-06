import { UserState, UserMode } from '../agents/core/types';

export interface StateInputs {
    sleepHours?: number;
    missedBlocksCount: number;
    completionRate: number; // 0-1
    sentiment?: 'negative' | 'neutral' | 'positive';
    explicitSignal?: 'low_energy' | 'high_energy' | 'crisis';
    currentDate: Date;
}

export const BASELINE_STATE: UserState = {
    energy_level: 3,
    cognitive_load: 2,
    emotional_bandwidth: 2,
    current_mode: 'maintenance',
    emotional_state: 'coasting',
    last_updated: new Date()
};

export class StateEngine {
    static calculateNextState(current: UserState, inputs: StateInputs): UserState {
        let next = { ...current };
        next.last_updated = inputs.currentDate;

        // 1. Explicit Overrides (The strongest signal)
        if (inputs.explicitSignal === 'crisis') {
            return {
                energy_level: 1,
                cognitive_load: 3, // Max load
                emotional_bandwidth: 1, // Min bandwidth
                current_mode: 'survival', // Forced survival
                emotional_state: 'overwhelmed',
                last_updated: inputs.currentDate
            };
        }

        // 2. Sleep Impact (Physiological Baseline)
        let energyMod = 0;
        if (inputs.sleepHours !== undefined) {
            if (inputs.sleepHours < 5) energyMod -= 2;
            else if (inputs.sleepHours < 7) energyMod -= 1;
            else if (inputs.sleepHours > 8) energyMod += 1;
        }

        // 3. Performance Impact (Cognitive/Emotional)
        // High missed blocks -> High cognitive load (open loops) & Low emotional (guilt)
        let cognitiveMod = 0;
        let emotionalMod = 0;

        if (inputs.missedBlocksCount > 3) {
            cognitiveMod += 1; // More open loops
            emotionalMod -= 1; // Feeling of failure
        } else if (inputs.completionRate > 0.8) {
            emotionalMod += 1; // Momentum
        }

        // 4. Sentiment Analysis (From Brain Dumps)
        if (inputs.sentiment === 'negative') {
            emotionalMod -= 1;
            energyMod -= 1;
        } else if (inputs.sentiment === 'positive') {
            emotionalMod += 1;
        }

        // Apply Modifiers to Current State (or Baseline? Manifesto says "Continuous")
        // We dampen changes so it's not erratic. But "Sleep" resets the day usually.
        // Let's assume this runs Daily. So we apply against Baseline or Pushed State.
        // For safe evolution, we clamp values.

        next.energy_level = Math.max(1, Math.min(5, current.energy_level + energyMod)) as any;
        next.cognitive_load = Math.max(1, Math.min(3, current.cognitive_load + cognitiveMod)) as any;
        next.emotional_bandwidth = Math.max(1, Math.min(3, current.emotional_bandwidth + emotionalMod)) as any;

        // 5. Determine Mode & Emotional State
        next.current_mode = this.deriveMode(next);
        next.emotional_state = this.deriveEmotionalState(next, inputs);

        return next;
    }

    private static deriveMode(state: UserState): UserMode {
        // Survival Rules: Very Low Energy OR High Cognitive Load + Low Bandwidth
        if (state.energy_level <= 2) return 'survival';
        if (state.cognitive_load === 3 && state.emotional_bandwidth === 1) return 'survival';

        // Growth Rules: High Energy + Normal/Low Load
        if (state.energy_level >= 4 && state.cognitive_load <= 2) return 'growth';

        return 'maintenance';
    }

    private static deriveEmotionalState(state: UserState, inputs: StateInputs): import('../agents/core/types').EmotionalState {
        // 1. Burnt: Low Energy + Low Bandwidth
        if (state.energy_level <= 2 && state.emotional_bandwidth <= 1) return 'burnt';

        // 2. Overwhelmed: High Load + Missed Blocks
        if (state.cognitive_load === 3 && inputs.missedBlocksCount > 2) return 'overwhelmed';

        // 3. Avoidant: High Load + Low Bandwidth (Shutdown)
        if (state.cognitive_load === 3 && state.emotional_bandwidth === 1) return 'avoidant';

        // 4. Focused: High Energy + Moderate Load (Flow state)
        if (state.energy_level >= 4 && state.cognitive_load === 2) return 'focused';

        // 5. Motivated: High Bandwidth + Momentum
        if (state.emotional_bandwidth === 3 && inputs.completionRate > 0.7) return 'motivated';

        // Default
        return 'coasting';
    }

    static getConstraints(mode: UserMode) {
        switch (mode) {
            case 'survival':
                return {
                    max_craft_minutes: 120,
                    min_buffer_minutes: 60,
                    allow_hard_tasks: false,
                    forced_recovery: true
                };
            case 'maintenance':
                return {
                    max_craft_minutes: 360,
                    min_buffer_minutes: 30,
                    allow_hard_tasks: true,
                    forced_recovery: false
                };
            case 'growth':
                return {
                    max_craft_minutes: 480,
                    min_buffer_minutes: 15,
                    allow_hard_tasks: true,
                    forced_recovery: false
                };
        }
    }
}
