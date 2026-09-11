# PROMPT 46: One block per goal per day, real optimisation, no overlaps, and stop shortening into free space

Four faults, all in the placement path. The week in question is at **31% load, 13 blocks, 19.7h** — there is a great deal of free time, and the planner is still fragmenting, overlapping and shortening.

---

## §1. Adjacent blocks of the same goal must be one block

Monday: `PlannrAI (Part) 09:30–10:30` and `PlannrAI (Part) 10:45–11:15`. Same goal, fifteen minutes apart. That is one 105-minute session that has been cut in half for no reason the user asked for.

**The goal's `minutes_per_day` is the session length.** If a goal says 105 minutes a day, that is one 105-minute block — not two, not three.

- Remove the hardcoded ceiling at `plan-week.ts:1490`:
  ```ts
  let sessionMaxBlockMins = Math.min(90, failureAdjustments.maxSessionBlockMins);
  ```
  The 90 was mine, from Prompt 33 §3, and it is wrong as a default. The cap becomes the goal's own `minutes_per_day`.
- `planDayShape` returns **`[minutesPerDay]` — a single session** — unless no contiguous window that long exists on that day. Splitting is a fallback, not the plan.
- **Add a merge pass after placement:** any two blocks of the same goal on the same day separated by less than the buffer become one block spanning both. This is a safety net; §1's first two changes should mean it rarely fires. Log when it does, because that indicates the shape logic split something it should not have.
- **Drop `(Part)` when a block is not actually a part.** After merging, a goal placed as one session is not `(Part)` of anything.

Keep the ultradian break rules available as an *opt-in* preference, but they must not silently override an explicit `minutes_per_day`.

## §2. The planner never considers moving a flexible block to make room for a rigid one

Your example is exactly right. Monday: `SiteSmith (Part) 08:30–09:15` and `PlannrAI (Part) 09:30–10:30` hold the morning. Gym is then pushed to `22:30–23:15` and shortened. Craft work can sit next to meals; body work cannot. So the morning belongs to Gym and the craft blocks belong later — and the planner never evaluates that trade.

The cause is that placement is **greedy, goal-major, first-fit**. Each goal is filled in turn against whatever remains, and nothing revisits an earlier decision.

**a. Order strictly by constraint tightness.** Prompt 35 §2 asked for this; verify it is actually in effect and that body sorts first. Count *viable* windows after every applicable filter — energy phase, meal separation, the wind-down exclusion from Prompt 45 §2, contiguity. A goal needing one 120-minute window away from meals and evenings has far fewer options than a craft goal that can go almost anywhere, and must choose first.

**b. Add a real swap pass.** When a constrained goal cannot be placed at full length:

1. Enumerate the windows that *would* hold it, ignoring current occupancy.
2. For each, identify the flexible blocks occupying it — non-body, splittable, low constraint.
3. Check whether each such block has an alternative window elsewhere in the week.
4. If so: move the flexible block, place the constrained one, and re-validate every rule.

This is a directed swap, not a random shuffle. Bound it: **at most 8 relocations, one pass, no body block ever relocated to make room for something else, nothing split during the swap.** Log every move — what went where, and for whom.

Prompt 35 §3 specified a repair pass capped at 5. Either it was not implemented or it is not firing; determine which and report.

**c. Make the trade explicit.** A block that can sit anywhere should yield to a block that can sit almost nowhere. That principle should be visible in the code, not emergent.

## §3. Overlapping and malformed blocks — never, under any circumstances

Thursday shows `PlannrAI (Part) 15:30–` with **no end time**, overlapped by `Sports 15:45–16:45` and `Assignments (Part) 16:20–17:05`. Saturday shows `PlannrAI (Part) 09:45–10:45` sitting inside `Studying 09:30–11:00`.

There is **no post-placement overlap check for goal blocks at all**. `resolveBioBlockOverlap` and `mergeIntervals` (`:522-560`) handle bio blocks against hard zones only. Nothing validates that the emitted goal blocks are disjoint.

- **Add a final validation pass** over every generated variant: for each day, sort blocks by start and assert no block begins before the previous one ends. Any overlap is a **bug** — log it at `error` with both blocks, and do not emit the variant. Fix the cause; do not paper over it by trimming at write time.
- **Find the missing `end_time`.** A block rendering as `15:30–` means `end_time` is null, undefined or malformed. Note that `week-writer.ts` currently masks this:
  ```ts
  if (timeToMin(end) <= timeToMin(b.start_time)) end = '23:59:59';
  ```
  That turns a malformed block into one running to midnight. Find where the bad value originates in `plan-week.ts`, fix it there, and make the writer **reject** such a row with an error instead of silently rewriting it.
- **Assert in the golden-week test** (Prompt 41 §5) that no two blocks overlap and every block has a valid `end_time > start_time`. This class of bug must never reach the calendar again.

## §4. Do not shorten while free space exists

`Gym (Shortened) 22:30–23:15` on a week at **31% load** with visibly empty evenings between 19:00 and 21:30 on several days.

**Shortening is the last resort, after every relocation option is exhausted.**

Before any block is shortened:

1. Compute the **actual free time remaining** across the whole week — real gaps, after bio blocks, anchors and buffers, per day.
2. If any day has a gap that fits the block at full length, **place it there**.
3. If not, run the §2 swap pass.
4. Only if both fail may the block be shortened — and then **log the free space that existed at that moment**, so an unnecessary shortening is auditable rather than invisible.

Report a per-day free-time figure in the placement log alongside the per-goal lines. If a goal is shortened while hours are free, that pairing makes it obvious immediately.

---

## §5. Do not touch

- Body contiguity and one-per-day (Prompt 35 §1) — §1's merge applies to *all* goals and reinforces it.
- The body/wind-down gap (Prompt 45 §2) and importance-ordered shortening (Prompt 45 §1).
- The 15-minute floor (Prompt 34 §1).
- The weekly review flow, the coach, the rate-limit work.

---

## Verification (required)

1. `npm run build` passes.
2. **One block per goal per day.** PlannrAI's 105 minutes on Monday is a single block, not `09:30–10:30` + `10:45–11:15`. Post the blocks.
3. **`(Part)` appears only on genuinely split blocks**, and the merge pass logs whenever it fires.
4. **Session length follows `minutes_per_day`** — a 120-minute goal produces a 120-minute block, with no 90-minute ceiling.
5. **Gym gets a morning slot.** Re-run this week and confirm body work is placed before craft work claims the mornings. Post the before/after.
6. **The swap pass fires and is logged** — state how many relocations, what moved, and for which goal. If it never fires, explain why.
7. **Zero overlaps.** Assert across every generated variant, every day. Post the assertion and its result.
8. **Every block has `end_time > start_time`.** Name where the malformed value came from.
9. **The writer rejects malformed rows** instead of rewriting them to `23:59:59`.
10. **Nothing is shortened while free space exists.** Post the per-day free-time figures alongside the per-goal placement log for this week.
11. **Golden-week test covers overlaps and valid end times**, and passes.
12. Screenshot the regenerated week.

---

## Note for the human

You are right that this regressed, and the fragmentation is specifically my fault. Prompt 33 §3 introduced shape-first splitting with a 90-minute session cap to stop a different problem — uneven 75+30+45 fragments — and in doing so I made a hard ceiling out of something that should have been the goal's own `minutes_per_day`. If you have said you want 105 minutes of PlannrAI a day, that is the session, and the planner has no business deciding otherwise.

The deeper issue is §2, and it is the one worth the most attention. The planner is greedy and single-pass: it fills each goal in turn against whatever space is left, and never revisits a placement. So a craft block that could sit anywhere takes the 08:30 slot, and Gym — which cannot sit next to meals, cannot split, gets one block a day, and now cannot sit near wind-down — finds nothing left and gets squeezed to 22:30 and trimmed. Your observation is the correct fix: the block with almost no options should choose before the block with many, and when it still cannot fit, the planner should be willing to *move* something flexible rather than damage something rigid. That is a swap the current code never even evaluates.

The overlapping blocks are the most straightforward and the most serious. There is no overlap check on goal blocks anywhere — `resolveBioBlockOverlap` only guards bio blocks against anchors. So overlaps are not being caused by a subtle bug so much as permitted by the absence of a check. The missing `end_time` on Thursday's block is related and worse, because `week-writer.ts` quietly rewrites any such block to end at `23:59:59` rather than refusing it, which converts a visible bug into a plausible-looking wrong answer.
