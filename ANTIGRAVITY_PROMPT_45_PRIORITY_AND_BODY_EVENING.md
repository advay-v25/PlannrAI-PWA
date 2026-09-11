# PROMPT 45: Importance must decide who gets shortened, and body work belongs away from bedtime

Two rules for the planner. Both are visible in the same block: `Gym (Shortened) 22:30–23:15` sitting flush against `Wind Down 23:15`, while `Assignments (Part) 21:30–22:15` and `22:15–23:15` keep their full length. Gym is high importance; Assignments is medium.

---

## §1. Importance currently decides almost nothing

`importance` is read in exactly two places in `plan-week.ts`:

```
:804-805   a tiebreak in the goal sort
:1132      sortWindowsByPreference(..., goalImportance: goal.importance, ...)   // window preference
```

It is **not** consulted by `allocateDayShares` (the minute reservation from Prompt 33 §1), and it is **not** consulted when deciding what to shorten. The shorten decision at `:1186` is purely mechanical:

```ts
title: sessionMins < remainingToPlace ? `${goal.title} (Shortened)` : goal.title,
```

Whatever does not fit gets trimmed, regardless of how important it is. So a high-importance goal is cut exactly as readily as a low-importance one — which is what you are seeing.

### The rule

**When the week cannot hold everything, the shortfall lands on the least important goals first.**

Three places need it:

**a. Allocation.** In `allocateDayShares`, weight each goal's claim by importance. A high-importance goal is allocated its full need before medium and low goals receive anything beyond their minimum. Keep the guarantee from Prompt 40 §2 that every active goal gets at least one slot and at least `MIN_BLOCK_MINS` — importance changes who gets the *surplus*, it must never starve a goal to zero.

**b. Shortening order.** A goal may only be shortened if every goal of lower importance on that day is already at its minimum. Sort shortening candidates by ascending importance and trim from that end. **A high-importance goal is the last thing cut, not the first.**

**c. Window quality.** Already partly handled at `:1132`. Confirm a high-importance goal gets first refusal on the best-scoring window once its turn arrives, without letting it jump the difficulty ordering from Prompt 35 §2 — a rigid body block still needs to pick before a flexible one, but among equally rigid goals importance decides.

### Get the representation right first

`importance` has the string/number split flagged in Prompt 37 §5: `normalizeImportance` (`context-builder.ts:22-25`) returns a **number** with a default of 5, while the goals API validates `'low' | 'medium' | 'high'`. Before implementing any of the above, **report what the column actually holds and what the mapping is**, and use the normalized numeric consistently. Do not compare a string to a number and get a silently false result — that would make this whole prompt a no-op that looks implemented.

## §2. Body goals do not sit against wind-down

A new hard rule, alongside the existing body rules (one contiguous block per day, one body block per day):

**A body block must finish at least `BODY_WIND_DOWN_GAP_MINS` before wind-down begins. Default 60 minutes.**

Hard training immediately before bed is a poor way to end a day, and `Gym 22:30–23:15` into `Wind Down 23:15` has no separation at all.

There is already a general pre-wind-down gap, but it is too small and it collapses under relaxation:

```ts
:1094  const preWindDownGapMins = (goalEnergy === 'low' || isRelaxedBuffer) ? 0
:1095      : (strategyId === 'recovery' ? 30 : 20) + failureAdjustments.preWindDownGapBonus;
:1417  const effectiveDayWindDown = Math.max(wakeMins, dayWindDown - (goalEnergy === 'low' ? 0 : 15));
```

Note `isRelaxedBuffer` sets the gap to **zero**. That is how Gym ended up flush against wind-down — it was placed on a relaxation pass.

### How to relax it

The rule is strong but not absolute, exactly as you described.

- Enforce the 60-minute gap for `pillar === 'body'` on **all passes except the final one**.
- It is the **last** constraint to give — relax it only after energy-phase matching, session pacing and day caps have already been relaxed, and only when the body goal would otherwise go unplaced entirely.
- When it is relaxed, **log it explicitly**: which goal, which day, what gap was achieved. A block placed against wind-down should be a recorded exception, not a silent outcome.
- Even when relaxed, keep the general non-zero gap. Never allow a body block to end exactly when wind-down starts.

Make the constant named and configurable rather than a literal, so it can be tuned without hunting through the placement loop.

### Knock-on

Body goals are already the most constrained thing in the week — one contiguous block, one per day, and now an evening exclusion. That tightens their available windows considerably, so the difficulty-first ordering from Prompt 35 §2 matters more than before: body must sort earlier still, since its viable-window count has dropped. Verify the ordering accounts for the new exclusion when it counts viable windows, rather than counting windows the rule will later reject.

---

## §3. Do not touch

- Body contiguity and one-per-day (Prompt 35 §1) — this adds to them.
- The 15-minute floor and buffer rules (Prompt 34).
- The no-reduction rule for the weekly review (Prompt 38) — this is about the planner shortening within a week, not about lowering goal targets.
- The weekly review flow, the coach.

---

## Verification (required)

1. `npm run build` passes.
2. **Report the real representation of `importance`** — column type, values present, and the normalized mapping used.
3. **Gym keeps its full length and Assignments is shortened**, not the reverse. Post the before/after for the exact week in the screenshot.
4. **Shortening order is by ascending importance.** Log every shortened block with its importance and confirm no higher-importance goal was cut while a lower one held full length that day.
5. **No goal is starved to zero** by the importance weighting. Every active goal still gets at least one slot and at least `MIN_BLOCK_MINS`.
6. **No body block ends within 60 minutes of wind-down** on any normal pass. Assert across a full generated week.
7. **The relaxation is logged** when it fires, naming goal, day and achieved gap.
8. **Even relaxed, a body block never ends exactly at wind-down.**
9. **Body goals still place** — confirm the new exclusion has not pushed Gym or Sports back to zero. If it has, that is the difficulty-ordering knock-on and needs fixing here, not accepting.
10. Post the per-goal placement log and a screenshot of Monday evening.

---

## Note for the human

The reason importance is not protecting Gym is that it barely participates in scheduling at all. It appears twice in the whole planner — as a tiebreak in the sort, and as a hint for which window looks nicest. The decision that actually matters, *what gets trimmed when the week is full*, does not consult it: `sessionMins < remainingToPlace` trims whatever will not fit and appends "(Shortened)". So a high-importance goal and a low-importance one are treated identically at exactly the moment the distinction should count.

Worth being careful about one thing before implementing it, which is why §1 ends with a check rather than an instruction. `importance` is a number internally (defaulting to 5) but a `'low' | 'medium' | 'high'` string at the API boundary. If the new comparisons are written against the wrong one, they will silently evaluate false and the feature will look shipped while changing nothing.

On the body rule: there is already a pre-wind-down gap, but it is 20 minutes, and `isRelaxedBuffer` collapses it to **zero**. That is precisely how Gym ended up ending at 23:15 with wind-down starting at 23:15 — it was placed on a relaxation pass, where the gap ceased to exist. So the fix is not only a bigger number; it is making the rule survive relaxation until the very last pass.

One consequence to expect: body goals now have one contiguous block, one per day, *and* an evening exclusion. That is a genuinely narrow set of viable windows on a packed week, so watch verification item 9 — if Gym starts going unplaced, the answer is earlier ordering, not weakening the rule.
