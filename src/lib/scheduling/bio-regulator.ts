// @ts-nocheck
import { SolverConstraints } from './solver';
import { Goal, EnergyDemand } from '@/types/database';

export class BioRegulator {

    /**
     * Translates human energy level (1-5) into mathematical constraints for the Solver.
     */
    static getConstraints(energyLevel: number): SolverConstraints {
        // Defaults (Energy 3 - Neutral)
        // Work: 9am - 5pm
        // Gaps: 10 mins

        switch (energyLevel) {
            case 1: // DISENGAGED / RECOVERY
                return {
                    workStartHour: 11, // Start late
                    workEndHour: 15,   // End early (4h window)
                    minGapMinutes: 30, // Big breaks
                };
            case 2: // LOW POWER
                return {
                    workStartHour: 10,
                    workEndHour: 16,
                    minGapMinutes: 20
                };
            case 4: // HIGH PERFORMANCE
                return {
                    workStartHour: 8,
                    workEndHour: 18,
                    minGapMinutes: 5 // Tight compression
                };
            case 5: // UNSTOPPABLE
                return {
                    workStartHour: 7,
                    workEndHour: 19,
                    minGapMinutes: 0 // Back-to-back allowed
                };
            case 3:
            default:
                return {
                    workStartHour: 9,
                    workEndHour: 17,
                    minGapMinutes: 10
                };
        }
    }

    /**
     * Filters a list of potential goals to match the current energy capacity.
     */
    static filterGoalsByBioState(goals: Goal[], energyLevel: number): Goal[] {
        if (energyLevel >= 4) {
            // High energy: Prioritize HEAVY tasks, but allow everything type.
            // Actually, we might want to *hide* light tasks to focus on the big rocks?
            // "Eat the frog".
            // For now, allow all, but maybe sort by demand?
            return goals;
        }

        if (energyLevel === 3) {
            // Standard: Allow all
            return goals;
        }

        if (energyLevel === 2) {
            // Low: Remove 'heavy'
            return goals.filter(g => g.energy_demand !== 'heavy');
        }

        if (energyLevel === 1) {
            // Crisis: Only 'light'
            return goals.filter(g => g.energy_demand === 'light');
        }

        return goals;
    }

    /**
     * Returns a system prompt fragment to guide the AI
     */
    static getAIPromptFragment(energyLevel: number): string {
        const constraints = this.getConstraints(energyLevel);
        const map = {
            1: "CRITICAL RECOVERY. Minimal load. Maximum breaks. Reject non-essential.",
            2: "LOW BATTERY. Conservatism. No heavy lifts.",
            3: "BASELINE. Standard operating procedure.",
            4: "HIGH OUTPUT. Push the pace. Compress gaps.",
            5: "GOD MODE. Maximum density. Complex tasks."
        };

        return `
        BIO-STATE: Level ${energyLevel}/5 (${map[energyLevel as keyof typeof map] || "Standard"})
        CONSTRAINTS: Work ${constraints.workStartHour}:00-${constraints.workEndHour}:00. Gaps: ${constraints.minGapMinutes}m.
        DIRECTION: Adjust schedule density to match this state.
        WHITESPACE: Leave 20% of available time as open gaps for flow and flexibility.
        SPREAD: Spread goals throughout the day. Avoid clustering.
        BODY PILLAR BUFFER: NEVER schedule 'body' pillar activities (exercise, physical work) within 2 HOURS after any meal (Breakfast, Lunch, Dinner).
        `;
    }
}
