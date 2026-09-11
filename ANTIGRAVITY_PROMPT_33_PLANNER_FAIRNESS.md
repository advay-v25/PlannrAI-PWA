# PROMPT 33: The planner starves later goals, splits badly, and disagrees with the writer

The weekly review is now doing its job — it applies the change and hands off to the planner. Everything wrong with the resulting calendar is the planner's own behaviour, and it is identical when the **Plan Week button** is used. This is not a Weekly Review bug.

Earlier prompts told you not to touch the placement algorithm. **That restriction is lifted for the four issues below, and only those.**

The evidence is the planner's own log, from the run that produced the screenshot:

```
[PlanWeek] "Standard Balanced" placement:
   SiteSmith    target= 900m placed= 900m blocks=18 days=6/6  MET
   PlannrAI     target= 840m placed= 840m blocks=15 days=7/7  MET
   Reading      target= 315m placed= 315m blocks= 7 days=7/7  MET
   Readings…    target= 240m placed= 240m blocks= 4 days=4/4  MET
   Assignments  target=  20m placed=  20m blocks= 1 days=1/1  MET
   Stocks       target=  60m placed=  50m blocks= 2 days=2/3  SHORT — remaining 10m below min block floor 20m
   Gym          target= 475m placed= 335m blocks= 4 days=4/5  SHORT — global per-day capacity exhausted by earlier goals
   Sports       target=  30m placed=   0m blocks= 0 days=0/1  SHORT — one body block per day globally
```

Capacity that run: `available 69.5h vs targeted 48.0h, headroom 21.5h`. **There was over 21 hours of headroom and it still could not fit a 30-minute Sports session.**

---

## §1. Goal-major iteration starves whatever sorts last

`plan-week.ts:927` loops `for (const goal of sortedGoals)` and fills each goal to completion before the next is considered. `getDayCapacity` is a **single global per-day budget shared by all goals** (`:1065`). So SiteSmith (900m) and PlannrAI (840m) consume every day's allowance, and Gym runs out of room — the log says so in its own words: *"global per-day capacity exhausted by earlier goals"*.

This is what "not scheduling other blocks that are active goals" means. Nothing is broken; the big goals simply eat first.

**Allocate per day across all goals before placing, rather than filling goals one at a time.**

For each day, compute each goal's *claim* on that day — its remaining weekly minutes divided by the days it still has available — and apportion the day's capacity proportionally, capped at each goal's `minutes_per_day`. Place against those allocations. The largest-remainder helper already in the file (`plan-week.ts:346`, used for body-pillar lanes) is the right tool; this is the same problem one level up.

Preserve the existing sort for **tie-breaking and window preference** — importance and energy still decide who gets the peak window. What must stop is a goal consuming another goal's capacity outright.

Relaxation passes stay as they are. Fair-share applies from pass 0.

## §2. One body goal locks out every other body goal

`Sports: target 30m, placed 0m — "one body block per day globally"`.

The single-body-block-per-day rule (`plan-week.ts:1037-1049`) plus the `bodyGoalDayQuota` lanes (`:869-925`) let Gym take the body slot on all seven days, leaving Sports with nowhere to go — for **30 minutes a week**, in a week with 21 hours spare.

The rule is sound in intent: two hard physical sessions on one day is bad advice. Fix the apportionment, not the rule.

- Divide the week's body slots between competing body goals **in proportion to their weekly targets**, before the placement loop runs, and guarantee **every** body goal with a non-zero target at least one slot.
- Verify the existing `bodyGoalDayQuota` is actually consulted in pass 0 rather than only after relaxation.
- A body goal must never finish with `placed = 0` while another body goal is over-served, when spare days exist.

## §3. Splitting is fragment-driven, not shape-driven

`SiteSmith: 900m over 6 days = 150m/day`, emitted as **three blocks of 75 + 30 + 45**. The screenshot shows exactly that: `11:30–12:45`, `13:00–13:30`, `14:45–15:30`, all tagged `(Part)`.

The 90-minute session cap (`practical-constraints.ts:167`) means 150 minutes legitimately cannot be one block. But it should become **75 + 75**, not three uneven fragments. The current code walks windows and takes whatever each one leaves, so the split is decided by the gaps it happens to encounter rather than by what a sensible day looks like.

- **Decide the split shape first**, from the day's target and the session cap: `ceil(target / maxSessionBlockMins)` blocks of as-equal length as possible, each rounded to 5 minutes.
- Then find windows for those blocks. If they will not fit, reduce the block count and re-split — never emit an uneven residue block.
- **Never emit a block under 20 minutes**, and never more than 2 blocks per goal per day unless the target genuinely requires a third.
- Snap **durations** to 5 minutes, not only starts. `snapStartToGrid` (`plan-week.ts:312`) handles starts; the 38-minute `SiteSmith 15:00–15:38` in the earlier screenshot came from an unsnapped duration.

Also fix the `Stocks` case: `target 60m, placed 50m, remaining 10m below min block floor 20m`. Three days at 20m each is exactly 60. It placed two blocks of 25 and stranded 10 minutes. Choosing the shape first makes this arithmetic come out right.

## §4. The planner and the writer disagree about `minutes_per_day`

From an earlier run in the same log:

```
[WeekWriter] Skipped 4 block(s):
  "Gym (Shortened)" 2026-08-31 18:30 — would put 100min on this goal today (limit 90min/day)
  "Gym"             2026-09-02 15:45 — would put 120min on this goal today (limit 90min/day)
  "Stocks"          2026-09-02 23:00 — would put  30min on this goal today (limit 20min/day)
```

The planner deliberately placed those blocks; `writeWeek`'s `enforceGoalDailyLimits` then deleted them. The result is a calendar with holes where the planner intended work, and the user is told nothing.

Two components, two definitions of the same number. Fix it at the source:

- **The planner must treat `minutes_per_day` as a hard per-day ceiling** and never emit a day that exceeds it. Find why it does — `maxDeepWorkMins` from the mode config is a separate, larger cap, and the two are evidently not being combined. The effective ceiling is `min(minutes_per_day, maxDeepWorkMins)`.
- **Once the planner respects it, the writer's filter should never fire.** Keep it as a safety net, but treat any block it drops as a **planner bug**: log it at `error` level with the goal, the day and both numbers.
- A block dropped by the writer must be **reported to the caller**, not just logged. `WeekWriteResult.skipped` already carries it — the weekly review and Plan Week must surface it rather than reporting a clean success.

Also check `"Gym (Shortened)"` and `"(Part)"` — these suffixes are the only signal a block was altered, and `(Part)` is now on almost everything. Confirm they are applied only when a block genuinely differs from the goal's normal session, and that `(Shortened)` blocks are still counted correctly by the stats.

## §5. Report honestly when the week is genuinely full

One run shows `98 blocks planned, 885m unplaceable across 3 goal(s)` at `targeted 62.8h vs available 68.3h`. Sometimes the week really is too full, and §§1–3 will not change that.

When goals finish `SHORT` after all passes, the user must be told — which goal, how many minutes, and why — rather than being handed a calendar with silent gaps. Surface the per-goal shortfall in the weekly review result and after a Plan Week run.

This is also the signal Prompt 28 §2 uses to justify ever proposing a reduction, so it needs to be accurate. Note that until §§1–3 land, `unscheduled_minutes` overstates the problem: Gym and Sports were short because of starvation, not because the time did not exist.

---

## §6. Do not touch

- The energy-phase model, chronotype shifts, `resolveAdjacencyBuffer`, meal separation, pre-bed decompression. The *constraints* are fine — the **allocation** between goals is what is broken.
- The 90-minute session cap and the forced break before a third session. §3 works within them.
- `writeWeek`'s structure, beyond the logging and reporting in §4.
- The weekly review flow from Prompt 32, `replan_week` / `replan_day` from Prompt 31, the capacity function from Prompt 27.

---

## Verification (required)

1. `npm run build` passes.
2. **Nothing starves.** Re-run the exact scenario above. `Sports` gets its 30 minutes. `Gym` gets its 475m or a clearly-explained shortfall. Post the full placement log before and after.
3. **No goal reports "global per-day capacity exhausted by earlier goals"** while the week has headroom.
4. **Two body goals coexist.** Gym and Sports both placed, neither at zero.
5. **Even splits.** SiteSmith's 150m/day is 75 + 75, not 75 + 30 + 45. Post the blocks.
6. **No block under 20 minutes**, none off the 5-minute grid, and no more than 2 blocks per goal per day unless arithmetically required. Assert this across a full generated week.
7. **Stocks lands exactly 60m** across 3 days, nothing stranded.
8. **The writer drops nothing.** `[WeekWriter] Skipped` is empty for a normal run. If anything is dropped, it is logged as an error and reported to the caller.
9. **`minutes_per_day` is respected** — no day exceeds it for any goal, straight from the planner.
10. **Plan Week button gets the same fixes.** Run it and confirm identical improvements — it is the same generator.
11. **Genuine overcommitment reports honestly** — construct a week that truly cannot fit and confirm the per-goal shortfall reaches the UI.
12. **Determinism.** Same inputs twice → identical output. Then report how many blocks move when a single goal's target changes by 5 minutes.

---

## Note for the human

The planner is telling you what is wrong in its own log, which is the useful outcome of the instrumentation added in Prompt 27:

```
Gym     target= 475m placed= 335m  SHORT — global per-day capacity exhausted by earlier goals
Sports  target=  30m placed=   0m  SHORT — one body block per day globally
```

That run had **21.5 hours of headroom** and still could not place a 30-minute Sports session. Nothing is overloaded — the allocation is simply first-come-first-served. Goals are filled one at a time against a shared per-day budget, so SiteSmith (900m) and PlannrAI (840m) take everything and whatever sorts last gets the remainder. Sports loses twice over, because Gym also holds the single body slot on all seven days.

The odd splitting has the same shape of cause. 150 minutes a day cannot be one block under the 90-minute session cap, so it must split — but it should split into 75 + 75, and instead the code walks the available windows taking whatever each leaves, producing 75 + 30 + 45. Decide the shape first, then find windows for it.

And the missing blocks are real deletions, not placement failures: `writeWeek` dropped four Gym blocks and a Stocks block because the planner emitted days exceeding `minutes_per_day` while the writer enforces it strictly. Two components, two readings of the same field. Worth fixing at the planner, because the writer silently deleting the planner's output is how you get a calendar with holes and a success message.

One thing I got wrong earlier: I told you in Prompt 32 that the planner being deterministic meant unchanged goals would mostly stay put. That holds only when the week is loosely packed. At 48–63 hours targeted against ~69 available, the greedy fill is unstable — a small change early reshuffles everything downstream. Fair-share allocation will help, but if you want genuine stability across weeks, that is a separate property and worth deciding on deliberately rather than hoping for.
