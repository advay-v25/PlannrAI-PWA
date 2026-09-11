# PROMPT 29: `plan_next_week` is generating an empty week, and the review can't tell

Three things, in dependency order. §1 is critical — it means Prompt 26 currently ships a feature that produces a week with no goal blocks in it, and it silently disables Prompt 28's reduction test.

---

## §1. Every goal reports "already met" and gets zero blocks

From `.next/dev/logs/next-development.log`, the dry run for 2026-08-31:

```
[PlanWeek] "Standard Balanced" placement:
   PlannrAI            target= 630m placed=   0m blocks= 0 days=0/7  SHORT — already met for the week (no remaining minutes)
   Readings for Class  target= 240m placed=   0m blocks= 0 days=0/4  SHORT — already met for the week (no remaining minutes)
   SiteSmith           target= 225m placed=   0m blocks= 0 days=0/5  SHORT — already met for the week (no remaining minutes)
   Reading             target= 210m placed=   0m blocks= 0 days=0/7  SHORT — already met for the week (no remaining minutes)
   Assignments         target=  90m placed=   0m blocks= 0 days=0/2  SHORT — already met for the week (no remaining minutes)
   Stocks              target= 300m placed=   0m blocks= 0 days=0/5  SHORT — already met for the week (no remaining minutes)
   Gym                 target= 360m placed=   0m blocks= 0 days=0/4  SHORT — already met for the week (no remaining minutes)
   Sports              target= 240m placed=   0m blocks= 0 days=0/2  SHORT — already met for the week (no remaining minutes)
[DryRun] 2026-08-31 mode=balanced 173ms — 35 blocks planned, 0m unplaceable across 0 goal(s)
```

**All eight goals. Zero blocks each.** The 35 blocks are sleep, meals, morning routine and wind-down — the bio scaffolding. Next week contains no actual work.

### The cause

`plan_next_week` calls (`patch-service.ts:1691`):

```ts
generateWeekPlan(calendarCtx, nextMondayStr, mode, allowWeekend, undefined, nextMondayStr)
                                                                            ^^^^^^^^^^^^^ replanFromDate
```

And `computeRemainingWeeklyMins` (`plan-week.ts:328-344`):

```ts
if (!replanFromDate) return remainingMins;
const targetMins = (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
const minsBeforeReplan = ctx.schedule.this_week
    .filter(b => b.goal_id === goal.id && b.date < replanFromDate && b.status !== 'cancelled' && b.status !== 'missed')
    .reduce(/* sum durations */, 0);
return Math.max(0, targetMins - minsBeforeReplan);
```

`ctx.schedule.this_week` is **the current week**. `replanFromDate` is **next Monday**. So `b.date < replanFromDate` matches *every block in the current week*, and `minsBeforeReplan` becomes the goal's entire current-week schedule. A goal fully scheduled this week returns `targetMins - targetMins = 0`, and `plan-week.ts:933` skips it.

The subtraction is correct for `replan_week` — "don't re-plan minutes already scheduled earlier **this** week." It is wrong the moment `replanFromDate` points outside the week that `this_week` describes.

### The fix

`minsBeforeReplan` must only count blocks **inside the same week being planned**. Bound the filter at both ends:

```ts
b.date >= weekStartBeingPlanned && b.date < replanFromDate
```

When planning next week, `replanFromDate === weekStart`, so the range is empty, `minsBeforeReplan` is 0, and each goal gets its full weekly target. When replanning mid-week, behaviour is unchanged.

Better still: **pass the blocks to subtract from explicitly** rather than reaching into `ctx.schedule.this_week`, which is only ever correct by coincidence. A function that plans an arbitrary week should not be silently reading a field named `this_week`.

Check the same assumption everywhere `ctx.schedule.this_week` is read during planning — this is unlikely to be the only place it leaks.

### Then re-check what this was masking

With goals actually being placed, re-run and report:

- Blocks placed per goal against target, for a real account.
- Whether the `days=0/7` figures become sane (`days=5/7` etc.).
- **Whether `unscheduled_minutes` is now non-zero for anything.** The `0m unplaceable across 0 goal(s)` reading was meaningless — nothing was attempted. Prompt 28 gates every reduction proposal on this number, so until §1 lands, that gate has been passing on a false negative.

Capacity looks healthy and is not the constraint: `awake 108.5h − routine 5.3h − winddown 5.3h − meals 14.0h − commitments 6.0h − buffers 9.0h = available 69.0h vs targeted 38.3h, headroom 30.8h`. That number looks right, so Prompt 27 §4 landed correctly.

Also note the log's own wording — **`SHORT — already met for the week`** is self-contradictory and cost real time to interpret. A goal that is skipped because it needs nothing is not `SHORT`. Separate the two states in the log line.

## §2. The summary and the stats disagree about the same week

On screen simultaneously:

- Metrics chip: **38h Completed · 2h Skipped**
- AI struggles: *"All 38 hours of planned time were skipped, resulting in 0 hours completed across all goals and commitments."*

Both cannot be true. **Do not guess which — instrument it and report the answer before changing behaviour.**

Log, for one request against the same `weekStart`:
- The full prompt string sent to the model, including the `Goals Breakdown` lines.
- `/stats`' `metrics` object.
- `/generate-report`'s `metrics` object.
- The count of goals each route fetched.

Two known divergences between the routes, either of which could be it:

**(a) Different goals queries.**

```ts
// week-stats.ts:395-397  — ALL goals, no pause filter
.from('goals').select('id, title, ... is_paused, created_at, status, preferred_windows').eq('user_id', userId)

// generate-report/route.ts:110-113  — excludes NULL
.from('goals').select('id, title, importance, minutes_per_day, days_per_week').eq('is_paused', false)
```

`.eq('is_paused', false)` **does not match `NULL`**. Any goal predating that column is invisible to `generate-report` but visible to `/stats`. Note the effect this has on `computeMetrics`: `plannedMinutes` and `completedMinutes` accumulate from blocks regardless, but the per-goal `stats` lookup at `computeMetrics:281` silently no-ops when the block's `goal_id` isn't in `goalStats`. So the **totals stay right while every per-goal `completed` reads 0** — which is exactly the shape of what the AI wrote.

That is the leading hypothesis. Confirm it by counting rows where `is_paused IS NULL`.

**(b) `/stats` has no pause filter at all**, so it counts paused goals that Prompt 27 says shouldn't be scheduled.

Whatever the instrumentation shows, the fix is the same shape: **one goals query, in one place, used by both routes.** Export it from `week-stats.ts` and have `generate-report` call it. Two hand-written queries over the same table for the same screen is what produced this. Use the null-safe predicate from Prompt 27 §1, not bare `.eq(..., false)`.

## §3. More than an hour missed is enough to offer help

Currently the buttons gate on `hasProposals`, and `buildProposals` works goal-by-goal. A week where every goal lands near its target individually but **2 hours went missing overall** produces no proposal and both buttons stay dead — which is what the screenshot shows.

**New rule: if the user missed more than 60 minutes across the week, Automatic and Semi-Automated are available, and there is always at least one proposal to act on.**

- Compute `totalMissedMins` for the week — skipped minutes plus unmet target on goals that fell short. Define it once, next to the metrics, and use the same number in the copy.
- **`totalMissedMins > 60` forces at least one proposal.** If the per-goal rules produce none, fall back: take the goals contributing the most missed time, and propose a **reshape** for each (Prompt 28's consolidate/split levers), largest contributor first. Cap at three so the panel stays readable.
- These are reshapes, not cuts. §1 of Prompt 28 stands: the weekly total is preserved. Missing two hours is a reason to change the shape of the week, never to want less.
- Keep the per-goal thresholds as they are for everything under an hour. This is an additional floor, not a replacement.

When there genuinely is under an hour missed, keep the existing "your goals matched your week" state — but make the copy say the number, so the user can see the threshold rather than infer it: *"You missed 12 minutes this week — nothing worth changing."*

## §4. Wins must not depend on the model

`page.tsx:806` maps `ai.achievements`. The model returned an empty array — plausibly downstream of §2 — and the card renders an empty green box with a heading and nothing in it. That reads as broken.

Two fixes, both needed:

1. **Never render an empty list.** If `achievements` is empty, show a line rather than a void. Same for `struggles`.
2. **Derive wins deterministically and merge them in.** A win is a fact about the data, not a matter of prose: goals that hit or beat target, the longest completion streak, the best day, total hours completed, every block finished on a given day. Compute these in `week-stats.ts` alongside the other metrics and render them whether or not the AI responds.

This matters beyond this bug: when a provider is rate-limited the entire Wins panel currently disappears, even though every fact needed to fill it is already sitting in the stats payload. The struggles half can stay AI-only — a good struggle needs interpretation — but wins are arithmetic.

Sanity-check the result: with 38h completed against 38.3h targeted, this user should have had a **substantial** wins list. An empty one was never plausible.

---

## §5. Do not touch

- The placement algorithm, energy phases, session pacing, buffers. §1 is a single arithmetic bound on which blocks get subtracted, not a scheduling change.
- Prompt 27's capacity function — the log shows it working correctly.
- Prompt 28's redistribute levers and the reduction gate. §3 adds a floor to *when* proposals are generated; it does not change *what kind* they are.
- The Prompt 26 execute flow.

---

## Verification (required)

1. `npm run build` passes.
2. **Goals get blocks.** Re-run the dry run and post the per-goal placement log. Every active goal shows `placed > 0` and a sane `days=N/M`. No goal reports "already met" unless it genuinely completed its target in the week being planned.
3. **`plan_next_week` produces a real week.** Run Automatic and report the block count split by type — goal blocks vs bio blocks. Goal blocks must be well above zero.
4. **Mid-week `replan_week` is unchanged.** Confirm its `minsBeforeReplan` still subtracts correctly and it does not double-schedule.
5. **`unscheduled_minutes` is now meaningful.** State what it reports for a real account. If still zero everywhere, prove the week genuinely fits rather than assuming.
6. **§2 answered with evidence.** Post both `metrics` objects, both goal counts, and the exact prompt string. Say which number was wrong and why. Report the count of `is_paused IS NULL` rows.
7. **One shared goals query**, used by `/stats` and `/generate-report`, null-safe. No hand-written duplicate remains.
8. **The AI's numbers match the chip.** Regenerate and confirm the narrative's completed/skipped hours agree with the metrics chip exactly.
9. **>1h missed enables the buttons.** Construct a week with ~2h missed and no per-goal shortfall. Both buttons enable and at least one reshape proposal appears. State the proposals and which goals they targeted.
10. **Under 1h missed still reads as success**, with the actual number in the copy.
11. **Forced proposals preserve weekly totals** — same assertion as Prompt 28 §3.
12. **Wins are populated from the data**, present even with the AI unavailable. Kill the AI path and confirm Wins still renders. Neither card ever renders empty.
13. Screenshot the review with Wins populated and both buttons enabled.

---

## Note for the human

The dry-run log answered this outright: **every one of your eight goals was skipped as "already met", so next week was being built with 35 bio blocks and no work in it at all.**

The mechanism is a date filter with only one end bounded. `computeRemainingWeeklyMins` subtracts "minutes already scheduled before the replan point" using `b.date < replanFromDate` against `ctx.schedule.this_week`. That's right for `replan_week`, where the replan point is a day inside the current week. But `plan_next_week` passes *next Monday* as that point — and every block in the current week is before next Monday, so the filter swallows your entire week and concludes each goal has already had its hours. Adding a lower bound fixes it.

Two consequences worth naming. First, Prompt 26 shipped a feature that has been generating empty weeks — the block counts it reported were bio scaffolding. Second, the `0m unplaceable across 0 goal(s)` line that Prompt 28 relies on to decide whether to ever cut a target was passing because nothing was attempted, not because everything fit. That gate has never actually been tested.

On the 38h-vs-0h contradiction I've deliberately stopped short of asserting a cause. The strongest candidate is `.eq('is_paused', false)` in `generate-report` not matching `NULL` — which would leave the block-derived totals correct while every per-goal `completed` silently reads zero, exactly the shape of what the model wrote. But that's a hypothesis with a clean test, and I'd rather it be confirmed against your data than asserted here. I got the Groq model ID wrong earlier by trusting docs over the live key; same discipline applies.
