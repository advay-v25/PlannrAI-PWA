# PROMPT 38: The weekly review may never reduce a goal's hours

One absolute rule, and it removes a great deal of machinery.

**A goal's weekly hours are non-negotiable. The weekly review can change *when* and *how* those hours are scheduled — days, times, session shape — and nothing else. It may never propose fewer hours, for any reason.**

What the current build proposed:

| Goal | Before | After | Cut |
|---|---|---|---|
| Assignments | 60m × 4 = **4h** | 20m × 2 = **40m** | **−83%** |
| Sports | 120m × 2 = **4h** | 20m × 1 = **20m** | **−92%** |
| PlannrAI | 180m × 7 = **21h** | 69m × 7 = **8h 3m** | **−62%** |
| Stocks | 30m × 7 = **3h 30m** | 24m × 3 = **1h 12m** | **−66%** |

Under the heading *"4 goals lose hours — not enough hours in the week."* That is the opposite of what this feature is for.

---

## §1. Delete the `reduce` path entirely

- Remove `reduce` from `ChangeType`. Not gated, not conditional, not "only when overcommitted" — **removed**.
- Remove the capacity/dry-run machinery that existed solely to justify it (Prompt 28 §2's Test A and Test B as a *licence to cut*). Keep the dry run if it is useful for reporting, but it no longer authorises anything.
- Remove `increase` too if any path still emits it. The review does not move targets in either direction.
- **Remove `pause` as an applicable change.** Pausing is a 100% reduction. Two untouched weeks may still be *mentioned* in the summary prose — *"You haven't touched Sports in two weeks; you can pause it on the Goals page"* — but it is not a change the review applies.

**One change type survives: `reshape`.** Same weekly minutes, different days and/or times.

This is a large simplification. The proposal engine's entire job is now: given a goal that was missed, find a better arrangement of the same hours.

## §2. The weekly total must be preserved exactly

The one proposal in that screenshot that was meant to preserve hours still lost some:

```
Gym  120m/day × 4 days (480m)  →  95m/day × 5 days (475m)
```

Five minutes gone. 480 ÷ 5 = 96 exactly, so the correct shape was `96m × 5`. The shape builder is rounding each day down to the 5-minute grid instead of distributing the remainder.

- **`newMinutesPerDay × newDays` must equal `oldMinutesPerDay × oldDays` exactly.** Not approximately, not within tolerance.
- When the division is not clean, **distribute the remainder across days** rather than rounding every day down — the largest-remainder approach already used in `planDayShape` (`plan-week.ts:404-414`). A 250-minute week over 4 days is `65 + 65 + 60 + 60`, not `60 × 4`.
- If a shape cannot preserve the total exactly, **do not propose it.** Try the next shape.

## §3. A hard invariant, enforced in code

This has now been asked for repeatedly and keeps coming back, so make it structural rather than a rule someone has to remember.

Add a guard that every proposal passes through before it can be returned:

```
proposedWeeklyMinutes >= currentWeeklyMinutes   // for every goal, always
```

- A proposal failing this is **dropped**, and the violation is logged at `error` level with the goal, both totals and the change type. It is a bug, not a valid suggestion.
- Put the check at the boundary — where `buildProposals` returns — so no future rule can bypass it.
- Add a unit test that a shortfall of any size, in a week of any fullness, never produces a proposal with fewer weekly minutes. Include the four cases from the table above as fixtures.

## §4. When the hours genuinely will not fit, say so — do not cut

If the scheduler cannot place a goal's full hours, that is **information for the user**, not licence to lower the target.

- Report it plainly: *"Gym: 2h of your 8h could not be placed next week."*
- Show it as a **notice**, visually distinct from proposals — it is not something to accept or apply.
- Point at the two real remedies, both the user's to make: edit the goal on the Goals page, or free up time.
- Place what does fit. A goal that can only get 6 of 8 hours gets 6 hours scheduled, and the shortfall is reported. It does not get its target rewritten.

## §5. The "not enough hours" verdict was wrong anyway

Worth knowing why this fired at all. The capacity figures from your own logs:

```
available 69.5h  vs  targeted 48.0h,  headroom 21.5h
```

There were **twenty-one spare hours**. The week was not full. What the dry run actually reported was that the *planner* failed to place things — and Prompt 33 identified exactly why: goal-major iteration starving later goals, one body goal locking out another, fragment-driven splitting. Prompt 33 §5 flagged this precisely: *"until §§1–3 land, `unscheduled_minutes` overstates the problem."*

So the review read a packing failure as a capacity verdict and proposed cutting 62–92% of four goals in a week with a third of its time free.

**Confirm Prompts 33, 34 and 35 have actually been applied** before judging any remaining shortfall. Report which are in. With §1 removing the reduce path, a mistaken capacity reading can no longer damage anything — but it would still produce a misleading notice, so the underlying packing fixes still matter.

---

## §6. Do not touch

- Prompt 37 — no goal writes, carry-forward from this week, the missed-block triage. This narrows what a proposal may contain; it does not change how one is applied.
- Prompts 33, 34, 35 — the planner fixes.
- The Plan Week button and the coach.

---

## Verification (required)

1. `npm run build` passes.
2. **No proposal ever reduces weekly minutes.** Assert at the return boundary. Post the guard.
3. **The four cases above produce reshapes or nothing** — never a cut. Show what each yields now.
4. **Totals are exact.** Gym's 480 minutes stays 480 (`96m × 5`), not 475. Assert `newMins × newDays === oldMins × oldDays` for every proposal.
5. **Remainders are distributed**, not rounded down — 250m over 4 days is `65/65/60/60`.
6. **`reduce`, `increase` and applied `pause` are gone** from `ChangeType` and from every emitting path.
7. **A goal untouched for two weeks appears only as prose**, not as an applicable change.
8. **An unplaceable shortfall is a notice, not a proposal** — not selectable, not appliable. Screenshot it.
9. **What fits still gets scheduled** when a goal cannot be fully placed.
10. **Unit test** covering all four table rows plus a full-week and an empty-week case.
11. **Report which of Prompts 33, 34, 35 are applied**, and the current `available / targeted / headroom` figures.
12. Screenshot the confirm modal with only reshapes listed.

---

## Note for the human

You are right, and the screenshot is the clearest possible statement of the problem: a feature whose purpose is protecting your hours proposed cutting Sports by 92% and PlannrAI by 62%, in a week that had **21.5 spare hours**.

The mechanism was that the review treated the dry run's unplaceable minutes as a capacity verdict. But those minutes were unplaceable because of the planner bugs in Prompt 33 — goals filled one at a time against a shared per-day budget, one body goal holding every body slot, splits decided by leftover fragments. Prompt 33 §5 warned that `unscheduled_minutes` would overstate the problem until those landed. It did, and the review acted on it.

Making the rule absolute is better than making the capacity test more accurate. A conditional reduction is a rule someone has to keep getting right, and it has now gone wrong three times in different ways. An unconditional one is a line of code that cannot be argued with — which is why §3 puts it at the return boundary rather than inside the rules, so no future proposal type can route around it.

The simplification is real: with `reduce`, `increase` and applied `pause` all gone, there is exactly one thing a proposal can be — the same hours, arranged differently. That is a much smaller feature to keep correct.
