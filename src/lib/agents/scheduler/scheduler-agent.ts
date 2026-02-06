import { BaseAgent } from '../core/base-agent';
import { AgentContext, PlannerOutput, RegulatorOutput, SchedulerOutput, SchedulerOutputSchema } from '../core/types';
import { findNextAvailableSlot, detectConflicts, ScheduleItem, TimeSlot } from '@/lib/scheduling/solver';
import { addMinutes, parseISO, isSameDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface SchedulerInput {
    planner: PlannerOutput;
    regulator: RegulatorOutput;
}

export class SchedulerAgent extends BaseAgent<SchedulerInput, SchedulerOutput> {
    name = "Scheduler Agent";

    async run(input: SchedulerInput, context: AgentContext): Promise<SchedulerOutput> {
        this.log("Calculating options...", { strategy: input.planner.strategy });

        const options = [];
        const { planner } = input;

        // 1. Parse Current Schedule into Solver Format
        const scheduleItems: ScheduleItem[] = (context.currentSchedule || []).map(s => ({
            id: s.id,
            start: new Date(s.start_time), // Assumes ISO in DB
            end: new Date(s.end_time),
            type: s.is_fixed ? 'fixed' : 'flexible'
        }));

        // 2. Handle Strategy: ADD CONSTRAINT / MOVE
        if (planner.intent === 'add_constraint' && planner.time_refs?.[0]) {
            const constraint = planner.time_refs[0];
            let start = parseISO(constraint.start || context.now.toISOString());

            // Phase 3: Behavior Learning (Preferred Windows)
            if (!constraint.start) {
                try {
                    const { BehaviorService } = await import('@/lib/services/behavior-service');
                    // In a real scenario, we'd inspect the "entity" to guess the category (Craft vs Body).
                    // For MVP, we'll try to guess 'craft' if it says 'work' or 'deep'.
                    const text = (planner.entities?.new_task_text || "").toLowerCase();
                    let category = 'craft'; // Default
                    if (text.includes('workout') || text.includes('gym') || text.includes('run')) category = 'body';

                    const patterns = await BehaviorService.getPatterns(context.userId);
                    const windows = patterns?.preferred_windows?.[category];

                    if (windows && windows.length > 0) {
                        // Parse "09:00" from window and apply to today/date
                        const [h, m] = windows[0].split(':').map(Number);
                        const potentialStart = new Date(start);
                        potentialStart.setHours(h, m, 0, 0);

                        // Only use it if it's in the future (if date is today)
                        if (potentialStart > context.now) {
                            start = potentialStart;
                            this.log(`Using learned preference for ${category}: ${windows[0]}`);
                        }
                    }
                } catch (e) {
                    // Fail silently, fallback to default start
                    console.warn("Failed to apply behavior pattern", e);
                }
            }

            // simple hack for ISO: assumes full ISO string from Planner for now
            const duration = constraint.duration_minutes || 60;
            const end = addMinutes(start, duration);

            // Option A: Just do it (Create Anchor)
            // Phase 3: Body as Governor Constraint Check
            let finalDuration = duration;
            let finalTitle = planner.entities?.new_task_text || "Busy";
            const warnings: string[] = [];

            if (context.userState) {
                const { StateEngine } = await import('@/lib/user-state/state-engine');
                const constraints = StateEngine.getConstraints(context.userState.current_mode);

                // Enforce Max Duration per Block in Survival Mode
                if (context.userState.current_mode === 'survival' && duration > 60) {
                    finalDuration = 60;
                    warnings.push(`Reduced duration to 60m due to low energy (Survival Mode).`);
                }

                // Check Hard Tasks
                if (planner.urgency === 'high' && !constraints.allow_hard_tasks) {
                    warnings.push(`Warning: High intensity task scheduled during low energy period.`);
                }
            }

            const finalEnd = addMinutes(start, finalDuration);

            const patchA = {
                id: 'opt_force',
                label: `Block out ${constraint.start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'time'}`,
                confidence_score: 1.0,
                patch: {
                    summary: `Blocking out ${finalDuration} mins for "${finalTitle}"`,
                    changes: [{
                        op: 'create' as const,
                        data: {
                            id: uuidv4(),
                            title: finalTitle,
                            start_time: start.toISOString(),
                            end_time: finalEnd.toISOString(),
                            is_fixed: true,
                            block_type: 'anchor', // New Strict Type
                            priority: 5, // High priority for constraints
                            energy_cost: 'medium'
                        }
                    }],
                    requires_confirmation: true,
                    warnings: warnings,
                    sacrifices: []
                }
            };
            options.push(patchA);

            // Check Conflicts
            const tempItem = { id: 'temp', start, end, type: 'fixed' as const };
            const conflicts = detectConflicts([...scheduleItems, tempItem].filter(x => x.id !== 'temp' || x === tempItem));

            if (conflicts.length > 0) {
                this.log("Conflicts detected", conflicts);
                // In a real implementation, Option B would be "Move X to fit Y" using findNextAvailableSlot
            }
        }
        else if (planner.strategy === 'rebuild') {
            // Rebuild logic placeholder
            options.push({
                id: 'opt_rebuild',
                label: "Rebuild remainder of day",
                confidence_score: 0.8,
                patch: {
                    summary: "Full day rebuild",
                    changes: [],
                    requires_confirmation: true
                }
            });
        }

        // If no options generated (fallback)
        if (options.length === 0) {
            options.push({
                id: 'opt_default',
                label: "No valid changes found",
                confidence_score: 0,
                patch: {
                    summary: "No changes",
                    changes: [],
                    requires_confirmation: false
                }
            });
        }

        return {
            options,
            impossible: false
        };
    }
}
