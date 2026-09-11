# PROMPT 28: Weekly Review protects the user's hours instead of cutting them

**Run Prompt 27 first.** This depends on `WeekCapacity` and on `unscheduled_minutes` being keyed by `goal_id`.

---

## §1. The principle

Every shortfall lever in `proposals.ts` today **reduces the target**. `daysLever` cuts days to match attendance; `timeLever` cuts minutes to match session length. A user who wanted 20 hours and managed 18 gets told to want less.

That is backwards. The hours a user chose are the commitment; the schedule is the variable. **Weekly Review's job is to find a shape that fits the hours, not to shrink the hours to fit the shape.**

The new rule, in order:

1. **Default: keep the weekly total exactly.** Propose a different *shape* — a different split of minutes across days — or a different *placement*. The weekly minutes must be preserved to within rounding.
2. **Reduce a target only when the week genuinely cannot hold it** — when the user's total commitments exceed what is actually schedulable. Not when they merely fell short.
3. **Pause and increase are unchanged.** Two untouched weeks still proposes a pause; beating target with a clean sheet still proposes an increase.

## §2. What "genuinely cannot hold it" means

Two independent tests. **Reduction requires the second one.**

**Test A — the capacity arithmetic.** `WeekCapacity.isOvercommitted` from Prompt 27. Cheap, and a reasonable pre-filter.

**Test B — the scheduler actually failed to place the hours.** Authoritative. `generateWeekPlan` is fully deterministic and synchronous — no AI call, no network, and measured at well under two seconds. So **run it as a dry run** inside the stats route: generate next week's plan for the current goals, don't persist anything, and read `stats.unscheduled_minutes`.

If a goal comes back with unscheduled minutes, the scheduler tried every relaxation pass and still couldn't fit them. *That* is real evidence the week is too full, and it is the only thing that licenses proposing a reduction. A completion ratio is not — it measures what the user did, not what the week could hold.

Cache the dry run per `weekStart` for the request; don't run it twice.

If the dry run throws, **fall back to Test A alone, and if that is also inconclusive, propose no reduction.** Never reduce a target on missing evidence — the failure mode has to be "we didn't suggest a cut" rather than "we cut your goal because a function errored."

## §3. The redistribution levers

Replace the two shrinking levers with shape-preserving ones. In every case `newMinutes × newDays` must equal the old weekly total to within 5 minutes.

**Lever 1 — consolidate.** They missed whole days (`activeDays < daysPerWeek`) but the sessions they did were full length. They can't make that many days; give them fewer, longer ones.

```
newDays  = max(1, activeDays)
newMins  = round(weeklyTarget / newDays)
```
*"You hit 3 of 5 days but finished every session. Same 5 hours over 3 days instead — 100 min a session."*

**Lever 2 — split.** They showed up on every planned day but the sessions ran short (`activeDays >= daysPerWeek`, `completed < target`). The session length is the problem, not the frequency.

```
newDays  = min(7, daysPerWeek + 1 … up to what fits)
newMins  = round(weeklyTarget / newDays)
```
*"You showed up all 3 days but averaged 40 of 60 minutes. Same 3 hours across 5 shorter sessions."*

**Lever 3 — move.** The shape is fine but the placement is wrong. Change `preferred_windows.time_of_day` rather than any target. Use the completion-by-time-of-day data the Productivity Profile already computes (`src/lib/chain/productivity.ts`) — if a goal's blocks complete at 70% in the morning and 20% in the evening, propose moving it to mornings.

`preferred_windows` is already selected in `context-builder.ts:213`, mapped to `preferred_time_of_day` at `:321`, and is in `allowedGoalFields` (`patch-service.ts:1370`), so this needs no new plumbing. **Verify the generator actually honours `preferred_time_of_day`** before shipping this lever — if it's read but unused, say so and drop Lever 3 rather than shipping a proposal that does nothing.

### Constraints on every redistribution

- `newDays` between 1 and 7.
- `newMins >= 20`. Below that the generator's own `minBlockFloor` (`plan-week.ts:1075`) starts rejecting placements, so a split into 15-minute sessions would schedule *worse* than what it replaced.
- Never propose a shape whose `newDays` exceeds what capacity can hold.
- If a computed shape is a no-op, try the next lever before giving up — the fall-through rule from Prompt 25 §3 stays.

## §4. Reduction, when it is warranted

Only when Test B says the scheduler couldn't place the hours.

- Reduce **only by the unplaceable amount**, not down to what the user completed. If 20h was targeted and the scheduler could only place 18h, propose 18h — not the 14h they finished.
- Reduce the **lowest-importance** goal first. If the week is 2h over, take 2h off the least important goal rather than shaving every goal.
- Say why, explicitly: *"Your goals need 32h but only 29h are schedulable after sleep, meals, commitments and recovery. This is the smallest cut that fits."*
- Never reduce below `FLOOR_MINUTES`.

## §5. What the generator already does — don't rebuild it

Before adding scheduling intelligence to Weekly Review, note what `plan-week.ts` and `practical-constraints.ts` already handle, verified:

- **Back-to-back high-energy work** — `resolveAdjacencyBuffer` (`practical-constraints.ts:202-232`) forces a wider gap when `prevEnergy === 'high' && nextGoalEnergy === 'high'`, with a larger floor again after an anchor or across a pillar change.
- **Energy-phase matching** — `computeDayPhases` (`flow-protocol.ts:51-177`) and `filterWindowsByEnergyCompat` restrict high-energy work to peak/rebound windows, chronotype-shifted.
- **Ultradian pacing** — `getDaySessionState` / `requiresSessionBreakGap` (`practical-constraints.ts:134-185`) cap sessions at 90 minutes and force a 30-minute break before a third session.
- **Pre-bed decompression** — `plan-week.ts:1084-1086`.
- **Meal separation for physical work** — `:1102-1104`, +45 min after a meal for `body` or high-energy goals.

So Weekly Review must **not** try to place blocks itself. Its entire influence on placement is the shape it hands the generator, plus `preferred_windows` and the `mode` in the `plan_next_week` payload. Keep it that way — a second scheduler would drift out of agreement with the first, which is exactly what happened between Day Patterns and the Chain.

One thing worth adding at the week level: if the dry run shows the week is tight but placeable, pass `mode: 'momentum'` instead of `'balanced'` in the `plan_next_week` payload — momentum uses zero buffers and a higher per-day cap, which buys real room. If the week is loose, `'balanced'` stays. Make this explicit and logged, not implicit.

## §6. Types and copy

`ChangeType` becomes:

```ts
export type ChangeType =
    | 'pause'
    | 'redistribute'   // same weekly total, new shape  (default)
    | 'shift_window'   // same target, better time of day
    | 'reduce'         // ONLY when over real capacity
    | 'increase';
```

Keep `update_time` / `update_days` accepted in `execute/route.ts` as legacy input so a stale open page can't 400, but stop generating them.

The UI copy carries the principle. A redistribution is **not** a downgrade and must never read like one:

- Redistribute: **"Same 5 hours, better shape"** — with old and new shape side by side.
- Reduce: **"Not enough hours in the week"** — with the capacity figure that justifies it.

These should look visibly different in the Semi-Automated list. A user must be able to tell at a glance whether they are being asked to reshape or to give something up.

## §7. Do not touch

- The block-placement algorithm. §5 exists to make this explicit.
- `pause` (2 untouched weeks) and `increase` (>1.2 with a clean sheet) — carry over unchanged from Prompt 25 §3.
- The Prompt 26 execute flow, the dead-zone thresholds (`RELATIVE_TRIGGER`, `ABSOLUTE_SHORTFALL_MINS`) and the no-op fall-through — all still correct, they just now select between *shapes* rather than between *cuts*.
- Prompt 27's capacity function — consume it, don't fork it.

---

## Verification (required)

1. `npm run build` passes.
2. **A shortfall no longer cuts hours.** A goal at 20h target / 18h completed, in a week with headroom, produces a `redistribute` whose new shape totals 20h — **not** an 18h target. State the old and new shape.
3. **Weekly total is preserved** across every redistribution: `newMins × newDays` is within 5 minutes of `minutesPerDay × daysPerWeek`. Assert this in a test.
4. **Consolidate fires correctly** — missed 2 of 5 days, full sessions → fewer days, longer sessions.
5. **Split fires correctly** — all days attended, short sessions → more days, shorter sessions.
6. **No shape drops below 20 min/day** or above 7 days.
7. **Reduction requires the dry run.** Force `unscheduled_minutes` to zero and confirm **no** reduce proposal appears, no matter how far short the user fell.
8. **Reduction fires when it should** — overcommit an account until the scheduler genuinely can't place the hours. Confirm a `reduce` appears, cuts only the unplaceable amount, and targets the lowest-importance goal.
9. **A dry-run failure never causes a reduction.** Make it throw; confirm no reduce proposal and no crash.
10. **The dry run costs what it should.** Report its wall-clock time and confirm the stats route is still comfortably inside its limit. Confirm it runs once, not once per goal.
11. **The dry run persists nothing.** Diff `schedule_blocks` before and after loading Weekly Review — it must be byte-identical.
12. **Applied changes reach the goals page** — accept a redistribution, confirm the goals page shows the new minutes and days, and next week's blocks match the new shape.
13. **Copy distinguishes reshaping from cutting** in Semi-Automated. Screenshot both.
14. **Lever 3 honesty check** — state whether the generator actually reads `preferred_time_of_day`. If it doesn't, confirm Lever 3 was dropped rather than shipped inert.

---

## Note for the human

The important design decision here is what counts as proof that a week is too full. The obvious answer — "they didn't finish, so it was too much" — is the one to avoid, because it can't tell an overloaded week from a bad week, and it ratchets targets downward permanently: every shortfall cuts the target, which makes the next shortfall easier to hit, which cuts it again.

So reduction is gated on the scheduler itself failing. `generateWeekPlan` is deterministic and runs in under two seconds, so Weekly Review can just *ask* it: here are the goals, try to place them. If it places everything, the hours fit and any shortfall was about execution, not capacity — reshape and try again. If it comes back with unplaceable minutes after all its relaxation passes, the week genuinely cannot hold the commitment, and that is worth telling the user plainly with the number attached.

The other thing worth saying: most of what you asked for under "splitting blocks, moving them for efficiency, avoiding back-to-back high-energy blocks" already exists in the generator, and it's more sophisticated than I expected — chronotype-shifted energy phases, ultradian session caps with forced breaks, wider gaps between consecutive high-energy work, extra separation after meals for physical goals. §5 lists it with line numbers. The gap was never that the scheduler doesn't know how to shape a good week; it's that Weekly Review kept handing it smaller goals to shape.
