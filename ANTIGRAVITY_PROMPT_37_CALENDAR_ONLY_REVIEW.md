# PROMPT 37: The weekly review changes the calendar, never the goals — and starts from the week that worked

**This supersedes Prompt 32 §2 (regenerate from scratch) and the goal-writing half of Prompt 26.** Keep everything from Prompts 33, 34 and 35 — those fix the planner itself and still apply to the Plan Week button.

Two changes:

1. The weekly review **must not write to the `goals` table**. Ever.
2. Next week starts as **this week's schedule**, and only the blocks the review specifically identifies are touched.

---

## §1. The review is editing your goals to fit its schedule

Confirmed in `src/app/api/weekly-review/execute/route.ts`. Every accepted proposal becomes a goal mutation:

```
:139  goalOps.push({ op: 'update_goal', goal_id, fields: { is_paused: true } });
:146  goalOps.push({ op: 'update_goal', goal_id, fields: { is_paused: true, status: 'archived' } });
:174  goalOps.push({ op: 'update_goal', goal_id, fields: updates });
:240  ops: [ ...goalOps, { op: 'plan_next_week', ... } ]
```

The goal edits run first, then the planner regenerates the entire week from the edited goals. So a single accepted proposal rewrites the user's targets permanently, and the week is rebuilt from scratch on top of that. Run it a few times and the goals page drifts away from what the user set, which is exactly what has been happening.

### The fix

- **Delete `goalOps` from this route.** No `update_goal`, no `is_paused`, no `status`, no `minutes_per_day`, no `days_per_week` — the weekly review has no business writing to `goals`.
- The goals page is the **source of truth**. The calendar follows it, never the reverse.
- Every accepted change is applied as an edit to `schedule_blocks` **for the target week only**.

Translate the proposal types accordingly:

| Proposal | Old (goal write) | New (calendar only) |
|---|---|---|
| `pause` | `is_paused: true` | omit that goal's blocks from next week |
| `redistribute` | rewrite `minutes_per_day` / `days_per_week` | move or respace that goal's blocks next week |
| `reduce` | lower the target | shorten that goal's blocks next week |
| `increase` | raise the target | **not applicable — drop it** |

**Say this plainly in the confirm modal:** *"This changes next week's calendar only. Your goals stay as they are — edit them on the Goals page if you want a permanent change."* That is now true and the user needs to know it, because a calendar-only change does not survive a future Plan Week regeneration. That is the correct trade: the review suggests, the user decides what becomes permanent.

## §2. Start from the week that worked

This week (Aug 24–30) fits: **10 blocks · 16.8h, 80% complete, 43/54**. Gym runs 15:45–17:45 and 18:30–20:10. Everything has room.

Next week, generated from the same goals: **11 blocks · 15.8h** — *less* scheduled time — with `Gym (Shortened) 23:10–23:45`, a 35-minute session at eleven at night after dinner and the COMM1201 anchor, and `Assignments 19:15–19:35` at 20 minutes.

If the goals did not change, the schedule should not change. Regenerating throws away a working arrangement and re-solves a hard packing problem from nothing, and there is no reason to expect the second solve to be as good as the first.

**Next week is this week's schedule, shifted seven days.**

- Copy every block **verbatim** — same day-of-week, same `start_time`, same `end_time`, same title, same `goal_id`, same `pillar`.
- **No resizing of any kind.** The earlier carry-forward divided a daily target proportionally across a day's blocks and produced things like a 38-minute block; that is what made it fail. Copying is copying — durations are not recomputed.
- Regenerate sleep, meals, morning routine and wind-down from the profile (deterministic, so identical), and create anchors for the target week from current commitments.
- Then apply only the triage adjustments in §3.

Fall back to a full `generateWeekPlan` **only** when the reviewed week has no usable schedule to copy. Say clearly in the result which path ran.

## §3. What to do about a missed block — in this order

For each block the user missed, work down this list and stop at the first that applies.

**1. It was properly scheduled with buffers on both sides → change nothing.**
The schedule was fine; the user did not do it. Rescheduling a block that had every chance to succeed is noise, and shrinking it punishes the user for one bad day. Keep it exactly where it is.

**2. It was back-to-back with other blocks → keep this block where it is, move the others.**
Adjacency is the problem, so fix the adjacency. The missed block stays at its time and duration; the neighbouring blocks are redistributed across the week to open buffer space around it. Never solve crowding by shrinking the block that got crowded out.

**3. The week has more hours scheduled than the week can hold → only now, shorten it.**
This requires the capacity test from Prompt 28 §2 — real evidence that the hours do not fit, not merely that the user fell short. Shorten in the **calendar only**, never the goal.

**4. None of the above → change nothing.**
Stay as close to the original schedule as possible. "We could not identify a scheduling cause" means the schedule was not the problem.

Log which branch fired for every missed block, with the reason. When the review reports what it did, it should be able to say *"Gym was missed twice; both times it had proper buffers, so we left it alone"* — that is a more useful answer than a silently rearranged week.

## §4. Blocks move, they do not shrink

Shortening is the last resort in §3 and it stays that way. When rule 2 fires, the neighbouring blocks are **relocated**, not trimmed — find them different windows in the week, using the same window search and constraints the planner uses (buffers from Prompt 34, body contiguity from Prompt 35, energy phases, day caps).

Never place a block after the wind-down period or past the user's evening anchors. `Gym (Shortened) 23:10–23:45` is the failure this rule exists to prevent — the planner treated the late-night gap as available space. Confirm the pre-bed decompression gap (`plan-week.ts:1431-1434`) is applied to relocations too.

## §5. Goals become uneditable because the review writes values the goals page rejects

There are two ways to write a goal, and they disagree about what a goal may contain.

**The goals page** (`api/goals/route.ts`) validates strictly — `:215-218` on update, `:105-108` on create:

```ts
category:   z.enum(['mind', 'body', 'craft']),
importance: z.enum(['low', 'medium', 'high']),
```

**`PatchService.update_goal`** — the path the weekly review and the coach use — validates nothing (`patch-service.ts:1373`):

```ts
const allowedGoalFields = ['title', 'pillar', 'category', 'importance', 'days_per_week',
    'minutes_per_day', 'energy_demand', 'weekly_target_minutes', 'status', 'is_active',
    'is_paused', 'priority', ...];
```

It writes whatever it is handed. And internally importance is a **number** — `normalizeImportance` (`context-builder.ts:22-25`) returns numerics, with the sort using `a.importance || 5`.

So once the review writes a goal, that goal can hold an `importance` or `category` the goals page's own schema refuses. The card then sends the current values back on save, `validateWithZod` rejects the whole payload, and the edit fails. That is the lock you are hitting: nothing is deliberately freezing the goal, the write is simply being rejected.

`category` also has no `'soul'`, while `normalizePillar` accepts `mind | body | craft | soul` — so a soul goal is uneditable regardless of the review.

### The fix

1. **Determine the real storage type first.** Check the `goals` table columns and the actual values present for `importance`, `category`, `pillar`, `status` and `energy_demand`. Report what you find. Do not guess whether importance is a string or a number — make everything agree with what the column actually is.
2. **One validation contract, defined once**, imported by both `api/goals/route.ts` and `PatchService.update_goal`. Neither path may write a value the other would reject. `PatchService` validating nothing is the deeper bug — the coach can corrupt a goal the same way.
3. **Widen the schemas to accept every value the app legitimately produces** — `'soul'` in `category`/`pillar`, and importance in whatever form is truly stored.
4. **Repair existing rows.** Goals already written with out-of-enum values stay uneditable even after §1 stops the review writing them. Find every goal whose current values fail the schema, normalise them, and report how many were fixed.
5. **Surface the error.** A failed save currently returns a 400 or `apiError('Failed to update goal', 500)` and the card shows nothing, which is why this looked like a lock rather than a rejection. Show the user what failed.

Also check `status: 'archived'` — `execute/route.ts:146` could set it, and if the goals list filters archived rows the goal vanishes entirely and reads as uneditable. §1 removes that write; confirm no goal is currently stranded in that state.

---

## §6. Do not touch

- The `goals` table, from anywhere in the weekly review flow. This is the point of the prompt.
- Prompts 33, 34 and 35 — fair-share allocation, the 15-minute floor, buffers, body contiguity, difficulty ordering. They govern the planner and still apply to Plan Week and to the fallback path.
- The Plan Week button. It regenerates from goals by design; that is correct for what it is.
- `writeWeek`, `replan_week`, `replan_day`, the coach.

---

## Verification (required)

1. `npm run build` passes.
2. **No goal is ever written.** Snapshot the `goals` table, run Automatic, run Semi-Automated, diff it. **Byte-identical.** Repeat five times and confirm no drift.
3. **Zero accepted changes → next week matches this week.** Programmatic diff of block times: same day-of-week, same start, same end, same title. The diff must be empty apart from the date shift.
4. **One accepted change touches one goal's blocks.** Everything else identical, by diff.
5. **No block is resized during the copy.** No duration differs from its source block. No 38-minute artefacts.
6. **Triage rule 1** — a missed block with buffers on both sides is left completely alone. Show the log line.
7. **Triage rule 2** — a missed block that was back-to-back keeps its own time and duration; the *neighbours* move. Post before/after.
8. **Triage rule 3 only fires on real overcommitment** — with headroom, nothing is shortened no matter how much was missed.
9. **Nothing is scheduled after wind-down.** No block lands at 23:10. Assert across the whole generated week.
10. **Sensible durations** — next week's total scheduled hours are at least this week's, given unchanged goals. Report both figures.
11. **Confirm modal states that goals are unchanged.**
12. **Fallback path works** when there is no week to copy, and says so.
13. **Goals are editable after a review.** Run Automatic, then edit every field on several goals — minutes, days, importance, category, pause, resume. All succeed. This is the reported bug; prove it directly.
14. **Report the real column types and current values** for `importance`, `category`, `pillar`, `status`, `energy_demand`, and state which were out of contract.
15. **One shared validation contract** — confirm `PatchService.update_goal` and `api/goals/route.ts` import the same schema, and that neither can write what the other rejects.
16. **A `soul` goal is editable.**
17. **Existing rows repaired** — report how many goals were normalised.
18. **A failed save shows an error** in the UI rather than silently doing nothing.
19. Screenshot next week beside this week for comparison.

---

## Note for the human

You have found the actual problem, and it is in the code exactly as you described. `execute/route.ts` turns every accepted proposal into an `update_goal` op, runs those first, and then regenerates the whole week from the modified goals. So the review edits your goals to match a schedule it is about to invent, rather than building a schedule that matches your goals. Repeated runs drift your targets away from what you set — which is why the goals page keeps changing on its own.

The second half is just as clear from your screenshots. This week: 10 blocks, 16.8 hours, 80% done, Gym at 15:45–17:45. Next week from the same goals: 11 blocks, 15.8 hours — *less* work scheduled — with a 35-minute Gym at 23:10 at night. Nothing about the goals changed, so nothing about the schedule needed to. Regeneration re-solves a hard packing problem from scratch and has no obligation to match the arrangement that was already working.

Your triage rule is the right shape, and rule 1 is the part I would have got wrong. A block that was properly scheduled with buffers and still missed is not a scheduling failure — the schedule gave it every chance. Shortening it would punish the user for one bad day and quietly ratchet the target down, which is the thing Prompt 28 was written to prevent and which the goal-writing was reintroducing by another route.

The locked-goals symptom turns out to be the same bug from the other end. There are two ways to write a goal and they disagree about what a goal may contain: the goals page validates `importance` and `category` against strict enums, while `PatchService.update_goal` — the path the review uses — validates nothing and writes whatever it is handed. Internally importance is a *number* (`normalizeImportance` returns numerics, the sort falls back to `5`). So the review leaves a value in the row that the goals page's own schema then refuses, the card sends it back on save, and the update is rejected. Nothing is freezing the goal; the write is simply bouncing, and the UI shows no error, so it reads as a lock. That is also why it only started after a review ran.

Two consequences worth being aware of. Goals already corrupted stay uneditable even once §1 stops the review writing them, so §5 includes a repair step. And with goals untouched, a calendar-only shortening lasts for that week and no longer. Press Plan Week afterwards and the original goal reasserts itself. I think that is right — the review shouldn't be able to permanently rewrite what you told it you wanted — but it does mean the modal has to say so, which is why §1 spells out the wording.
