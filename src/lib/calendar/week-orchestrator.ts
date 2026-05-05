import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Canonical calendar table: schedule_blocks
 * Anchors are locked schedule_blocks where commitment_id is not null (or is_locked=true).
 * This orchestrator DOES NOT write to DB. It returns { previewBlocks, patch, summary }.
 */

export type Mode = "plan" | "optimise";
export type Pillar = "mind" | "body" | "craft";
export type Priority = "low" | "medium" | "high";
export type Energy = "light" | "medium" | "heavy";
export type WeekendIntensity = "normal" | "light" | "off";

export interface ProfilePrefs {
    timezone: string;
    sleep_start: string; // "23:00"
    sleep_end: string;   // "07:00"
    winddown_mins: number; // 15..120
    buffer_minutes: number;   // 5/10/15 default 10
    meal_duration_minutes: number; // default 30
    meals_per_day: 2 | 3;
    weekend_intensity: WeekendIntensity; // default "normal"
    preferred_workdays: number[]; // 0..6 (Sun=0) default all 7
    // windows per meal; can be stored as JSONB
    meal_windows: {
        breakfast?: { start: string; end: string }; // "07:00".."10:00"
        lunch: { start: string; end: string };     // "12:00".."15:00"
        dinner: { start: string; end: string };    // "18:30".."21:30"
    };
    // optional pillar preferences
    pillar_preferences?: Partial<Record<Pillar, { preferred?: string[]; avoid?: string[] }>>;
    // New Bio-Context
    bio: {
        energy: 'low' | 'medium' | 'high';
        stress: 'low' | 'medium' | 'high';
        chronotype: string;
    };
}

export interface Goal {
    id: string;
    title: string;
    pillar: Pillar;
    minutes_per_day: number;
    days_per_week?: number; // default 7
    priority: Priority;
    energy?: Energy;
    preferred_windows?: string[]; // "morning", "afternoon", "evening"
    status: "active" | "paused" | "archived";
}

export interface ScheduleBlockRow {
    id?: string;
    user_id: string;
    date: string;       // "YYYY-MM-DD"
    start_time: string; // "HH:MM"
    end_time: string;   // "HH:MM"
    title: string;
    block_type: string; // 'goal'|'meal'|'sleep'|'anchor'|'adhoc' etc.
    status: "planned" | "done" | "missed";
    is_fixed: boolean;
    commitment_id?: string | null;
    goal_id?: string | null;
    pillar?: Pillar | null;
    energy_cost?: Energy | null;
    priority?: number | null;
    source?: "planner" | "optimiser" | "coach" | "manual" | "anchor" | "meal" | "sleep";
    is_locked?: boolean;
    meta?: any;
}

export type PatchChange =
    | { op: "create_event"; payload: Omit<ScheduleBlockRow, "id"> }
    | { op: "update_event"; event_id: string; payload: Partial<ScheduleBlockRow> }
    | { op: "delete_event"; event_id: string };

export interface Patch {
    changes: PatchChange[];
    reason?: string;
}

export interface WeekSummary {
    week_start: string;
    week_end: string;
    planned_minutes_total: number;
    planned_minutes_by_pillar: Record<Pillar, number>;
    capacity_minutes_by_day: Record<string, number>; // date -> minutes
    demand_minutes_by_day: Record<string, number>;
    notes: string[];
}

export interface GenerateWeekArgs {
    userId: string;
    weekStartISO: string; // YYYY-MM-DD (Mon recommended)
    mode: Mode;
    context?: {
        reason?: string;
        reduceIntensity?: boolean;
    };
    supabase: SupabaseClient;
}

export interface GenerateWeekResult {
    previewBlocks: Omit<ScheduleBlockRow, "id">[];
    patch: Patch;
    summary: WeekSummary;
}

type TimeSlot = {
    date: string; // YYYY-MM-DD
    startMin: number; // minutes from 00:00
    endMin: number;
};

type DayContext = {
    date: string;
    prefs: ProfilePrefs;
    blocked: TimeSlot[];      // hard+semi-hard
    placed: Omit<ScheduleBlockRow, "id">[]; // blocks planned for preview
};

export class WeekOrchestrator {
    static async generateWeek(args: GenerateWeekArgs): Promise<GenerateWeekResult> {
        const { userId, weekStartISO, mode, context, supabase } = args;

        // 1) Load context
        const prefs = await this.loadProfilePrefs(userId, supabase);
        const goals = await this.loadActiveGoals(userId, supabase);
        const anchors = await this.loadAnchorsForWeek(userId, weekStartISO, supabase); // locked blocks already in schedule_blocks
        const existing = await this.loadScheduleBlocksForWeek(userId, weekStartISO, supabase);

        // 2) Build week dates
        const weekDates = this.buildWeekDates(weekStartISO); // 7 dates

        // 3) Create day contexts + hard blocks (sleep, anchors)
        const dayCtxs: DayContext[] = weekDates.map((date) => ({
            date,
            prefs,
            blocked: [],
            placed: [],
        }));

        // 3a) Block sleep + winddown + pre-bed quiet buffer
        for (const dc of dayCtxs) {
            this.blockSleep(dc);
        }

        // 3b) Add anchors (locked blocks) as blocked time and as placed (anchors appear on calendar)
        for (const anchor of anchors) {
            const dc = dayCtxs.find((d) => d.date === anchor.date);
            if (!dc) continue;
            dc.blocked.push(this.blockToSlot(anchor));
            dc.placed.push(anchor); // keep anchor in preview; patch should NOT recreate if already persisted
        }

        // 3c) Place meals (semi-hard constraints)
        const mealBlocks = this.placeMealsForWeek(dayCtxs);
        for (const mb of mealBlocks) {
            const dc = dayCtxs.find((d) => d.date === mb.date);
            if (!dc) continue;
            dc.blocked.push(this.blockToSlot(mb));
            dc.placed.push(mb);
        }

        // 4) Determine daily capacity + demand + distribution across week (including weekends)
        const distribution = this.computeWeeklyDistribution(dayCtxs, goals);

        // 5) Convert goals → sessions to place
        const sessions = this.buildGoalSessions(goals, distribution, context?.reduceIntensity ?? false);

        // 6) Place sessions using scoring + constraints + spacing rules
        const createdGoalBlocks: Omit<ScheduleBlockRow, "id">[] = [];
        const sessionsToPlace = [...sessions];
        
        while (sessionsToPlace.length > 0) {
            const session = sessionsToPlace.shift()!;
            const chosen = this.findBestSlotForSession(dayCtxs, session);
            
            if (chosen) {
                const block = this.sessionToBlock(userId, session, chosen);
                createdGoalBlocks.push(block);

                const dc = dayCtxs.find((d) => d.date === block.date)!;
                dc.placed.push(block);
                dc.blocked.push(this.blockToSlot(block)); // treat placed block as occupied for later placements
            } else if (session.minutes > 20) {
                // If a large session doesn't fit, split it and try to place the pieces to ensure total minutes are met
                const firstHalf = Math.floor(session.minutes / 2);
                sessionsToPlace.push({ ...session, minutes: firstHalf });
                sessionsToPlace.push({ ...session, minutes: session.minutes - firstHalf });
            } else {
                // Could not place even a small slice, move on but this is rare
                continue;
            }
        }

        // 7) Build patch
        const patch: Patch = this.buildPatch({
            userId,
            mode,
            anchorsPersisted: anchors,
            existingPersisted: existing,
            createdBlocks: createdGoalBlocks,
            reason: context?.reason ?? mode,
        });

        // 8) Build summary (human-readable + debugging)
        const summary = this.buildSummary(dayCtxs, goals, createdGoalBlocks, weekStartISO);

        // 9) Preview blocks = anchors + meals + created goal blocks (and maybe keep existing if optimise preview)
        const previewBlocks = this.buildPreviewBlocks({
            mode,
            dayCtxs,
            anchorsPersisted: anchors,
            existingPersisted: existing,
            createdGoalBlocks,
        });

        return { previewBlocks, patch, summary };
    }

    // ─────────────────────────────────────────────────────────────
    // Loading
    // ─────────────────────────────────────────────────────────────

    private static async loadProfilePrefs(userId: string, supabase: SupabaseClient): Promise<ProfilePrefs> {
        const { data, error } = await supabase
            .from("profiles")
            .select("timezone,sleep_start,sleep_end,winddown_mins,buffer_minutes,meal_duration_minutes,meals_per_day,weekend_intensity,preferred_workdays,meal_windows,pillar_preferences,energy_level,stress_level,body_preferences")
            .eq("id", userId)
            .single();

        if (error || !data) {
            // Provide sensible defaults if missing
            return {
                timezone: "UTC",
                sleep_start: "23:00",
                sleep_end: "07:00",
                winddown_mins: 30,
                buffer_minutes: 10,
                meal_duration_minutes: 30,
                meals_per_day: 3,
                weekend_intensity: "normal",
                preferred_workdays: [0, 1, 2, 3, 4, 5, 6],
                meal_windows: {
                    breakfast: { start: "07:00", end: "10:00" },
                    lunch: { start: "12:00", end: "15:00" },
                    dinner: { start: "18:30", end: "21:30" },
                },
                bio: { energy: 'medium', stress: 'low', chronotype: 'bear' }
            };
        }

        const mapLevel = (val: number | null): 'low' | 'medium' | 'high' => {
            if (!val) return 'medium';
            if (val <= 3) return 'low';
            if (val >= 8) return 'high';
            return 'medium';
        };

        return {
            timezone: data.timezone ?? "UTC",
            sleep_start: data.sleep_start ?? "23:00",
            sleep_end: data.sleep_end ?? "07:00",
            winddown_mins: data.winddown_mins ?? 30,
            buffer_minutes: data.buffer_minutes ?? 10,
            meal_duration_minutes: data.meal_duration_minutes ?? 30,
            meals_per_day: (data.meals_per_day ?? 3) as 2 | 3,
            weekend_intensity: (data.weekend_intensity ?? "normal") as WeekendIntensity,
            preferred_workdays: (data.preferred_workdays ?? [0, 1, 2, 3, 4, 5, 6]) as number[],
            meal_windows: data.meal_windows ?? {
                breakfast: { start: "07:00", end: "10:00" },
                lunch: { start: "12:00", end: "15:00" },
                dinner: { start: "18:30", end: "21:30" },
            },
            pillar_preferences: data.pillar_preferences ?? undefined,
            // New Bio-Context
            bio: {
                energy: mapLevel(data.energy_level),
                stress: mapLevel(data.stress_level),
                chronotype: (data.body_preferences as any)?.chronotype || 'bear'
            }
        };
    }

    private static async loadActiveGoals(userId: string, supabase: SupabaseClient): Promise<Goal[]> {
        const { data, error } = await supabase
            .from("goals")
            .select("id,title,pillar,minutes_per_day,days_per_week,priority,energy,preferred_windows,status")
            .eq("user_id", userId)
            .eq("status", "active");

        if (error) throw error;
        return (data ?? []).map((g: any) => ({
            ...g,
            preferred_windows: Array.isArray(g.preferred_windows) ? g.preferred_windows : []
        })) as Goal[];
    }

    private static async loadAnchorsForWeek(userId: string, weekStartISO: string, supabase: SupabaseClient) {
        const { start, end } = this.weekStartEnd(weekStartISO);

        const { data, error } = await supabase
            .from("schedule_blocks")
            .select("*")
            .eq("user_id", userId)
            // Anchor = commitment_id IS NOT NULL OR is_locked = TRUE
            .or("commitment_id.not.is.null,is_locked.eq.true")
            .gte("date", start)
            .lte("date", end);

        if (error) throw error;
        return (data ?? []).map((r: any) => this.normalizeRow(r, userId)) as Omit<ScheduleBlockRow, "id">[];
    }

    private static async loadScheduleBlocksForWeek(userId: string, weekStartISO: string, supabase: SupabaseClient) {
        const { start, end } = this.weekStartEnd(weekStartISO);
        const { data, error } = await supabase
            .from("schedule_blocks")
            .select("*")
            .eq("user_id", userId)
            .gte("date", start)
            .lte("date", end);

        if (error) throw error;
        return (data ?? []).map((r: any) => ({ ...r })) as ScheduleBlockRow[];
    }

    // ─────────────────────────────────────────────────────────────
    // Week dates
    // ─────────────────────────────────────────────────────────────

    private static buildWeekDates(weekStartISO: string): string[] {
        // weekStartISO should be YYYY-MM-DD
        const [y, m, d] = weekStartISO.split("-").map(Number);
        const base = new Date(Date.UTC(y, m - 1, d));
        const dates: string[] = [];
        for (let i = 0; i < 7; i++) {
            const dt = new Date(base);
            dt.setUTCDate(base.getUTCDate() + i);
            dates.push(dt.toISOString().slice(0, 10));
        }
        return dates;
    }

    private static weekStartEnd(weekStartISO: string) {
        const dates = this.buildWeekDates(weekStartISO);
        return { start: dates[0], end: dates[6] };
    }

    // ─────────────────────────────────────────────────────────────
    // Blocking helpers (sleep, meals, anchors)
    // ─────────────────────────────────────────────────────────────

    private static blockSleep(dc: DayContext) {
        const { sleep_start, sleep_end, winddown_mins } = dc.prefs;

        // Sleep crosses midnight? likely yes. We'll block:
        // - winddown before sleep_start
        // - sleep from sleep_start -> 24:00
        // - sleep from 00:00 -> sleep_end
        // - plus 45 min pre-bed quiet buffer inside winddown window (already covered if winddown >=45)
        const sleepStartMin = this.hhmmToMin(sleep_start);
        const sleepEndMin = this.hhmmToMin(sleep_end);

        // Winddown starts:
        const winddownStartMin = Math.max(0, sleepStartMin - winddown_mins);
        const quietBufferMin = 45;
        const preBedQuietStart = Math.max(0, sleepStartMin - quietBufferMin);

        // Block winddown (semi-hard/hard depending on your philosophy). Treat as hard.
        dc.blocked.push({ date: dc.date, startMin: winddownStartMin, endMin: sleepStartMin });

        // Block pre-bed quiet (subset, redundant but helpful to label later if you want)
        dc.blocked.push({ date: dc.date, startMin: preBedQuietStart, endMin: sleepStartMin });

        // Block sleep
        if (sleepEndMin < sleepStartMin) {
            // sleep crosses midnight: block [sleepStart..1440] on this date
            dc.blocked.push({ date: dc.date, startMin: sleepStartMin, endMin: 1440 });
            // and block [0..sleepEnd] on next day; handled when next day's dc runs:
            // We'll add a helper in placement if needed. For skeleton: also block early day until sleepEnd.
            dc.blocked.push({ date: dc.date, startMin: 0, endMin: sleepEndMin }); // NOTE: simplistic; refine with timezone/day boundaries
        } else {
            // sleep within same day
            dc.blocked.push({ date: dc.date, startMin: sleepStartMin, endMin: sleepEndMin });
        }

        // Optionally create visible sleep block in preview (not required in MVP)
    }

    private static placeMealsForWeek(dayCtxs: DayContext[]): Omit<ScheduleBlockRow, "id">[] {
        const out: Omit<ScheduleBlockRow, "id">[] = [];
        for (const dc of dayCtxs) {
            const meals = dc.prefs.meals_per_day;
            const duration = dc.prefs.meal_duration_minutes;
            const buffer = dc.prefs.buffer_minutes;
            const wakeMin = this.hhmmToMin(dc.prefs.sleep_end);

            // A2 Meal Rationalization
            // Breakfast: wake+30m to wake+120m
            if (meals === 3 && dc.prefs.meal_windows.breakfast) {
                const win = dc.prefs.meal_windows.breakfast;
                const bioStart = wakeMin + 30;
                const bioEnd = wakeMin + 120;

                // Use intersection of bio window and explicit preference
                const searchStart = Math.max(bioStart, this.hhmmToMin(win.start));
                const searchEnd = Math.min(bioEnd, this.hhmmToMin(win.end));

                const slot = this.findBestMealSlot(dc, searchStart, searchEnd, duration);
                if (slot) {
                    out.push(this.makeMealBlock(dc, "Breakfast", slot.startMin, slot.endMin));
                    // Add buffer to blocked so nothing is scheduled here, but don't create a visible block
                    if (!this.overlapsAny(dc.blocked, { date: dc.date, startMin: slot.endMin, endMin: slot.endMin + buffer })) {
                        dc.blocked.push({ date: dc.date, startMin: slot.endMin, endMin: slot.endMin + buffer });
                    }
                }
            }

            // Lunch: 12:30–14:30 whenever possible
            {
                const startSearch = this.hhmmToMin("12:30");
                const endSearch = this.hhmmToMin("14:30");
                const slot = this.findBestMealSlot(dc, startSearch, endSearch, duration);
                if (slot) {
                    out.push(this.makeMealBlock(dc, "Lunch", slot.startMin, slot.endMin));
                    if (!this.overlapsAny(dc.blocked, { date: dc.date, startMin: slot.endMin, endMin: slot.endMin + buffer })) {
                        dc.blocked.push({ date: dc.date, startMin: slot.endMin, endMin: slot.endMin + buffer });
                    }
                }
            }

            // Dinner: 19:30 onwards, every single day no matter what
            {
                const startSearch = this.hhmmToMin("19:30");
                const endSearch = 1440; // up to midnight
                let slot = this.findBestMealSlot(dc, startSearch, endSearch, duration);
                
                // If STILL not found (fully blocked by anchors? Very unlikely, but force it to ensure it's always present)
                if (!slot) {
                    slot = { date: dc.date, startMin: startSearch, endMin: startSearch + duration };
                }

                out.push(this.makeMealBlock(dc, "Dinner", slot.startMin, slot.endMin));
                if (!this.overlapsAny(dc.blocked, { date: dc.date, startMin: slot.endMin, endMin: slot.endMin + buffer })) {
                    dc.blocked.push({ date: dc.date, startMin: slot.endMin, endMin: slot.endMin + buffer });
                }
            }
        }
        return out;
    }

    private static findBestMealSlot(dc: DayContext, startWindow: number, endWindow: number, duration: number): TimeSlot | null {
        // Simple linear scan to find first fit in window that doesn't overlap anchors
        // Step 15m for meals
        const step = 15;
        for (let s = startWindow; s + duration <= endWindow; s += step) {
            const slot = { date: dc.date, startMin: s, endMin: s + duration };
            if (!this.overlapsAny(dc.blocked, slot)) {
                return slot;
            }
        }

        // Fallback: If no slot in preferred window, try slightly outside? 
        // For MVP A2, strict adherence. If blocked, we might fail to place meal (which is bad), 
        // but overlapping anchor is worse (rule: "never overlap anchors").
        // We log warning? 
        return null;
    }

    private static makeMealBlock(dc: DayContext, label: string, startMin: number, endMin: number): Omit<ScheduleBlockRow, "id"> {
        return {
            user_id: "TEMP",
            date: dc.date,
            start_time: this.minToHHMM(startMin),
            end_time: this.minToHHMM(endMin),
            title: label,
            block_type: "meal",
            status: "planned",
            is_fixed: true,
            commitment_id: null,
            goal_id: null,
            pillar: null,
            energy_cost: "light",
            source: "meal",
            is_locked: true,
            meta: { kind: "meal" },
        };
    }

    private static makeBufferBlock(dc: DayContext, label: string, startMin: number, endMin: number): Omit<ScheduleBlockRow, "id"> {
        return {
            user_id: "TEMP",
            date: dc.date,
            start_time: this.minToHHMM(startMin),
            end_time: this.minToHHMM(endMin),
            title: label,
            block_type: "buffer",
            status: "planned",
            is_fixed: true,
            commitment_id: null,
            goal_id: null,
            pillar: null,
            energy_cost: "light",
            source: "planner",
            is_locked: true,
            meta: { kind: "buffer" },
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Distribution + sessions
    // ─────────────────────────────────────────────────────────────

    private static computeWeeklyDistribution(dayCtxs: DayContext[], goals: Goal[]) {
        // A3 Weekend Logic Fix
        const byDay: Record<string, { targetMinutes: number }> = {};

        // Calculate total weekly demand per goal
        const totalWeeklyDemand = goals.reduce((acc, g) => acc + (g.minutes_per_day * (g.days_per_week ?? 7)), 0);

        // Determine active days based on weekend intensity
        const schedulePlan: { date: string; isWeekend: boolean; weight: number }[] = [];

        for (const dc of dayCtxs) {
            const dow = this.dayOfWeek(dc.date);
            const isWeekend = dow === 0 || dow === 6;
            let weight = 1.0;

            if (isWeekend) {
                // Ensure weekend activity by providing a healthy weight even if 'off' or 'light'
                if (dc.prefs.weekend_intensity === 'off') weight = 0.8;
                else if (dc.prefs.weekend_intensity === 'light') weight = 0.9;
                else weight = 1.0;
            }

            schedulePlan.push({ date: dc.date, isWeekend, weight });
        }

        const totalWeight = schedulePlan.reduce((acc, p) => acc + p.weight, 0);

        // Distribute minutes proportional to weight
        for (const plan of schedulePlan) {
            const ratio = totalWeight > 0 ? plan.weight / totalWeight : 0;
            byDay[plan.date] = { targetMinutes: Math.round(totalWeeklyDemand * ratio) };
        }

        return { byDay };
    }

    private static goalMinutesPerDay(g: Goal): number {
        const dpw = g.days_per_week ?? 7;
        // if dpw < 7, convert to average per day
        return Math.round((g.minutes_per_day * dpw) / 7);
    }

    private static buildGoalSessions(goals: Goal[], distribution: any, reduceIntensity: boolean) {
        // Convert goals to sessions; skeleton emits simple sessions list.
        type Session = {
            goalId: string;
            title: string;
            pillar: Pillar;
            priority: Priority;
            energy: Energy;
            minutes: number;
            preferred?: ("morning" | "afternoon" | "evening")[];
            date?: string; // Constraint: specific date
        };

        const sessions: Session[] = [];
        // Helper to get dates from distribution keys which are date strings
        const sortedDates = Object.keys(distribution.byDay).sort();

        // Create buckets
        const dailyBuckets: Record<string, number> = {};
        for (const d of sortedDates) dailyBuckets[d] = distribution.byDay[d].targetMinutes;

        const sortedGoals = [...goals].sort((a, b) => this.priorityScore(b.priority) - this.priorityScore(a.priority));

        for (const g of sortedGoals) {
            let weeklyMinutesRemaining = g.minutes_per_day * (g.days_per_week ?? 7);
            if (reduceIntensity) weeklyMinutesRemaining *= 0.8;

            let pass = 0;
            // Loop until we schedule all minutes, allowing up to 10 passes to heavily overcrowd if necessary (especially on weekends)
            while (weeklyMinutesRemaining > 0 && pass < 10) {
                pass++;
                let madeProgress = false;
                
                // Distribute across days with available bucket space
                for (const date of sortedDates) {
                    if (weeklyMinutesRemaining <= 0) break;
                    
                    // On the first pass, strictly respect the dailyBucket target minutes
                    if (pass === 1 && dailyBuckets[date] <= 0) continue;

                    // On passes > 1, prioritize days that have FEWER anchors (like weekends)
                    // We don't have anchor info here easily, but the placement logic will naturally fail on full days and succeed on empty days
                    
                    // Allow blocks to be larger to ensure we hit the goals, up to 4 hours or the daily goal chunk
                    const sessionLen = Math.min(240, Math.max(g.minutes_per_day, 60), weeklyMinutesRemaining);

                    if (sessionLen <= 0) continue;

                    // Add session
                    sessions.push({
                        goalId: g.id,
                        title: g.title,
                        pillar: g.pillar,
                        priority: g.priority,
                        energy: (g.energy ?? "medium") as Energy,
                        minutes: sessionLen,
                        preferred: (Array.isArray(g.preferred_windows) ? g.preferred_windows : []) as any,
                        date: date
                    });

                    weeklyMinutesRemaining -= sessionLen;
                    dailyBuckets[date] -= sessionLen;
                    madeProgress = true;
                }
                
                if (!madeProgress) break; // Could not allocate any more minutes (all days failed to take a chunk)
            }
        }

        // Sort by priority high->low
        sessions.sort((a, b) => this.priorityScore(b.priority) - this.priorityScore(a.priority));
        return sessions;
    }

    private static priorityScore(p: Priority): number {
        return p === "high" ? 3 : p === "medium" ? 2 : 1;
    }

    // ─────────────────────────────────────────────────────────────
    // Slot finding + scoring
    // ─────────────────────────────────────────────────────────────

    private static findBestSlotForSession(dayCtxs: DayContext[], session: any): TimeSlot | null {
        // Skeleton: find first available slot in preferred window.
        // Final: compute all candidates and score them.
        const candidates: TimeSlot[] = [];

        // If session has a date constraint, only look at that day.
        const targetCtxs = session.date
            ? dayCtxs.filter(d => d.date === session.date)
            : dayCtxs;

        for (const dc of targetCtxs) {
            const daySlots = this.enumerateFreeSlots(dc, session.minutes);
            for (const slot of daySlots) {
                candidates.push(slot);
            }
        }

        if (candidates.length === 0) return null;

        let best: { slot: TimeSlot; score: number } | null = null;
        for (const slot of candidates) {
            const dc = dayCtxs.find((d) => d.date === slot.date)!;
            const score = this.scoreSlot(session, slot, dc);
            if (!best || score > best.score) best = { slot, score };
        }

        return best?.slot ?? null;
    }

    private static enumerateFreeSlots(dc: DayContext, minutesNeeded: number): TimeSlot[] {
        // Very simple: scan the active day window from wake to (sleep_start - 45) with 5-min steps
        const wakeMin = this.hhmmToMin(dc.prefs.sleep_end);
        const endMin = Math.max(0, this.hhmmToMin(dc.prefs.sleep_start) - 45);

        const step = 5;
        const slots: TimeSlot[] = [];
        for (let s = wakeMin; s + minutesNeeded <= endMin; s += step) {
            const e = s + minutesNeeded;
            if (!this.overlapsAny(dc.blocked, { date: dc.date, startMin: s, endMin: e })) {
                slots.push({ date: dc.date, startMin: s, endMin: e });
            }
        }
        return slots;
    }

    private static scoreSlot(session: any, slot: TimeSlot, dc: DayContext): number {
        // A4 Pillar Spacing Engine + Phase 5 Bio-Injection
        let score = 0;
        const bio = dc.prefs.bio;

        // 1. Basic Availability (Binary - explicitly not checked here as slots are free)

        // 2. Pillar Alternation & Stacking
        // Find last placed block before this slot
        const placementStart = slot.startMin;
        const previousBlocks = dc.placed.filter(b => this.hhmmToMin(b.end_time) <= placementStart);
        // Sort by end time desc
        const sortedPrev = previousBlocks.sort((a, b) => this.hhmmToMin(b.end_time) - this.hhmmToMin(a.end_time));
        const last = sortedPrev[0];

        if (last && last.pillar) {
            const gap = placementStart - this.hhmmToMin(last.end_time);

            if (last.pillar === session.pillar) {
                // Same pillar penalty
                if (gap === 0) score -= 1000; // Back-to-back same pillar (unless impossible) - Strong penalty
                else if (gap < 120) score -= 50; // Within 2h
            } else {
                // Alternation Bonus
                const flow: Record<string, string> = { mind: 'body', body: 'craft', craft: 'mind' };
                if (flow[last.pillar as string] === session.pillar) score += 20;
                else score += 10; // Still different, good
            }
        }

        // 3. Energy / Time of Day / Chronotype (Bio-Context)
        const startHour = Math.floor(slot.startMin / 60);

        // A. Chronotype Matching
        const isLark = bio.chronotype === 'early_bird' || bio.chronotype === 'lark';
        const isOwl = bio.chronotype === 'night_owl' || bio.chronotype === 'owl';
        const isWolf = bio.chronotype === 'wolf'; // Late waker/peaker, distinct from pure owl
        const isBear = bio.chronotype === 'bear' || !bio.chronotype; // Default

        if (isLark && startHour >= 6 && startHour < 11) score += 40; // Peak Morning
        if (isLark && startHour >= 19) score -= 50; // Anti-Peak Late

        if (isBear && startHour >= 9 && startHour < 14) score += 30; // Mid-Day
        if (isBear && startHour >= 15 && startHour < 18) score += 20; // Second wind

        if (isWolf && startHour >= 13 && startHour < 20) score += 40; // Late Peak
        if (isWolf && startHour < 12) score -= 50; // Anti-Peak Morning

        if (isOwl && startHour >= 18 && startHour < 24) score += 50; // Evening Peak
        if (isOwl && startHour < 12) score -= 50; // Anti-Peak Morning

        // B. Personal Energy State Compatibility
        // If user is currently LOW energy, heavily penalize HIGH energy tasks
        if (bio.energy === 'low') {
            if (session.energy === 'heavy') score -= 500; // Avoid burnout logic
            else if (session.energy === 'medium') score -= 100;
            else if (session.energy === 'low') score += 100; // Boost recovery tasks
        } else if (bio.energy === 'high') {
            if (session.energy === 'heavy') score += 50; // Strike while iron hot
        }

        // C. Stress Regulation
        // If user is HIGH stress, avoid HIGH priority/intense work or dense packing
        if (bio.stress === 'high') {
            if (session.priority === 'high' || session.energy === 'heavy') score -= 150;
            if (session.pillar === 'body' || session.pillar === 'mind') score += 50; // Encourage grounding
        }

        // D. General Time of Day Penalties
        // Heavy energy blocks after 8pm (20:00 = 1200 min) -> strong penalty unless Owl
        if (!isOwl && session.energy === 'heavy' && slot.endMin > 1200) {
            score -= 200;
        }

        // Preferred Windows
        const tod = this.timeOfDay(slot.startMin);
        if (session.preferred?.includes(tod)) score += 50;

        // 4. Priority
        score += this.priorityScore(session.priority) * 10;

        // 5. Weekend Intensity Check
        const dow = this.dayOfWeek(slot.date);
        const isWeekend = dow === 0 || dow === 6;
        if (dc.prefs.weekend_intensity === "off" && isWeekend) score -= 100; // Drastically reduced penalty to allow activity

        return score;
    }

    private static timeOfDay(min: number): "morning" | "afternoon" | "evening" {
        if (min < 12 * 60) return "morning";
        if (min < 17 * 60) return "afternoon";
        return "evening";
    }

    // ─────────────────────────────────────────────────────────────
    // Patch building + preview
    // ─────────────────────────────────────────────────────────────

    private static buildPatch(opts: {
        userId: string;
        mode: Mode;
        anchorsPersisted: Omit<ScheduleBlockRow, "id">[];
        existingPersisted: ScheduleBlockRow[];
        createdBlocks: Omit<ScheduleBlockRow, "id">[];
        reason: string;
    }): Patch {
        const changes: PatchChange[] = [];

        // PLAN: create new goal blocks (meals/anchors may already exist)
        // Skeleton assumes meals are created fresh; in real impl you may upsert meals too.
        for (const b of opts.createdBlocks) {
            changes.push({ op: "create_event", payload: { ...b, user_id: opts.userId } });
        }

        // In Plan mode, delete existing non-locked blocks to avoid duplication
        if (opts.mode === 'plan') {
            for (const existing of opts.existingPersisted) {
                if (!existing.is_locked && !existing.commitment_id && existing.id) {
                    changes.push({ op: "delete_event", event_id: existing.id });
                }
            }
        }

        return { changes, reason: opts.reason };
    }

    private static buildPreviewBlocks(opts: {
        mode: Mode;
        dayCtxs: DayContext[];
        anchorsPersisted: Omit<ScheduleBlockRow, "id">[];
        existingPersisted: ScheduleBlockRow[];
        createdGoalBlocks: Omit<ScheduleBlockRow, "id">[];
    }): Omit<ScheduleBlockRow, "id">[] {
        // In plan mode: show anchors + meals + new goal blocks.
        // In optimise mode: show existing + moved etc. (not implemented in skeleton).
        const preview: Omit<ScheduleBlockRow, "id">[] = [];
        for (const dc of opts.dayCtxs) {
            for (const b of dc.placed) {
                preview.push(b);
            }
        }
        for (const gb of opts.createdGoalBlocks) preview.push(gb);
        return preview.map((b) => ({ ...b, user_id: b.user_id === "TEMP" ? "REPLACE" : b.user_id })) as any;
    }

    private static buildSummary(dayCtxs: DayContext[], goals: Goal[], created: Omit<ScheduleBlockRow, "id">[], weekStartISO: string): WeekSummary {
        const { start, end } = this.weekStartEnd(weekStartISO);
        const plannedByPillar: Record<Pillar, number> = { mind: 0, body: 0, craft: 0 };
        let total = 0;

        for (const b of created) {
            const mins = this.hhmmToMin(b.end_time) - this.hhmmToMin(b.start_time);
            total += mins;
            if (b.pillar) plannedByPillar[b.pillar] += mins;
        }

        const capacityByDay: Record<string, number> = {};
        const demandByDay: Record<string, number> = {};
        for (const dc of dayCtxs) {
            capacityByDay[dc.date] = this.estimateCapacity(dc);
            demandByDay[dc.date] = goals.reduce((acc, g) => acc + this.goalMinutesPerDay(g), 0);
        }

        return {
            week_start: start,
            week_end: end,
            planned_minutes_total: total,
            planned_minutes_by_pillar: plannedByPillar,
            capacity_minutes_by_day: capacityByDay,
            demand_minutes_by_day: demandByDay,
            notes: [],
        };
    }

    private static estimateCapacity(dc: DayContext): number {
        const wakeMin = this.hhmmToMin(dc.prefs.sleep_end);
        const endMin = Math.max(0, this.hhmmToMin(dc.prefs.sleep_start) - 45);
        const active = Math.max(0, endMin - wakeMin);
        const blocked = dc.blocked.reduce((acc, b) => acc + (b.endMin - b.startMin), 0);
        return Math.max(0, active - blocked);
    }

    // ─────────────────────────────────────────────────────────────
    // Session -> Block
    // ─────────────────────────────────────────────────────────────

    private static sessionToBlock(userId: string, session: any, slot: TimeSlot): Omit<ScheduleBlockRow, "id"> {
        return {
            user_id: userId,
            date: slot.date,
            start_time: this.minToHHMM(slot.startMin),
            end_time: this.minToHHMM(slot.endMin),
            title: session.title,
            block_type: "goal",
            status: "planned",
            is_fixed: false,
            commitment_id: null,
            goal_id: session.goalId,
            pillar: session.pillar,
            energy_cost: session.energy,
            source: "planner",
            is_locked: false,
            meta: { reason: "week_orchestrator", pillar: session.pillar },
        };
    }

    private static blockToSlot(b: Omit<ScheduleBlockRow, "id">): TimeSlot {
        return {
            date: b.date,
            startMin: this.hhmmToMin(b.start_time),
            endMin: this.hhmmToMin(b.end_time),
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Time utils
    // ─────────────────────────────────────────────────────────────

    private static hhmmToMin(hhmm: string): number {
        const [h, m] = hhmm.split(":").map(Number);
        return h * 60 + m;
    }

    private static minToHHMM(min: number): string {
        const h = Math.floor(min / 60) % 24;
        const m = min % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    private static clampToWindow(preferredStartMin: number, winStart: string, winEnd: string, durationMin: number): number {
        const a = this.hhmmToMin(winStart);
        const b = this.hhmmToMin(winEnd);
        // Ensure start within [a, b-duration]
        return Math.min(Math.max(preferredStartMin, a), Math.max(a, b - durationMin));
    }

    private static overlapsAny(blocked: TimeSlot[], slot: TimeSlot): boolean {
        for (const b of blocked) {
            if (b.date !== slot.date) continue;
            const overlap = Math.max(0, Math.min(b.endMin, slot.endMin) - Math.max(b.startMin, slot.startMin));
            if (overlap > 0) return true;
        }
        return false;
    }

    private static dayOfWeek(dateISO: string): number {
        const [y, m, d] = dateISO.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dt.getUTCDay(); // 0 Sun .. 6 Sat
    }

    // ─────────────────────────────────────────────────────────────
    // Normalization
    // ─────────────────────────────────────────────────────────────

    private static normalizeRow(r: any, userId: string): Omit<ScheduleBlockRow, "id"> {
        return {
            user_id: r.user_id ?? userId,
            date: r.date,
            start_time: r.start_time,
            end_time: r.end_time,
            title: r.title,
            block_type: r.block_type ?? "anchor",
            status: r.status ?? "planned",
            is_fixed: r.is_fixed ?? true,
            commitment_id: r.commitment_id ?? null,
            goal_id: r.goal_id ?? null,
            pillar: r.pillar ?? null,
            energy_cost: r.energy_cost ?? "medium",
            source: r.source ?? "anchor",
            is_locked: r.is_locked ?? true,
            meta: r.meta ?? {},
        };
    }
}
