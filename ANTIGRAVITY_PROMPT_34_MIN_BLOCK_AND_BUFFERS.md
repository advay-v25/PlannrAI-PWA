# PROMPT 34: A 15-minute floor that actually holds, and buffers around every block

Two narrow fixes. Everything else about the current plan is right — do not restructure anything.

The case: **Sports 09:45 → 09:55, ten minutes**, starting the instant Morning Routine ends (09:00–09:45) and finishing five minutes before Breakfast (10:00). Too short, and touching its neighbours on both sides.

---

## §1. The minimum block is 15 minutes, absolutely

There are three floor computations and all three derive the floor from the goal's own target:

```ts
// plan-week.ts:483
const minBlock = (g: any) => Math.min(30, perDayCap(g));
// plan-week.ts:1415
const minBlockFloor = Math.min(30, targetMinsPerDay);
// plan-week.ts:1796
const minBlockFloor = Math.min(30, targetMinsPerDay);
```

A goal whose per-day allocation is 10 minutes therefore gets a **10-minute floor**, and a 10-minute block passes. The floor is supposed to stop slivers; deriving it from the target means it can never do that.

Worse, body goals skip the check entirely:

```ts
// :1416, :1801, :1837
if (remainingToPlace < minBlockFloor && goal.pillar !== 'body') { … continue; }
```

Sports is `BODY`, so both guards missed it.

### The fix

- **One exported constant: `MIN_BLOCK_MINS = 15`.** Replace all three computations with it. No `Math.min` against the target, no per-goal derivation.
- **Remove the `goal.pillar !== 'body'` exemption** from all three sites. A 10-minute gym session is no more useful than a 10-minute reading session. If the exemption exists to let short mobility work through, 15 minutes still allows that.
- **Never emit a block shorter than 15 minutes**, under any relaxation pass. This is a hard invariant, not a preference — assert it before returning the variant and log an error if anything violates it.

### Fix the allocation, not just the check

Rejecting the sliver is not enough — Sports would then get nothing, which is what Prompt 33 §2 was written to prevent. **The number of days must fall out of the minimum, not the other way round.**

```
usableDays = min(days_per_week, floor(weeklyTarget / MIN_BLOCK_MINS))
perDay     = round(weeklyTarget / usableDays)   // rounded to 5, never below 15
```

Sports at 30m/week gives `floor(30/15) = 2` days → either one 30-minute session or two 15s, rather than three 10-minute slivers. Apply this before the placement loop, so the fair-share allocation from Prompt 33 §1 is handed day counts that can actually produce legal blocks.

If a goal's entire weekly target is under 15 minutes, place one 15-minute block and report the overshoot, or place nothing and report it short. Say which you chose.

## §2. Buffers around every block, not only after goal blocks

`Sports` starts at **09:45**, exactly when Morning Routine ends. There is no gap because the buffer is only ever attached to goal blocks:

```ts
// :1530, :1668, :1851
dayExclusions.push({ start, end: start + placedMins + buffer, title: goal.title, type: 'goal' });
```

Bio and routine exclusions get no trailing buffer at all. Meals are the sole exception (`:1444`, `:1814` add 45 minutes before body or high-energy work), which is why this only shows up against routine and wind-down.

### The fix

- **Every exclusion gets a trailing buffer** — `routine`, `meal`, `sleep`, `wind_down`, `anchor` and `goal` alike. Use the same `getBufferMinutes(strategyId, …)` value already in use, and keep the existing larger meal separation where it applies.
- **Reserve the buffer before a following fixed block too.** Sports ended at 09:55 with Breakfast at 10:00 — five minutes. A goal block must end at least `buffer` minutes before the *start* of the next fixed block, not merely avoid overlapping it. Treat fixed blocks as occupying `[start − buffer, end + buffer]` when searching windows.
- **Keep `resolveAdjacencyBuffer`'s floors** (`practical-constraints.ts:202-232`) — 20 after an anchor, 15 across a pillar change, wider between consecutive high-energy work. Those are minimums layered on top, not replacements.
- The buffer is reserved space, not a block. Do not start emitting `block_type: 'buffer'` rows — nothing consumes them and the stats would double-count.

**Check the effect on capacity.** Buffering every block consumes real time — the capacity function (Prompt 27 §4) estimates buffers as `Σ goals(days_per_week) × bufferMinutes`, which now understates it, since bio blocks are buffered too. Update that estimate so `availableMins` stays honest, and report the before/after figure.

---

## §3. Do not touch

- The fair-share allocation and split-shape logic from Prompt 33 — this only changes the floor those calculations respect and the space they must leave.
- The energy model, session caps, the 90-minute rule, meal separation distances.
- The weekly review flow, `writeWeek`, `replan_week` / `replan_day`.

---

## Verification (required)

1. `npm run build` passes.
2. **No block under 15 minutes anywhere** in a generated week, for any pillar, at any relaxation pass. Assert programmatically across every variant and post the shortest block found.
3. **Sports is placed legally** — one 30-minute session or two 15s, never three 10s. Post its blocks.
4. **The body exemption is gone** from all three sites.
5. **`MIN_BLOCK_MINS` is a single constant** — no remaining `Math.min(30, …)` floor derivation.
6. **Gaps on both sides.** No goal block starts at the exact end time of any preceding block, and none ends within the buffer of a following fixed block. Check specifically against Morning Routine and Breakfast. Post the Monday timeline start-to-end.
7. **Buffers hold for bio blocks too** — routine, sleep, wind-down, anchors.
8. **Capacity updated** — report `availableMins` before and after the buffer change.
9. **Nothing regressed from Prompt 33** — post the per-goal placement log and confirm no goal starves and splits are still even.
10. Screenshot Monday 09:00–11:00 showing the gaps.

---

## Note for the human

The 10-minute Sports block is my fault twice over. Prompt 33 §2 said to guarantee every body goal at least one slot, and Antigravity did exactly that — it found the only gap left in the day and put Sports in it. And the floor that should have caught it is computed as `Math.min(30, targetMinsPerDay)`, so a goal with a 10-minute daily allocation gets a 10-minute floor. A minimum derived from the thing it is meant to constrain cannot constrain it. On top of that, all three floor checks carry `&& goal.pillar !== 'body'`, so Sports was exempt anyway.

The real fix is that day count should follow from the minimum rather than being decided first: 30 minutes a week at a 15-minute floor is at most two days, so the allocator should never have been asked to find three slots.

The buffer gap has a simpler cause — `dayExclusions` adds the buffer only when pushing a *goal* block. Routine, sleep and wind-down are pushed without one, so a goal can legally begin the same minute Morning Routine ends. Meals escaped notice because they already carry their own separate 45-minute separation rule.

One consequence worth flagging: buffering every block consumes genuine time, so `availableMins` will drop. It should — the old number was optimistic — but Prompt 28 uses that figure to decide whether to ever ask you to reduce a target, so it needs to move for the right reason and be visible when it does.
