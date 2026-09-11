# PROMPT 27: The generator must honour paused goals, and must know what capacity actually is

Prerequisite for Prompt 28. Two correctness fixes in the planner, plus one new shared function that Prompt 28 depends on.

---

## §1. Paused goals are invisible to the planner

Confirmed: `is_paused` **does not appear anywhere** in `src/lib/calendar/`. The planner has no concept of a paused goal.

`src/lib/calendar/context-builder.ts:212-216`:

```ts
db.from('goals')
    .select('id, title, pillar, category, importance, minutes_per_day, days_per_week, energy_demand, status, ai_strategy, preferred_windows')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(20),
```

`is_paused` is neither selected nor filtered. And the mapper hardcodes the result:

`context-builder.ts:319` → `is_active: true,`

The pause proposal sets `{ is_paused: true }` and leaves `status` as `'active'` (`execute/route.ts:73`), so a paused goal passes `.eq('status','active')` untouched and gets scheduled. Accepting a pause in Automatic does nothing to next week.

Note the rest of the app already gets this right — `api/goals/route.ts:65` (`if (g.status === 'paused' || g.is_paused) return;`) and `api/goals/strategy/route.ts:19` (`.eq('is_paused', false)`). The planner is the one place that doesn't.

### The fix

1. **Select `is_paused`** and filter it out at the query:
   ```ts
   .eq('status', 'active')
   .or('is_paused.is.null,is_paused.eq.false')
   ```
   Handle `null` explicitly — existing rows predating the column will have `null`, and `.eq('is_paused', false)` alone would silently exclude every one of them and empty the user's whole plan. **Verify how many existing goals have `is_paused = null` before choosing the predicate.**

2. **Stop hardcoding `is_active: true`** at line 319. Derive it: `is_active: !g.is_paused && g.status === 'active'`.

3. **Paused stays paused.** Nothing in the weekly review, the planner, or the apply path may ever clear `is_paused`. Only an explicit user action on the goals page resumes a goal. Grep for any write of `is_paused: false` and confirm each one is user-initiated.

4. **Check the goals page surfaces it.** A paused goal must be visibly paused, with a Resume control. If the goals list doesn't distinguish paused goals today, add that — a goal that silently stops being scheduled with no visible reason is worse than one that was never paused. Report what you found.

5. `api/goals/route.ts:282` already runs cleanup when a goal is paused or archived. Read it and confirm what it does to existing future blocks, and that the weekly-review pause path (which goes through `PatchService`, not this route) gets equivalent treatment. If pausing via the review leaves orphaned blocks in next week, fix that — but note `plan_next_week` regenerates the window anyway, so confirm before adding anything.

## §2. Re-measure the zero-block report before treating it as a bug

The observation was *"Reading at 30m×5d and Gym at 60m×3d produced 3 Gym blocks and zero Reading blocks"* — **on a test where both goals were paused.** Fix §1 first, then re-run with both goals **active**. The under-generation may simply be the pause bug in another costume.

If it persists with active goals, here is the ranked suspect list, already traced. Work down it and report which one it actually is rather than guessing:

1. **Goal-major iteration against global per-day caps.** `plan-week.ts:927` loops `for (const goal of sortedGoals)`, but `getDayCapacity` (`:1065`) is a **global per-day budget across all goals**. The first goal processed can consume the whole day's block allowance before the second is ever tried. Caps relax only at `pass >= 5` (`:1019`).
2. **Sort order puts Gym first.** `plan-week.ts:781-810` sorts by progress-behind → importance → **energy demand, high first**. Gym is `high` energy `body`; Reading is not. Combined with (1) this is the most likely cause.
3. **Minimum block floor.** `:1075-1076` — `minBlockFloor = Math.min(30, targetMinsPerDay)`; a 30 min/day goal needs a **contiguous** 30-minute window. `:1265` breaks below it, and the split path hardcodes a separate `MIN_BLOCK = 30` at `:1223`.
4. **Energy-phase filtering fragments windows.** `filterWindowsByEnergyCompat` (`practical-constraints.ts:70`) doesn't only filter — `splitWindowByPhases` cuts windows at phase boundaries, so a 90-minute window can return as three sub-30-minute pieces that all then fail (3). Relaxed only at `pass >= 2`.
5. **Body-pillar exclusivity.** `:1037-1049` — one body block per day globally, plus `bodyGoalDayQuota` lanes at `:869-925`.
6. **The top-up pass is gated off.** `:1362` — `if (ctx.capacity.is_overcommitted === false)`. Strict `=== false`, so `true` **or `undefined`** skips the entire residual mop-up.

Add a **per-goal placement log** at the end of `generateWeekPlan`: for each goal, target minutes, minutes placed, blocks placed, and — when short — which of the above caused the last rejection. Right now a goal that gets nothing produces no diagnostic at all, which is why this took a manual trace to find.

**Also fix `unscheduled_minutes` being keyed by goal title** (`:1335`, `:1376`, `:1456`). Two goals with the same title collide and mask each other. Key it by `goal_id`. Prompt 28 depends on this map being trustworthy.

**And fix the silent skip at `:933`** — `if (remainingWeeklyMins <= 0) continue;` drops a goal with **no `unscheduled_minutes` entry**, making it invisible in the variant stats. Record every skipped goal with its reason.

## §3. `days_per_week` means two different things

`days_per_week` is **never a scheduling constraint** inside `plan-week.ts`. Its only use is as a multiplier for the weekly budget (`computeRemainingWeeklyMins`, `:308-324`). The generator is free to spread that budget over any number of days.

But it **is** enforced at write time — `patch-service.ts:136`:

```ts
if (activeDays.size > weeklyDaysLimit) throw new Error(`Weekly limit reached: ...`)
```

So the generator can legitimately produce a 6-day spread for a `days_per_week: 5` goal and have those blocks rejected on insert. Decide which is authoritative and make both agree. **Recommendation: make `days_per_week` a real constraint in the generator** — it is what the user set on the goals page, and Prompt 28 uses it as a redistribution lever, so it has to mean something. Cap the number of distinct days a goal is placed on.

Note the weekly-review path inserts directly in `plan_next_week` and does **not** go through `validateGoalConstraints`, so it currently has no such cap at all. That asymmetry is its own bug.

## §4. A real capacity number

`context-builder.ts:346-361` computes one, but it is wrong and advisory:

```ts
const bufferHoursDaily = dailyAwakeHours * 0.1; // 10% buffer
const weeklyAvailable = (dailyAwakeHours - windDownHoursDaily - bufferHoursDaily) * 7 - weeklyCommittedHours;
```

**Meals and morning routine are not subtracted at all**, and the buffer is a flat 10% guess rather than the real per-block buffers. It is consumed in exactly two places: a warning string in `api/calendar/plan-week/route.ts:95`, and the top-up gate at `plan-week.ts:1362`. Nothing sizes the plan against it.

Prompt 28 needs this number to be honest, because it is the sole justification for ever asking a user to reduce a target.

### Create `src/lib/scheduling/capacity.ts`

One exported function, used by the generator, the plan-week route, and Prompt 28's proposals. No duplicate implementations.

```ts
export interface WeekCapacity {
    awakeMinsPerWeek: number;
    sleepMins: number;
    morningRoutineMins: number;
    windDownMins: number;
    mealMins: number;
    commitmentMins: number;
    bufferMins: number;
    availableMins: number;      // what is genuinely schedulable
    targetedMins: number;       // Σ active goals' minutes_per_day × days_per_week
    headroomMins: number;       // availableMins - targetedMins
    isOvercommitted: boolean;   // headroomMins < 0
}
```

Compute it from the same profile fields the generator already uses, so the number describes the same week the generator is building:

- **Sleep** — `sleep_start`/`sleep_end` with the midnight wrap already handled at `context-builder.ts:346-348`. Reuse that arithmetic, don't rewrite it.
- **Morning routine** — `morning_routine_mins`, × 7. Currently missing.
- **Wind-down** — `wind_down_mins`, × 7.
- **Meals** — `meals_per_day` × the real durations the generator places: breakfast 30, lunch 45, dinner 45 (`plan-week.ts:556-587`). Don't invent an average; use what actually gets scheduled. Currently missing entirely.
- **Commitments** — as now, duration × `days_of_week.length`.
- **Buffers** — the real figure, not 10%. `getBufferMinutes` (`plan-week.ts:95-112`) gives per-block buffer by mode (momentum 0 / balanced 15 / recovery 60–120). Estimate blocks as `Σ goals(days_per_week)` and multiply. State the assumption in a comment.

**Exclude paused goals from `targetedMins`** — after §1 they aren't scheduled, so counting them would fabricate an overcommitment that doesn't exist.

Then replace the `context-builder.ts` block with a call to this function, keeping `ctx.capacity` populated for existing consumers. Fix the `=== false` gate at `plan-week.ts:1362` to a plain truthiness check while you are there, so an undefined capacity no longer silently disables the top-up pass.

---

## §5. Do not touch

- The block-placement algorithm itself — the window search, the energy-phase model, `resolveAdjacencyBuffer`, the session-pacing rules, `resolveBioBlockOverlap`. §2 is diagnosis and logging; the only behavioural change sanctioned here is §3's day cap.
- `replan_week`, `undoPatch`, `optimise-week-service.ts`.
- `proposals.ts` — that is Prompt 28.
- Anything from Prompts 25 and 26.

---

## Verification (required)

1. `npm run build` passes.
2. **A paused goal gets zero blocks.** Pause one of two active goals, run Automatic, confirm the paused goal appears nowhere in next week and the other is scheduled normally.
3. **Paused stays paused.** After the plan generates, the goal is still `is_paused: true`. Run it twice more and confirm it is never silently resumed.
4. **Goals with `is_paused = null` still schedule.** Report how many such rows exist and confirm none were excluded.
5. **The goals page shows paused state** with a working Resume, and resuming makes the goal schedulable again on the next plan.
6. **Re-run the zero-block case with both goals ACTIVE.** Report blocks placed per goal against target. If Reading still gets zero, name which of §2's six suspects it was, with the log line proving it.
7. **The per-goal placement log exists** and reports target / placed / blocks / reason-if-short for every goal, including goals skipped at `:933`.
8. **`unscheduled_minutes` is keyed by `goal_id`.** Two goals with identical titles both report their own shortfall.
9. **`days_per_week` is honoured** — a `days_per_week: 3` goal is never placed on 4 distinct days, in either the generator or at insert.
10. **Capacity is computed once, in one place.** Print the full `WeekCapacity` breakdown for a real account. Sanity-check it by hand: awake minutes minus everything should leave a number that looks like a plausible number of schedulable hours. If it says 90 hours a week are available, it's wrong.
11. **Meals and morning routine are subtracted.** Compare the new `availableMins` against the old formula and state the difference in hours.
12. **Paused goals are excluded from `targetedMins`.**

---

## Note for the human

The paused-goal bug is a one-line omission with a large blast radius: `context-builder.ts` filters on `status = 'active'`, and pausing a goal only sets `is_paused`, never `status`. Every other part of the app checks `is_paused` correctly — the planner is the sole exception, and it happens to be the part that decides what actually goes in your calendar.

On the zero-Reading report: that test had both goals paused, so it may be the same bug wearing a different hat. Worth re-measuring before treating it as separate. If it does persist, my money is on suspects 1+2 together — the day capacity is a single global budget, goals are processed one at a time, and the sort deliberately puts high-energy goals first. Gym eats the day, Reading finds nothing left, and because the skip at line 933 records nothing, the whole thing is invisible.

The capacity function matters more than it looks. Prompt 28 makes "are we actually out of time?" the *only* justification for asking you to cut a target — so that number has to be real. Right now it omits meals and morning routine entirely and guesses buffers at 10%, which means it currently overstates your free time by several hours a week.
