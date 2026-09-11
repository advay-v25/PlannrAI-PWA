# PROMPT 35: Body goals are one continuous block, and the hardest blocks get placed first

**This replaces the earlier drafts numbered 35 and 36 — discard both, run only this.**

Two changes that belong together. Body goals stop being splittable, which makes them the least flexible thing in the week; so the placement order has to put the least flexible blocks first and let the small flexible ones fill in around them.

The capacity is there. The last measured week was `available 69.5h vs targeted 48.0h, headroom 21.5h` and still failed to place a 30-minute Sports session. That is a packing failure, not a capacity failure.

---

## §1. A body goal is never split within a day

A gym session broken into 30 minutes at 11:00 and 45 at 16:00 is not the same training session twice; it is two warm-ups and no workout. Splitting is right for desk work and wrong for physical work.

**`mind`, `craft` and `soul` keep the current splitting behaviour exactly as it is**, including the 90-minute cap and the even-split shape from Prompt 33 §3.

At `plan-week.ts:1552`:

```ts
let plannedShape = goal.pillar === 'body'
    ? (remainingToPlace >= MIN_BLOCK_MINS ? [remainingToPlace] : [])
    : planDayShape(remainingToPlace, shapeCap, minBlockFloor);
```

Keep the 5-minute grid rounding.

**The session cap does not apply to body goals.** `shapeCap` (90, or 120 relaxed) exists to stop cognitive sessions running past useful focus. A 120-minute gym session is one session — if the cap stays active it will keep forcing exactly the split this removes. Check the ultradian pacing rules too (`getDaySessionState`, `requiresSessionBreakGap` in `practical-constraints.ts`): they are about sustained mental work and must not fragment a body block. Exempt body if they can.

Prompt 34's `usableDays = min(days_per_week, floor(weeklyTarget / MIN_BLOCK_MINS))` still decides how many days a goal gets. This decides that each of those days is one block.

## §2. Order placement by difficulty, not by size or importance

There is a tension here that must not be got wrong, because getting it wrong undoes Prompt 33.

- **`allocateDayShares` (`plan-week.ts:1092`) decides how much of each day each goal is entitled to.** It runs before any placement and it is what stops a large goal eating a small goal's minutes. **Do not change it.** Largest-first *allocation* would put `Sports placed= 0m` straight back.
- **`sortedGoals` (`:1197`) decides who picks a window first.** This is what changes.

Reserve fairly, then place in order of difficulty. A goal cannot exceed its reserved share, so ordering can no longer starve anyone — it only settles who gets first pick among the windows, which is the decision currently being made badly.

The existing sort (`:1029`) ranks by progress-behind → importance → energy → total minutes, with total minutes **last**. That is how a 20-minute goal ends up taking the only 90-minute gap.

New order for the placement loop:

1. **Longest contiguous block required**, descending — the dominant term. After §1 a body goal's whole daily allocation is one block, so a 90-minute Gym session ranks above a 150-minute craft goal that splits into 75 + 75.
2. **Fewest viable windows**, ascending. Count the windows on the day that could actually hold the goal's largest block *after* energy filtering; scarcity ranks higher. A high-energy goal confined to peak/rebound has less freedom than a low-energy one.
3. **Body pillar first** at equal block length — it cannot split, so it has strictly less freedom.
4. **Then the existing keys** — progress-behind, importance, energy — as tiebreakers.

Keep the low-energy reordering at `:1063-1066` as a final adjustment; it reflects the user's current state and should still win.

**Importance now governs window *quality*, not ordering.** A high-importance goal should get the peak window when several fit; it should not get first claim on the only long gap a rigid block needed. Confirm `scoreWindowAffinity` still drives which window is chosen once a goal's turn arrives.

## §3. When a block does not fit: relocate, never split

For a body goal, in this order:

1. Another window the same day long enough to hold it whole.
2. Another day — Gym on Wednesday instead of Tuesday is fine; the same session cut in half is not.
3. The repair pass below.
4. Only then, report it short.

Check the reduction path around `:1621-1630` and the second placement pass at `:1796-1851` — both can currently shorten or re-split a session to make it fit. **Neither may split a body goal.** Shortening a body block is also worse than moving it: prefer relocation, shorten only as a last resort, never below `MIN_BLOCK_MINS`.

### The repair pass

Ordering alone will not catch every case. After the main loop, if any goal is still `SHORT` **while the week has headroom**, run one bounded repair:

1. Find the unplaced block and the days whose free time could hold it if something moved.
2. Find an already-placed **flexible** block — non-body, splittable, with alternative windows available — occupying that space.
3. Move it to another window it can legally occupy, then place the rigid block.
4. Re-check every constraint after the move: buffers, energy phase, day caps, minimum block, per-goal daily limits.

Bound it hard:

- **One pass, maximum 5 relocations.** Do not iterate to a fixed point — that is how a scheduler becomes slow and unpredictable.
- **Never relocate a body block** to make room for something else. Body blocks are the rigid ones; moving them recreates the problem.
- **Never split anything** during repair.
- If it cannot place the block within those limits, leave it `SHORT`.
- Log every relocation: what moved, from where to where, and for which goal.

## §4. Genuine impossibility is still reported honestly

When a block truly cannot fit — no gap long enough, nothing may legally move — report that goal short **for that specific day**, with the reason, per Prompt 33 §5.

That path stays. What changes is that it should become rare, and when it fires it should be because the day is genuinely full rather than because a small goal took the long gap first.

## §5. Knock-on checks

- **No `(Part)` suffix on a body block, ever.** If one appears, a split happened.
- The **one-body-block-per-day** rule (`:1037-1049`) and the `bodyGoalDayQuota` lanes (`:869-925`) now agree with §1 naturally — one block per day was always the intent. Verify the quota allocates whole sessions, not minute budgets a later step could divide.
- Longer contiguous body blocks are harder to place than several short ones. §2 and §3 exist to absorb that; watch whether body goals still finish short and report it if so.

---

## §6. Do not touch

- `allocateDayShares` and the fair-share reservation (Prompt 33 §1).
- Splitting for `mind`, `craft` and `soul`, including the 90-minute cap and even-split shape (Prompt 33 §3).
- The 15-minute floor and buffer rules (Prompt 34).
- Energy phases, chronotype shifts, meal separation, `resolveAdjacencyBuffer`.
- The weekly review flow, `writeWeek`, `replan_week` / `replan_day`.

---

## Verification (required)

1. `npm run build` passes.
2. **Every body block is one block.** Generate a week; no body goal has more than one block on any day. Post Gym's and Sports' blocks for the full week.
3. **A long body session stays whole** — set a body goal to 120 min/day, confirm one 120-minute block, not 90 + 30.
4. **No `(Part)` on any body block.**
5. **Non-body splitting unchanged** — SiteSmith's 150 min/day is still 75 + 75. Post it.
6. **Everything fits when the hours exist.** Re-run the `48.0h targeted / 69.5h available` scenario: every goal reaches target, or the log says precisely why not. Post the full per-goal placement log before and after.
7. **Sports and Gym both placed in full**, as whole contiguous blocks.
8. **Ordering is by difficulty** — log the placement order with each goal's longest required block and viable-window count; confirm rigid ones come first.
9. **No starvation returned.** No goal reports `capacity exhausted by earlier goals` — this is the Prompt 33 property and it must survive.
10. **Reservation unchanged** — `allocateDayShares` still runs before placement, output identical to before.
11. **Relocation beats splitting** — block the only long window on a day, confirm the body goal moves to another day rather than fragmenting.
12. **Repair pass is bounded** — at most 5 relocations, one pass, every move logged, no body block moved, nothing split.
13. **Constraints hold after repair** — assert buffers, 15-minute floor, body contiguity and per-goal daily limits across the whole week.
14. **Determinism** — same inputs twice, identical output, repair pass included.
15. **No regression from Prompts 33 and 34** — no block under 15 minutes, gaps on both sides of every block, splits still even.
16. Report planning wall-clock time; the repair pass must not make it noticeably slower.

---

## Note for the human

These two belong in one change because the first causes the second. Once a body goal must be one contiguous block, it becomes the least flexible thing in the week — a 90-minute session needs a 90-minute gap, where three 30s could have taken whatever was going spare. Placing it last is close to guaranteeing it does not fit.

That is also why the sort key is the longest *contiguous* block rather than the weekly total. A 90-minute Gym block is harder to place than a 150-minute SiteSmith goal, because SiteSmith can become 75 + 75 and take two ordinary gaps while Gym needs one rare long one. Sorting by size would get that backwards.

The part to be careful about is that difficulty-ordering pulls against Prompt 33, which made small goals safe by reserving each goal a share of every day before placement. If largest-first were applied to the *allocation* as well, Sports would go back to zero immediately. Keeping them separate — fair-share for how much, difficulty-order for who picks first — is what lets both properties hold at once.

