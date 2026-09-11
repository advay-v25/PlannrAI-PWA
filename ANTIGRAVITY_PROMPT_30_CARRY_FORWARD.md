# PROMPT 30: Weekly Review carries last week forward and changes only what it said it would

**This supersedes the planning approach in Prompt 26 and Prompt 29 §1.** Those made `plan_next_week` regenerate the week from scratch. Regenerating from scratch is the wrong operation, and the screenshot of Aug 31 – Sep 6 shows why: no sleep, no meals, no wind-down, no anchors, goals missing, and unrelated blocks silently shortened.

Prompt 29 §1's fix (the `replanFromDate` lower bound) is still correct and still needed — it just isn't sufficient on its own.

---

## §1. Why sleep, meals and wind-down are missing

`patch-service.ts`, inside `plan_next_week`, at the insert filter:

```ts
const nextWeekBlocks = newPlan.blocks.filter((b: any) => {
    if (b.date < nextMondayStr || b.date > nextSundayStr) return false;
    if (b.date <= todayStr) return false;
    const BIO_TYPES = ['sleep', 'meal', 'wind_down'];
    if (BIO_TYPES.includes(b.block_type)) return false;   // ← here
    return true;
})
```

**`plan_next_week` explicitly throws away every sleep, meal and wind-down block the generator produced.** `generateWeekPlan` builds them correctly (`plan-week.ts:512-587`) and this filter discards them on the way to the database. That is the entire reason they are absent from the calendar.

Compare the Plan Week button, which keeps everything — `api/calendar/plan-week/route.ts:76-89` maps **all** `v.blocks` into `create_event` ops with no type filter, and `apply-schedule/route.ts:359` explicitly allows `['anchor','goal','meal','buffer','routine','sleep','wind_down','flex']`.

Delete the `BIO_TYPES` filter.

## §2. Why anchors are missing

`generateWeekPlan` never emits anchors as blocks — commitments become *exclusion windows* (`plan-week.ts:589-606`), not scheduled blocks. Anchor blocks are written by `anchor-service.ts` (`block_type: 'anchor'` at `:43` and `:101`), which `plan_next_week` never calls.

`apply-schedule` handles this by **preserving** existing anchors rather than recreating them — its delete step carries `.neq('block_type', 'anchor')` (`:104`, `:135`). But next week has no anchors to preserve, and nothing generates them.

Run the anchor service for the target week as part of the flow. Buffers are likewise never emitted as blocks by the generator — they exist only as gaps between blocks (`plan-week.ts:1185-1190`). Confirm whether the user's normal weeks contain `block_type: 'buffer'` rows, and if they do, find what writes them and run that too. **Report what you find rather than assuming.**

## §3. The real fix: carry forward, then patch

Regeneration is wrong even once §1 and §2 are fixed, because a full repack moves blocks that nothing asked to move. That is the "other blocks are randomly being shortened" complaint, and no amount of tuning the packer will fix it — a fresh solve has no obligation to agree with the previous one.

**The weekly review's plan for next week must be last week's plan, shifted seven days, with only the accepted changes applied.**

### The algorithm

1. **Read the reviewed week's blocks** — the week the review is about, all types.
2. **Shift every date +7 days.** Same day-of-week, same `start_time`, same `end_time`, same title, same `goal_id`, same `pillar`.
3. **Goals with no accepted change: copy verbatim.** Their blocks must land at *identical* times. This is the property the user is asking for and it should be assertable in a test.
4. **Goals with an accepted change: edit only their blocks.**
   - A duration change (`redistribute` shortening sessions) keeps the same start times and adjusts each end time.
   - A frequency change adds or removes occurrences. When removing, drop the days with the worst completion history. When adding, place the new occurrence with the generator — but constrained to the free space that remains **after** every carried-forward block is fixed in place.
   - A `pause` removes that goal's blocks and puts nothing in their place.
5. **Regenerate the bio scaffolding** — sleep, meals, morning routine, wind-down — exactly as Plan Week does. These are deterministic functions of the profile, so regenerating and copying give the same answer; regenerating is simpler and picks up profile edits.
6. **Create anchors** for the target week from current commitments (§2).
7. **Only invoke the packer for genuinely new placements.** It must treat all carried-forward blocks as fixed exclusions, never as candidates to move.

### What this changes about the review's promise

Say this in the confirm dialog: *"Next week will match this week, with these N changes applied."* That is a much stronger and more useful guarantee than "your week will be regenerated," and it is what the user actually wants from a weekly review.

**Edge cases to handle explicitly, and to report on:**

- **The reviewed week is empty or sparse.** Nothing to carry forward — fall back to a full Plan Week generation. State clearly in the response which path ran.
- **A goal exists now but had no blocks last week** (newly created, or resumed from pause). It has nothing to carry, so it gets placed by the packer into remaining space.
- **Commitments changed** since last week. An anchor now sits where a carried block used to be. The carried block must move — anchors win. Move only that block, and log it.
- **A carried block is now in the past** relative to the target week. Cannot happen if the window is next Monday–Sunday, but assert it.

## §4. One persistence path, shared with Plan Week

`plan_next_week` hand-rolls its own delete and insert. `apply-schedule` does the same job with materially different rules — it preserves anchors (`:104`), filters blocks overlapping commitments (`:195-212`), enforces per-goal daily limits (`:248-268`), and validates block types (`:359`). None of that runs in the weekly-review path.

**Extract `apply-schedule`'s persistence logic into a shared service and have both call it.** Not a copy — a single function. Two implementations of "write a week to the database" is what produced this divergence, and it will produce the next one.

While extracting, note two existing weaknesses in that code and say whether you fixed them:

- Blocks dropped by the daily-limit filter are only `console.log`'d; the route still returns success (`:248-268`).
- The insert is one all-or-nothing batch (`:292-303`) — a single bad row fails the whole week and `added` stays 0, with the error only logged.

## §5. Generator parity

If any path still calls `generateWeekPlan` (§3 step 7, and the empty-week fallback), it must be called the way Plan Week calls it.

```ts
// Plan Week — plan-week/route.ts:60-63
generateWeekPlan(calendarCtx, weekStart, effectiveMode, allowWeekend, {
    maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
    maxDeepWorkMins: modeConfig.maxDeepWorkMins,
})

// plan_next_week — patch-service.ts
generateWeekPlan(calendarCtx, nextMondayStr, mode, allowWeekend, undefined, nextMondayStr)
```

Two differences, both real:

1. **`protocolConfig` is `undefined`** in the review path, so `maxGoalBlocksPerDay` and `maxDeepWorkMins` fall back to internal defaults instead of the mode's configured caps. Different caps, different plan.
2. **`replanFromDate` is passed** — the Prompt 29 §1 bug. Keep that fix; it is still required for the fallback path.

Pass the same `SchedulingProtocol.getModeConfig(mode)` config.

Also worth checking against the screenshot: `Readings for Class (Part)` is scheduled 10:45–11:15, i.e. **30 minutes against a 60 min/day target** (240m ÷ 4 days). The `(Part)` suffix means the splitter fragmented it. Under carry-forward this stops mattering for existing goals, but confirm the splitter isn't halving blocks it shouldn't in the fallback path.

And the header reads **"6 blocks · 4.9h"** while far more than six blocks are visible. Find out what that counter counts — if it is goal blocks only, label it; if it is stale or wrong, fix it.

---

## §6. Do not touch

- The placement algorithm, energy phases, session pacing, `resolveAdjacencyBuffer`, `resolveBioBlockOverlap`. Carry-forward largely removes the packer from this flow; it is not being retuned.
- The Plan Week button's own behaviour. It regenerates from scratch by design — that is correct for what it is.
- `replan_week`.
- Prompt 27's capacity function and pause filtering.
- Prompt 28's proposal levers.
- Prompt 29 §2 (the metrics divergence), §3 (the >1h trigger) and §4 (deterministic Wins) — independent, still needed.

---

## Verification (required)

1. `npm run build` passes.
2. **Sleep, meals, morning routine and wind-down all appear** in next week after running Automatic. Post the block count by type.
3. **Anchors appear** for every commitment, on the right days. State what generates them.
4. **Buffers** — report whether they exist as rows in a normal week, and whether next week matches.
5. **Byte-identical carry-forward.** Run Automatic with **zero** accepted changes. Every block in next week must match the reviewed week exactly — same day-of-week, same start, same end, same title. Diff them programmatically and post the diff; it must be empty.
6. **A single change touches a single goal.** Accept one change to Reading only. Confirm Reading's blocks changed and **every other block is untouched**, again by programmatic diff. This is the specific complaint — prove it.
7. **Pause removes and does not backfill.** Accept a pause; that goal's blocks are gone and nothing else moved into their slots.
8. **A frequency increase places only the new occurrence**, with all existing blocks unmoved.
9. **Empty-week fallback works** and says which path ran.
10. **Anchors beat carried blocks.** Add a commitment overlapping a carried block; only that block moves, and it is logged.
11. **One persistence path.** Confirm `plan_next_week` and Plan Week call the same function. No duplicate delete/insert remains.
12. **Generator parity** — `protocolConfig` is passed on any remaining generation path.
13. **Goals actually fit.** With Prompt 29 §1 in place, post the per-goal placement log for the fallback path — every active goal placed, nothing reporting "already met".
14. Screenshot next week's calendar showing a full day: sleep, morning routine, meals, anchors, goal blocks, wind-down.

---

## Note for the human

Your instinct is right and it's the more important half of the message: the review should **not** be regenerating your week. Even with every bug fixed, a fresh solve has no obligation to agree with the previous one, so changing Reading legitimately lets the packer move Stocks. That's what you're seeing, and it can't be tuned away — it has to be a different operation. Carry forward, then patch only what changed.

The missing bio blocks were simpler than that, and slightly embarrassing:

```ts
const BIO_TYPES = ['sleep', 'meal', 'wind_down'];
if (BIO_TYPES.includes(b.block_type)) return false;
```

`plan_next_week` generates sleep, meals and wind-down correctly and then filters them out immediately before the insert. Plan Week keeps them — `apply-schedule` explicitly allows all eight block types. Anchors are a different story: the generator never emits them at all (commitments become exclusion windows, not blocks), and `apply-schedule` only gets away with that because it *preserves* the anchors already in the week. Next week has none to preserve, so nothing creates them.

The deeper issue behind all three is that there are two implementations of "write a planned week to the database", and only one of them knows the rules. §4 is the fix that stops this recurring — and I'd rather flag it now than write a Prompt 31 about the next thing the hand-rolled copy forgets.
