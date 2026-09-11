# PROMPT 41: Stop, measure, bisect — Plan Week has regressed and we are flying blind

**Do not add features or apply further fixes in this prompt.** The job here is to find out what broke, prove it, and put a test in place so it cannot happen again silently. Prompt 40 is on hold until this is done.

---

## §1. Establish the baseline first — this takes ten minutes and answers everything

Every change from the last several rounds is **uncommitted working-tree state** on top of `f802686`. That makes an exact A/B trivial:

```
git stash                 # back to f802686
# run Plan Week for Aug 31 – Sep 6, capture the calendar and the log
git stash pop             # back to current
# run Plan Week for the same week, capture again
```

Report both, side by side:

- Block count by type (sleep / routine / meal / wind_down / anchor / goal).
- Morning Routine's start time on every day.
- Meals present per day.
- Per-goal minutes placed against target.
- The `[Capacity]` line from each.

**This settles whether the regression is in the uncommitted work or was already present at `f802686`.** Do not proceed to §4 without it.

Note the shape of the diff before you start:

```
src/lib/calendar/ai/plan-week.ts     |  13 +      ← the placement algorithm is barely touched
src/lib/calendar/context-builder.ts  | 119 ++++   ← its inputs changed a great deal
src/lib/services/patch-service.ts    | 591 ++++++
```

The planner itself has moved 13 lines. If its output has changed drastically, the cause is almost certainly what it is being *fed*, or what happens to its output afterwards — not the placement logic.

## §2. The Plan Week path emits no placement log

From the run at `12:30:45`:

```
[Capacity] awake 108.5h ... available 59.5h vs targeted 44.3h headroom 15.3h
[PlanWeek] Mode: balanced
[Flow Protocol] Unusual wake-sleep window: 15.5h ...
[WeekWriter] plan_week: +55 ~0 -46 (skipped 0, failed 0)
```

**There is no `[PlanWeek] "Standard Balanced" placement:` block.** The per-goal diagnostic added in Prompt 27 §2 runs for the weekly review's dry run but not for the Plan Week button, so the feature the user actually presses produces no visibility at all.

Fix that first. Every path that calls `generateWeekPlan` must emit the same per-goal placement log. Without it, everything below is guesswork.

## §3. Three concrete faults visible in the output

Report on each with evidence, but do not fix them until §1 and §4 identify the cause.

**a. Morning Routine is at 13:30 on Wednesday.** Every other day it is 09:00–09:45. On Wednesday it sits in the Lunch slot — and **Wednesday has no Lunch at all**. That pattern points at `resolveBioBlockOverlap` (`plan-week.ts:419-475`) relocating the routine and then `plan-week.ts:731`'s `if (!resolved) continue;` silently dropping the displaced meal. Confirm whether an anchor or a carried block is occupying Wednesday morning.

**b. 55 blocks were written; the calendar header says 8.** `[WeekWriter] plan_week: +55` with zero skipped and zero failed, yet the UI reads `8 blocks · 12.8h`. Either the header counts only a narrow subset — it has been suspect since it read "10 blocks · 16.8h" for a visibly fuller week — or the calendar query is not returning everything that was written. Determine which. If it is only the counter, say so and label it; that is a display bug, not a scheduling one.

**c. Goal blocks are 30-minute fragments.** `SiteSmith (Part)` and `Assignments (Part)` at 10:45–11:15, 12:45–13:15, 15:30–16:00. Prompt 33 §3 asked for shape-first even splitting. Confirm whether that landed at all.

## §4. Bisect

With the baseline from §1 and the log from §2, work out which change is responsible. The uncommitted diff is large but separates cleanly:

1. `context-builder.ts` — capacity, the goals query, sleep/wake precedence. **Most likely culprit**, because it feeds the planner.
2. `patch-service.ts` + `week-writer.ts` — the new persistence path. `apply-schedule` now routes through `writeWeek`, whose clear step removes bio blocks the caller must then resupply. If the caller does not, days lose meals.
3. `plan-week.ts` — 13 lines. Read them; rule it in or out quickly.

Revert candidates one at a time against the §1 baseline and report which restores correct output. **Name the specific change, do not describe a category.**

## §5. A golden-week regression test, before any further changes

This is the real failure and it is the reason to stop here. Roughly eight sequential changes have been made to scheduling, each verified against the single symptom it targeted, with no check that the previous ones still held. That is why a working feature degraded without anyone seeing it happen.

Add a deterministic test — `generateWeekPlan` is pure and synchronous, so this is cheap:

- A fixture profile and a fixture goal set, checked into the repo.
- Assertions that must hold for **every** generated week:
  - Morning Routine starts at `wake` on all 7 days.
  - Sleep, wind-down and the configured number of meals exist on all 7 days.
  - No goal block starts before wake or after wind-down.
  - No block shorter than `MIN_BLOCK_MINS`.
  - Every block on the 5-minute grid.
  - No body goal split within a day.
  - No goal placed at 0 minutes while the week has headroom.
  - Total placed minutes per goal within tolerance of target.
- Run it in CI, and **run it before and after every future scheduling change**.

Then re-run it against the §1 baseline to establish which assertions passed at `f802686`. That tells us what "working" actually meant, rather than relying on memory.

---

## §6. Do not touch

- Do not apply Prompt 40 yet. Do not add features. Do not tune constants to make a symptom go away.
- Do not change `plan-week.ts` beyond §2's logging until the bisect names a cause.
- Leave the weekly review, the coach and the rate-limit work alone.

---

## Verification (required)

1. **§1 baseline captured**, both sides, all five data points. This is the deliverable — post it in full.
2. **A clear verdict:** was Plan Week correct at `f802686`? Yes or no.
3. **The placement log runs for the Plan Week button**, with per-goal target / placed / blocks / reason.
4. **The named cause** of the Morning Routine misplacement and the missing Wednesday Lunch.
5. **The 55-vs-8 discrepancy explained** — display bug or data bug.
6. **The bisect result** — the specific change responsible, by file and line.
7. **The golden-week test exists**, passes on the fixture, and its pass/fail is reported for both `f802686` and current.
8. `npm run build` passes.

---

## Note for the human

Your question deserves a direct answer: it broke because I kept prescribing changes to a working algorithm based on one symptom at a time, and there was no test holding the previous behaviour in place. Eight rounds of that is more than enough to degrade something that worked. That is my error, not a mystery about the code.

One fact reframes the search, though. `plan-week.ts` — the actual placement algorithm — is **13 lines** different from the last commit. `context-builder.ts`, which decides what the planner is told about your day, is 119 lines different, and the persistence layer underneath it is 591. So the algorithm almost certainly is not what broke; it is being fed different inputs, or its output is being altered on the way to the database. The `writeWeek` clear step is a strong candidate for the missing Wednesday Lunch, since it deletes bio blocks and relies on the caller to resupply them.

The other thing worth saying plainly: the Plan Week button produces no placement log at all. The diagnostic added in Prompt 27 only runs on the weekly review's dry run. So for the feature you actually press, nobody has been able to see what the planner decided — which is why this went unnoticed. That is the first thing to fix, before any code that touches scheduling.

And because all of this is uncommitted on top of `f802686`, `git stash` gives a definitive before/after in about ten minutes. Worth doing before another line is changed.
