/**
 * The one place a week's real schedulable capacity is computed.
 *
 * The previous inline version in context-builder.ts omitted meals and the
 * morning routine entirely and guessed buffers at a flat 10% of the waking
 * day, so it overstated free time by several hours a week. Anything that asks a
 * user to cut a target has to be standing on an honest number.
 *
 * There must be exactly one implementation: the generator, the plan-week route
 * and the weekly-review proposals all read from here.
 */

/** Meal durations as actually placed by plan-week.ts (bioTemplates). */
export const MEAL_DURATIONS = { breakfast: 30, lunch: 45, dinner: 45 } as const;

/** Per-block buffer by scheduling mode, mirroring getBufferMinutes(). */
export const MODE_BUFFER_MINS: Record<string, number> = {
    momentum: 0,
    balanced: 15,
    recovery: 120,
};

/**
 * The most any single block may be charged for its buffer when computing
 * capacity.
 *
 * Recovery's 120 minutes is the *spacing between sessions* the mode aims for,
 * not time each block consumes: n blocks have at most n−1 gaps between them,
 * and a gap is shared by the two blocks it separates. Charging every block the
 * full 120 gave 74 × 120 = 8880 minutes — 148 hours of buffer in a 108-hour
 * waking week — which clamps `availableMins` to 0 and makes `isOvercommitted`
 * permanently, meaninglessly true.
 *
 * No caller passes a mode today (every call site uses the 3-argument form and
 * gets `balanced`), so this has never fired in production — but it is a live
 * trap for the first caller that does.
 */
export const MAX_CAPACITY_BUFFER_PER_BLOCK = 30;

export interface WeekCapacity {
    awakeMinsPerWeek: number;
    sleepMins: number;
    morningRoutineMins: number;
    windDownMins: number;
    mealMins: number;
    commitmentMins: number;
    bufferMins: number;
    /** What is genuinely schedulable once everything fixed is removed. */
    availableMins: number;
    /** Σ ACTIVE goals' minutes_per_day × days_per_week. Paused goals excluded. */
    targetedMins: number;
    headroomMins: number;
    isOvercommitted: boolean;
}

export interface CapacityProfileInput {
    sleep_start?: string | null;
    sleep_end?: string | null;
    wind_down_mins?: number | null;
    morning_routine_mins?: number | null;
    meals_per_day?: number | null;
}

export interface CapacityGoalInput {
    minutes_per_day?: number | null;
    days_per_week?: number | null;
    is_paused?: boolean | null;
    status?: string | null;
}

export interface CapacityCommitmentInput {
    start_time?: string | null;
    end_time?: string | null;
    days_of_week?: any[] | null;
}

const toMins = (t?: string | null): number => {
    if (!t) return 0;
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

/** Minutes asleep per night, handling the midnight wrap. */
export function sleepMinutesPerDay(sleepStart?: string | null, sleepEnd?: string | null): number {
    const start = toMins(sleepStart || '23:00');
    const end = toMins(sleepEnd || '07:00');
    return end < start ? 1440 - start + end : end - start;
}

/** Minutes of meals per day, using the durations the generator actually places. */
export function mealMinutesPerDay(mealsPerDay?: number | null): number {
    const n = Math.max(0, Math.min(3, Math.round(mealsPerDay ?? 3)));
    const order = [MEAL_DURATIONS.breakfast, MEAL_DURATIONS.lunch, MEAL_DURATIONS.dinner];
    return order.slice(0, n).reduce((s, d) => s + d, 0);
}

/** A goal counts towards the target only if it will actually be scheduled. */
export function isSchedulableGoal(g: CapacityGoalInput): boolean {
    if (g.is_paused === true) return false;
    if (g.status && g.status !== 'active') return false;
    return true;
}

export function computeWeekCapacity(
    profile: CapacityProfileInput,
    goals: CapacityGoalInput[],
    commitments: CapacityCommitmentInput[],
    mode: string = 'balanced'
): WeekCapacity {
    const sleepPerDay = sleepMinutesPerDay(profile.sleep_start, profile.sleep_end);
    const sleepMins = sleepPerDay * 7;
    const awakeMinsPerWeek = (1440 - sleepPerDay) * 7;

    const morningRoutineMins = Math.max(0, profile.morning_routine_mins ?? 0) * 7;
    const windDownMins = Math.max(0, profile.wind_down_mins ?? 30) * 7;
    const mealMins = mealMinutesPerDay(profile.meals_per_day) * 7;

    const commitmentMins = commitments.reduce((sum, c) => {
        const dur = Math.max(0, toMins(c.end_time) - toMins(c.start_time));
        return sum + dur * (c.days_of_week?.length || 0);
    }, 0);

    // Only goals that will actually be scheduled count. Counting paused goals
    // would fabricate an overcommitment that does not exist.
    const activeGoals = goals.filter(isSchedulableGoal);
    const targetedMins = activeGoals.reduce(
        (sum, g) => sum + (g.minutes_per_day || 0) * (g.days_per_week || 0),
        0
    );

    // Buffers: the real per-block figure for the mode, not a flat percentage.
    //
    // Assumption: one block per goal per scheduled day, so the goal-block count
    // is Σ days_per_week across active goals. A goal split into two sessions in
    // a day carries one more buffer than this estimates.
    //
    // Prompt 34 §2 made the planner reserve a buffer around EVERY block, not
    // only goal blocks, so the bio scaffolding consumes buffer time too: sleep,
    // wind-down, the morning routine and each meal, every day. Leaving those out
    // made `availableMins` optimistic — and Prompt 28 decides whether to ever
    // ask the user to cut a target from that number.
    const goalBlocks = activeGoals.reduce((sum, g) => sum + (g.days_per_week || 0), 0);
    const mealsPerDay = Math.max(0, Math.min(3, Math.round(profile.meals_per_day ?? 3)));
    // Per day: wind-down, the morning routine when set, and each meal. Sleep
    // bounds the day rather than sitting inside it, so it buys no usable gap.
    const bioBlocksPerDay = 1 + ((profile.morning_routine_mins ?? 0) > 0 ? 1 : 0) + mealsPerDay;
    const bioBlocks = bioBlocksPerDay * 7;
    const perBlockBuffer = Math.min(MODE_BUFFER_MINS[mode] ?? MODE_BUFFER_MINS.balanced, MAX_CAPACITY_BUFFER_PER_BLOCK);
    const bufferMins = (goalBlocks + bioBlocks) * perBlockBuffer;

    const availableMins = Math.max(
        0,
        awakeMinsPerWeek - morningRoutineMins - windDownMins - mealMins - commitmentMins - bufferMins
    );

    const headroomMins = availableMins - targetedMins;

    return {
        awakeMinsPerWeek,
        sleepMins,
        morningRoutineMins,
        windDownMins,
        mealMins,
        commitmentMins,
        bufferMins,
        availableMins,
        targetedMins,
        headroomMins,
        isOvercommitted: headroomMins < 0,
    };
}

/** Human-readable breakdown, for logs and diagnostics. */
export function describeCapacity(c: WeekCapacity): string {
    const h = (m: number) => `${(m / 60).toFixed(1)}h`;
    return [
        `awake ${h(c.awakeMinsPerWeek)}`,
        `- routine ${h(c.morningRoutineMins)}`,
        `- winddown ${h(c.windDownMins)}`,
        `- meals ${h(c.mealMins)}`,
        `- commitments ${h(c.commitmentMins)}`,
        `- buffers ${h(c.bufferMins)}`,
        `= available ${h(c.availableMins)}`,
        `vs targeted ${h(c.targetedMins)}`,
        `headroom ${h(c.headroomMins)}`,
    ].join(' ');
}

// ── Per-day breakdown ─────────────────────────────────────────────

export interface DayCapacity {
    /** ISO day: 1 = Monday … 7 = Sunday. */
    isoDay: number;
    label: string;
    /** Schedulable minutes on this day, after sleep, bio blocks, anchors and buffers. */
    freeMins: number;
    /** Goal minutes this day is expected to carry, including their buffers. */
    plannedMins: number;
    loadPercentage: number;
    isOver: boolean;
}

const ISO_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The same capacity model as `computeWeekCapacity`, resolved per day instead of
 * averaged across the week.
 *
 * A weekly average hides exactly the thing that matters: 66% across seven days
 * can be a 130% Tuesday, and it is the Tuesday that makes a plan undeliverable.
 * This shares every constant and rule with the week-level function above — it
 * is a different view of one model, not a second implementation.
 *
 * Goal-days are assigned least-loaded-first, mirroring how the planner sorts
 * `preferredDays` by workload, so the busiest day this reports is the busiest
 * day the planner would actually produce.
 */
export function computeDayCapacities(
    profile: CapacityProfileInput,
    goals: CapacityGoalInput[],
    commitments: CapacityCommitmentInput[],
    mode: string = 'balanced'
): DayCapacity[] {
    const sleepPerDay = sleepMinutesPerDay(profile.sleep_start, profile.sleep_end);
    const awakePerDay = 1440 - sleepPerDay;
    const routinePerDay = Math.max(0, profile.morning_routine_mins ?? 0);
    const windDownPerDay = Math.max(0, profile.wind_down_mins ?? 30);
    const mealPerDay = mealMinutesPerDay(profile.meals_per_day);
    const mealsPerDay = Math.max(0, Math.min(3, Math.round(profile.meals_per_day ?? 3)));
    const perBlockBuffer = Math.min(MODE_BUFFER_MINS[mode] ?? MODE_BUFFER_MINS.balanced, MAX_CAPACITY_BUFFER_PER_BLOCK);
    const bioBlocksPerDay = 1 + (routinePerDay > 0 ? 1 : 0) + mealsPerDay;

    // Commitment minutes fall on specific weekdays, so free time is not flat.
    const commitmentByIso = new Map<number, number>();
    for (let d = 1; d <= 7; d++) commitmentByIso.set(d, 0);
    for (const c of commitments) {
        const dur = Math.max(0, toMins(c.end_time) - toMins(c.start_time));
        for (const raw of c.days_of_week || []) {
            const iso = Number(raw) === 0 ? 7 : Number(raw);
            if (iso >= 1 && iso <= 7) commitmentByIso.set(iso, (commitmentByIso.get(iso) || 0) + dur);
        }
    }

    const free = new Map<number, number>();
    for (let d = 1; d <= 7; d++) {
        free.set(
            d,
            Math.max(
                0,
                awakePerDay - routinePerDay - windDownPerDay - mealPerDay
                    - (commitmentByIso.get(d) || 0)
                    - bioBlocksPerDay * perBlockBuffer
            )
        );
    }

    // Assign each goal's days to the least-loaded days available, biggest goal
    // first so the heavy commitments land while there is still room to choose.
    const planned = new Map<number, number>();
    for (let d = 1; d <= 7; d++) planned.set(d, 0);

    const active = goals
        .filter(isSchedulableGoal)
        .map((g) => ({
            mins: Math.max(0, g.minutes_per_day || 0),
            days: Math.max(0, Math.min(7, g.days_per_week || 0)),
        }))
        .filter((g) => g.mins > 0 && g.days > 0)
        .sort((a, b) => b.mins * b.days - a.mins * a.days);

    for (const g of active) {
        const order = [1, 2, 3, 4, 5, 6, 7].sort((a, b) => {
            const ra = (planned.get(a) || 0) / Math.max(1, free.get(a) || 1);
            const rb = (planned.get(b) || 0) / Math.max(1, free.get(b) || 1);
            return ra - rb || a - b;
        });
        for (const d of order.slice(0, g.days)) {
            planned.set(d, (planned.get(d) || 0) + g.mins + perBlockBuffer);
        }
    }

    return [1, 2, 3, 4, 5, 6, 7].map((isoDay) => {
        const freeMins = free.get(isoDay) || 0;
        const plannedMins = planned.get(isoDay) || 0;
        return {
            isoDay,
            label: ISO_LABELS[isoDay - 1],
            freeMins,
            plannedMins,
            loadPercentage: freeMins > 0 ? Math.round((plannedMins / freeMins) * 100) : 0,
            isOver: plannedMins > freeMins,
        };
    });
}

/** The day carrying the most planned minutes — the one that decides feasibility. */
export function busiestDay(days: DayCapacity[]): DayCapacity {
    return days.reduce((a, b) => (b.plannedMins > a.plannedMins ? b : a));
}
