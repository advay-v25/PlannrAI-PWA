# PROMPT 48: A mathematical gate on shortening, no overlapping blocks, and honest completion marks

Branch: `fix/apply-claude-changes`. Four fixes, in priority order.

---

## §1. Overlapping blocks — there is no check, anywhere

Monday shows `Gym 09:30–11:30` and `PlannrAI (Part) 09:30–10:30` occupying the same time. Wednesday and Thursday show `PlannrAI (Part) 09:30–10:30` against `Sports 10:00–11:00`. Tuesday has `Gym 11:00–11:45` overlapping `PlannrAI (Part) 10:45–11:45`.

A grep across `src/lib/` for any overlap assertion returns **nothing**. Overlaps are not caused by a subtle bug; they are permitted by the complete absence of a check.

**Add a hard invariant, enforced in two places:**

1. **Before a variant is returned** from `generateWeekPlan`: for each day, sort blocks by start time and assert every block begins at or after the previous one ends. Any violation is a bug — log both blocks at `error` and **do not return the variant**.
2. **Before any row is written** in `writeWeek`: reject overlapping rows rather than inserting them. A rejected row is reported to the caller, never silently dropped.

Also assert **every block has `end_time > start_time`**. Blocks rendering as `10:45 –` with no end are still appearing.

Add both assertions to the golden-week test so this class of bug cannot return.

## §2. The mathematical gate — this is the core fix

The rule, in your terms and made precise:

> **For each day: if the day's total free minutes are greater than or equal to the total minutes to be planned that day, then no block on that day may be shortened or split. Full stop.**

### 2a. First, the actual mechanism — trimming happens at the wrong moment

`plan-week.ts:1878`:

```ts
title: sessionMins < remainingToPlace ? `${goal.title} (Shortened)` : goal.title,
```

`sessionMins` is computed from **the window currently under consideration**. The planner selects a window and then shrinks the block to fit it. **Nothing asks whether a window large enough for the full block exists elsewhere that day, or on another day.**

That is the root cause, and it must be fixed directly. A gate around this line would only convert a shortened block into an unplaced one.

**Full length becomes a hard requirement of window selection, not something negotiated down at placement time.**

Restructure the search so that, for each block:

1. Collect **every** window across the whole week that can hold `minutes_per_day` in full, after buffers and all applicable rules.
2. If any exist, choose among them by the existing quality scoring (energy phase, importance, time-of-day preference). **Place at full length. Do not consider trimming.**
3. If none exist, run the swap pass (`:290`) to create one by relocating flexible blocks.
4. If the swap pass fails **and** the day's gate (§2b) is open, only then compute a reduced `sessionMins` — and reduce by the smallest amount that fits.

Note what already exists and should be reused rather than rebuilt: rigidity ordering is at `:1339`, the swap pass at `:172` and `:290`, and `shortenedLog` at `:1851` already records wanted-vs-got. The gap is that step 1 never happens — the planner commits to a window before checking whether a better one exists.

### 2b. Then, the gate as a backstop

Implement it as an explicit precondition, computed **before** placement begins:

```
dayFreeMinutes  = wakeToSleep
                − sleep − morningRoutine − windDown
                − meals − anchors/commitments
                − buffers
dayNeededMinutes = Σ (minutes_per_day of every goal assigned to that day)

if (dayFreeMinutes >= dayNeededMinutes) → SHORTENING AND SPLITTING ARE DISABLED for that day
```

When the gate is closed, the shortening and splitting code paths must be **unreachable**, not merely deprioritised. If the planner then cannot place a block at full length, that is a **placement failure to be solved by rearrangement**, not by trimming:

1. Try every other window that day.
2. Try moving a **flexible** block (non-body, no fixed window) elsewhere to open a contiguous slot.
3. Try another day.
4. If all fail, **log an error** — the gate says the time exists, so failing to use it is a bug worth surfacing loudly.

**One honest caveat.** Total free time being sufficient does not guarantee a *contiguous* window — three free hours split into six 30-minute gaps cannot hold a 120-minute block. That is why step 2 exists: the planner must actively rearrange flexible blocks to create contiguous space before concluding anything. Only when total free time is genuinely less than total needed may a block be shortened, and then it must be shortened by the smallest amount that makes the day fit, on the lowest-importance goal first.

**Log the gate decision per day**: free minutes, needed minutes, gate open or closed. When a block is shortened, log both numbers alongside it. An unnecessary trim then becomes immediately visible rather than something to hunt for in a screenshot.

## §3. Goals page — total hours planned on the busiest day

Under the daily-load bar, add a **total hours planned** figure.

- Show the total for the day that carries the **most planned minutes**, not a weekly average. A 66% average can hide a 130% Tuesday, which is exactly how overcommitment stays invisible.
- Label it clearly, e.g. *"Busiest day: 8h 40m planned of 11h 15m free (Tue)"*.
- Compute both numbers from the **same shared capacity function** the planner uses. Do not add a third implementation — the Goals page previously hardcoded `baseAvailable = 810`, and two disagreeing capacity figures have already cost real debugging time.
- When the busiest day's planned minutes exceed its free minutes, mark it visibly. That is the only state in which §2's gate opens and blocks may legitimately be trimmed.

## §4. Future blocks keep their DONE marks

Today is Thursday 3 September. Saturday shows `PlannrAI (Part) 09:45–10:45 ✓ DONE` and `SiteSmith (Part) 12:00–12:30 ✓`; Sunday shows `PlannrAI (Part) 11:00–12:00 ✓ DONE`.

Inserts always set `status: 'planned'` (`patch-service.ts:293`), so these are **not newly created marked blocks** — they are old rows that survived regeneration. `writeWeek`'s clear step spares any block with `status === 'done'`, unconditionally, including blocks dated in the future. So a block marked done on a future date survives every subsequent regeneration, forever.

Apply the rule from Prompt 47 §4 at the **clear** step, not just the insert step:

- **Days before the generation day:** preserve `done` / `incomplete` marks on blocks that already existed. Newly created blocks on those days carry no mark.
- **The generation day itself and every day after:** delete and regenerate unmarked, **regardless of status**. A `done` mark on a future date is meaningless and must not be preserved.

Report which write paths you changed, and confirm past completions are still intact after a mid-week replan.

## §5. Morning Routine drifts on anchor days

Monday, Wednesday, Thursday, Saturday and Sunday place `Morning Routine 07:00–07:45`. Tuesday and Friday — the two days with a `Financial Management 08:00–09:40` anchor — place it at **10:10–10:55**, after the anchor, with Breakfast taking the 07:00 slot instead.

Two problems: the bio-block **order** inverts (breakfast before routine), and the routine then drifts nearly three hours from its intended time even though 07:00–07:45 was free and did not overlap the 08:00 anchor at all.

- **Morning routine is anchored to wake time** and is placed first, before meals. It should only move if something genuinely occupies that slot.
- Apply Prompt 47 §1's rule here too: when a bio block must move, compute both the earlier and later candidate and take **whichever is closer to its intended time**, rather than walking forward past every zone.
- Log any bio block that ends up more than 60 minutes from its template time.

---

## §6. Do not touch

- Anchors and commitments — fixed points, nothing may move them.
- Body contiguity and the one-body-block-per-day rule.
- The weekly review flow, the coach.

---

## Verification (required)

1. `npm run build` passes.
2. **Zero overlaps.** Assert across every generated variant and every written row. Post the assertion code and its result for the week in the screenshot.
3. **Every block has `end_time > start_time`.** No `10:45 –` blocks.
4. **Post the per-day gate table** — free minutes, needed minutes, gate open/closed — for all 7 days.
5. **No shortening or splitting on any day whose gate is closed.** If the planner fails to place a full block on such a day, it logs an error; post any that occur.
5b. **Prove step 1 of §2a runs.** For one shortened block in the current output, log every window across the week that could have held it at full length. If any existed, the search was the bug, not the capacity — confirm it now places there instead.
6. **Gym is 120 minutes, PlannrAI is one block**, on every day where the gate is closed. Post per-goal target vs placed.
7. **Goals page shows busiest-day planned vs free**, computed from the shared capacity function. Screenshot it.
8. **No third capacity implementation** — confirm the Goals page, planner and weekly review all call the same function.
9. **No future block carries a completion mark** after a mid-week regeneration. Past completions survive. Post before/after for Sat and Sun.
10. **Morning Routine is at wake time on all 7 days**, including Tuesday and Friday.
11. **No bio block sits more than 60 minutes from its template time** without a log entry explaining why.
12. Golden-week test covers overlaps, valid end times, and the §2 gate.

---

## Note for the human

The overlaps have the simplest explanation possible: there is no overlap check in the codebase at all. Nothing validates that two goal blocks are disjoint, either when the plan is generated or when it is written. So `Gym 09:30–11:30` and `PlannrAI 09:30–10:30` on the same Monday is not the planner making a mistake so much as nothing ever asking whether it did.

On the shortening, the gate alone would not have fixed it and it is worth being clear about why. The trim happens at `:1878`, where `sessionMins` comes from whichever window the planner is currently looking at — it picks a window, then shrinks the block to fit. Nothing in that path ever asks whether a window big enough for the whole block exists elsewhere in the week. Wrapping a gate around that line would have turned a shortened Gym into an unplaced Gym, which is worse. §2a is the real fix: gather every window that fits the full block *first*, and only negotiate the length after that search, the swap pass, and the gate have all failed.

Worth knowing that the two mechanisms I assumed were missing are actually present — rigidity ordering at `:1339`, the swap pass at `:172` and `:290`. So this is not about adding machinery. It is that the planner commits to a window before checking whether a better one exists, and the machinery never gets a chance to matter.

The gate in §2b still earns its place as a backstop: it turns "the AI shortened something for no reason" from a judgement call into an assertion that either holds or fails. The one thing I would not overpromise is contiguity — enough total free time does not guarantee a single unbroken window, which is exactly what the swap pass is for.

The completion marks turned out to have a specific cause worth knowing. Inserts always write `status: 'planned'`, so nothing is creating marked future blocks — instead, `writeWeek`'s clear step spares every block with `status === 'done'` without checking its date. A block marked done on a future day therefore survives every regeneration permanently. Fixing it at the insert step would not have worked; the spare rule at the clear step is where it lives.
