import { BaseAgent } from '../core/base-agent';
import { AgentContext, PlannerOutput, RegulatorOutput, SchedulerOutput, SchedulerOutputSchema } from '../core/types';
import { findNextAvailableSlot, detectConflicts, ScheduleItem, TimeSlot } from '@/lib/scheduling/solver';
import { addMinutes, parseISO, isSameDay, differenceInMinutes, format, areIntervalsOverlapping } from 'date-fns';
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
            start: new Date(s.start_time),
            end: new Date(s.end_time),
            type: s.is_fixed ? 'fixed' : 'flexible'
        }));

        const targetHint = planner.entities?.target_event_hint?.toLowerCase();

        // HELPER: Find Target Block Fuzzy
        const findTargetBlock = (hint?: string) => {
            if (!hint) return null;
            return context.currentSchedule?.find(b => {
                const title = (b.title || b.context || b.goal?.title || "").toLowerCase();
                return title.includes(hint);
            });
        };

        // ==========================================
        // STRATEGY: MOVE / RESCHEDULE
        // ==========================================
        if (planner.strategy === 'move' || planner.intent === 'reschedule') {
            const target = findTargetBlock(targetHint);

            if (target) {
                const duration = differenceInMinutes(parseISO(target.end_time), parseISO(target.start_time));

                // Option A: Move to Next Available (ASAP)
                const nextSlot = findNextAvailableSlot(
                    scheduleItems.filter(i => i.id !== target.id), // Exclude self
                    duration,
                    context.now, // Search from NOW
                    { workStartHour: 8, workEndHour: 22 }
                );

                if (nextSlot) {
                    options.push({
                        id: 'opt_move_asap',
                        label: `Move "${target.title || target.context}" to ${format(nextSlot.start, 'h:mm a')}`,
                        confidence_score: 0.9,
                        patch: {
                            summary: `Moved ${targetHint} to ${format(nextSlot.start, 'h:mm a')}`,
                            changes: [{
                                op: 'move',
                                event_id: target.id,
                                new_start_ts: nextSlot.start.toISOString(),
                                new_end_ts: nextSlot.end.toISOString()
                            }],
                            requires_confirmation: true
                        }
                    });
                }
            } else {
                // Fallback: If no target found but intent was reschedule, maybe reschedule WHOLE DAY from now?
                // For now, return impossible if target not found.
            }
        }

        // ==========================================
        // STRATEGY: SHORTEN / COMPRESS
        // ==========================================
        else if (planner.strategy === 'shorten' || planner.strategy === 'compress') {
            if (planner.scope === 'block' && targetHint) {
                const target = findTargetBlock(targetHint);
                if (target) {
                    const currentDuration = differenceInMinutes(parseISO(target.end_time), parseISO(target.start_time));
                    const newDuration = Math.max(15, Math.floor(currentDuration * 0.5)); // 50% reduction

                    options.push({
                        id: 'opt_shorten_50',
                        label: `Shorten "${target.context}" to ${newDuration}m`,
                        confidence_score: 0.9,
                        patch: {
                            summary: `Shortened ${target.context} to ${newDuration}m`,
                            changes: [{
                                op: 'resize',
                                event_id: target.id,
                                duration_minutes: newDuration
                            }],
                            requires_confirmation: true
                        }
                    });
                }
            } else if (planner.scope === 'day') {
                // Compress EVERYTHING flexible remaining
                const remainingFlexible = context.currentSchedule?.filter(b =>
                    !b.is_fixed && new Date(b.end_time) > context.now
                ) || [];

                if (remainingFlexible.length > 0) {
                    const changes = remainingFlexible.map(b => {
                        const d = differenceInMinutes(parseISO(b.end_time), parseISO(b.start_time));
                        return {
                            op: 'resize',
                            event_id: b.id,
                            duration_minutes: Math.max(15, Math.floor(d * 0.75)) // 25% reduction
                        };
                    });

                    options.push({
                        id: 'opt_compress_all',
                        label: `Compress day (save ${(remainingFlexible.length * 15)}m)`,
                        confidence_score: 0.85,
                        patch: {
                            summary: `Compressed ${remainingFlexible.length} blocks`,
                            changes: changes as any,
                            requires_confirmation: true
                        }
                    });
                }
            }
        }

        // ==========================================
        // STRATEGY: CANCEL / HIDE
        // ==========================================
        else if (planner.strategy === 'hide_low_priority' || planner.intent === 'reduce_intensity') {
            // Find low priority items or specific target
            const target = findTargetBlock(targetHint);

            if (target) {
                options.push({
                    id: 'opt_cancel_target',
                    label: `Cancel "${target.context}"`,
                    confidence_score: 0.95,
                    patch: {
                        summary: `Cancelled ${target.context}`,
                        changes: [{
                            op: 'delete',
                            event_id: target.id
                        }],
                        requires_confirmation: true
                    }
                });
            } else {
                // Find all "Low Priority" or Routine items
                // Mock logic: find items with no goal_id (pure tasks)
                const candidates = context.currentSchedule?.filter(b => !b.goal_id && !b.is_fixed && new Date(b.end_time) > context.now) || [];

                if (candidates.length > 0) {
                    options.push({
                        id: 'opt_clear_shallow',
                        label: `Clear ${candidates.length} shallow tasks`,
                        confidence_score: 0.8,
                        patch: {
                            summary: `Cleared shallow tasks`,
                            changes: candidates.map(c => ({ op: 'delete', event_id: c.id })) as any,
                            requires_confirmation: true
                        }
                    });
                }
            }
        }

        // ==========================================
        // STRATEGY: ADD CONSTRAINT (Legacy + Fixed)
        // ==========================================
        else if (planner.intent === 'add_constraint' && planner.time_refs?.[0]) {
            const constraint = planner.time_refs[0];
            let start = parseISO(constraint.start || context.now.toISOString());

            // Phase 3: Behavior Learning (Preferred Windows)
            if (!constraint.start) {
                try {
                    // In a real scenario, we'd inspect the "entity" to guess the category (Craft vs Body).
                    // For MVP, we'll try to guess 'craft' if it says 'work' or 'deep'.
                    const text = (planner.entities?.new_task_text || "").toLowerCase();
                    let category = 'craft'; // Default
                    if (text.includes('workout') || text.includes('gym') || text.includes('run')) category = 'body';

                    // Use Injected Patterns (Phase 4)
                    const patterns = context.behaviorPatterns;
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
                        } else {
                            this.log(`Learned preference ${windows[0]} is in the past. Ignoring.`);
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

            // ---------------------------------------------------------
            // COLLISION CHECK (Strict Anchor Enforcement)
            // ---------------------------------------------------------
            const collision = context.currentSchedule?.find(b =>
                b.is_fixed &&
                areIntervalsOverlapping(
                    { start, end: finalEnd },
                    { start: new Date(b.start_time), end: new Date(b.end_time) }
                )
            );

            if (collision) {
                this.log(`Collision detected with fixed block: ${collision.title}`);

                // 1. Force Option (With Warning)
                const forceOption = {
                    id: 'opt_force_conflict',
                    label: `Force (Overlaps ${collision.title})`,
                    confidence_score: 0.1, // Very low confidence
                    patch: {
                        summary: `Forces blocking out "${finalTitle}" despite conflict`,
                        changes: [{
                            op: 'create' as const,
                            data: {
                                id: uuidv4(),
                                title: finalTitle,
                                start_time: start.toISOString(),
                                end_time: finalEnd.toISOString(),
                                is_fixed: true, // Now fixed
                                block_type: 'anchor',
                                priority: 5,
                                energy_cost: 'medium'
                            }
                        }],
                        requires_confirmation: true,
                        warnings: [`CONFLICT: Overlaps with ${collision.title}.`, ...warnings],
                        sacrifices: [collision.title]
                    }
                };
                options.push(forceOption);

                // 2. Alternative Option (Next Available)
                const nextSlot = findNextAvailableSlot(
                    scheduleItems,
                    finalDuration,
                    start, // Start search from desired time
                    { workStartHour: 8, workEndHour: 22 }
                );

                if (nextSlot) {
                    options.push({
                        id: 'opt_alternative_slot',
                        label: `Schedule after ${collision.title} (${format(nextSlot.start, 'h:mm a')})`,
                        confidence_score: 0.95, // High confidence
                        patch: {
                            summary: `Scheduled "${finalTitle}" at ${format(nextSlot.start, 'h:mm a')}`,
                            changes: [{
                                op: 'create' as const,
                                data: {
                                    id: uuidv4(),
                                    title: finalTitle,
                                    start_time: nextSlot.start.toISOString(),
                                    end_time: nextSlot.end.toISOString(),
                                    is_fixed: true,
                                    block_type: 'anchor',
                                    priority: 5,
                                    energy_cost: 'medium'
                                }
                            }],
                            requires_confirmation: true,
                            warnings: [],
                            sacrifices: []
                        }
                    });
                }

            } else {
                // No Collision - Standard Force
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
            }
        }

        // ==========================================
        // FALLBACK: NO OPTIONS
        // ==========================================
        if (options.length === 0) {
            // If we failed to map a strategy but have an intent, offer a generic "Rebuild"
            options.push({
                id: 'opt_smart_rebuild',
                label: "Optimize Schedule",
                confidence_score: 0.5,
                patch: {
                    summary: "AI Auto-Optimization",
                    changes: [],
                    // In a real world, this would trigger the actual Solver.rebuildSchedule
                    // For now, it's a placeholder to avoid empty state
                    requires_confirmation: true
                }
            });
        }

        return {
            options,
            impossible: false
        };
    }
}
