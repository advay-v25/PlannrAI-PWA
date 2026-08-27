/**
 * Deterministic goal recalibration.
 *
 * Deciding that a goal targeting 5h which produced 1h should come down to
 * 20 min/day is arithmetic. It lived inside the LLM response only because it
 * happened to be generated in the same call — which meant the entire
 * recalibration half of Weekly Review died whenever a provider timed out.
 *
 * No AI is involved here, and none may be.
 */

export type ChangeType = 'pause' | 'update_time' | 'update_days';

export interface ProposedChange {
    goal_id: string;
    title: string;
    change_type: ChangeType;
    old_value: string;
    new_value: string;
    new_minutes_per_day?: number;
    new_days_per_week?: number;
    rationale: string;
}

export interface GoalUsage {
    title: string;
    /** minutes_per_day × days_per_week */
    weeklyTarget: number;
    /** completed minutes this week */
    completed: number;
    minutesPerDay: number;
    daysPerWeek: number;
    /** distinct dates with at least one completed block */
    activeDays: number;
    /** eligible blocks for this goal this week */
    eligibleBlocks: number;
    /** eligible blocks that were completed */
    completedBlocks: number;
    /** ISO date the goal was created */
    createdAt?: string | null;
}

/** Minimum a proposal will ever drop a daily target to. */
const FLOOR_MINUTES = 10;
/** A goal must have existed this long before we suggest pausing it. */
const PAUSE_AGE_DAYS = 14;

/** "5h", "1h 30m", "45m" */
export function formatMinutes(mins: number): string {
    const m = Math.max(0, Math.round(mins));
    if (m === 0) return '0m';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem}m`;
    if (rem === 0) return `${h}h`;
    return `${h}h ${rem}m`;
}

const describe = (minsPerDay: number, days: number) => `${Math.round(minsPerDay)}m/day × ${days} days`;

const roundTo5 = (n: number) => Math.round(n / 5) * 5;

/** Whole days between two ISO dates. */
function daysBetween(fromIso: string, toIso: string): number {
    const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.floor((b - a) / 86400000);
}

/**
 * One proposal per goal at most, first matching rule wins.
 * `delete` is never proposed — a weekly review must not be able to destroy a
 * goal the user never saw suggested.
 */
export function buildProposals(usage: Record<string, GoalUsage>, today: string): ProposedChange[] {
    const proposals: ProposedChange[] = [];

    for (const [goalId, g] of Object.entries(usage)) {
        // A goal with no target can't be measured against one.
        if (!g.weeklyTarget || g.weeklyTarget <= 0) continue;

        const ratio = g.completed / g.weeklyTarget;
        const targetLabel = formatMinutes(g.weeklyTarget);
        const actualLabel = formatMinutes(g.completed);
        const oldValue = describe(g.minutesPerDay, g.daysPerWeek);

        // 1. Untouched all week, and old enough that this isn't a brand-new goal.
        if (g.completed === 0) {
            const oldEnough = g.createdAt ? daysBetween(g.createdAt, today) >= PAUSE_AGE_DAYS : false;
            if (oldEnough) {
                proposals.push({
                    goal_id: goalId,
                    title: g.title,
                    change_type: 'pause',
                    old_value: oldValue,
                    new_value: 'Paused',
                    rationale: `Targeted ${targetLabel}, completed nothing for two weeks running. Pausing it frees the time for goals you are actually doing.`,
                });
                continue;
            }
        }

        // 2. Badly short of target — bring the daily commitment down to reality.
        if (ratio < 0.5) {
            const divisor = g.activeDays > 0 ? g.activeDays : g.daysPerWeek || 1;
            const newMins = Math.max(FLOOR_MINUTES, Math.round(g.completed / divisor));
            if (newMins !== Math.round(g.minutesPerDay)) {
                proposals.push({
                    goal_id: goalId,
                    title: g.title,
                    change_type: 'update_time',
                    old_value: oldValue,
                    new_value: describe(newMins, g.daysPerWeek),
                    new_minutes_per_day: newMins,
                    rationale: `Targeted ${targetLabel}, completed ${actualLabel}. Dropping to ${newMins} min/day to make it achievable.`,
                });
                continue;
            }
        }

        // 3. Somewhat short — the daily amount is fine, the frequency isn't.
        if (ratio < 0.8) {
            const newDays = Math.max(1, g.activeDays);
            if (newDays !== g.daysPerWeek) {
                proposals.push({
                    goal_id: goalId,
                    title: g.title,
                    change_type: 'update_days',
                    old_value: oldValue,
                    new_value: describe(g.minutesPerDay, newDays),
                    new_days_per_week: newDays,
                    rationale: `Targeted ${targetLabel}, completed ${actualLabel} across ${newDays} ${newDays === 1 ? 'day' : 'days'}. Matching the plan to the ${newDays} ${newDays === 1 ? 'day' : 'days'} you actually showed up.`,
                });
                continue;
            }
        }

        // 4. Beat the target with a clean sheet — room to push.
        if (ratio > 1.2 && g.eligibleBlocks > 0 && g.completedBlocks === g.eligibleBlocks) {
            const newMins = Math.max(FLOOR_MINUTES, roundTo5(g.minutesPerDay * 1.15));
            if (newMins !== Math.round(g.minutesPerDay)) {
                proposals.push({
                    goal_id: goalId,
                    title: g.title,
                    change_type: 'update_time',
                    old_value: oldValue,
                    new_value: describe(newMins, g.daysPerWeek),
                    new_minutes_per_day: newMins,
                    rationale: `Targeted ${targetLabel}, completed ${actualLabel} and finished every block. Raising to ${newMins} min/day to keep it challenging.`,
                });
                continue;
            }
        }

        // 5. Otherwise the goal matched the week. No proposal is a success state.
    }

    return proposals;
}
