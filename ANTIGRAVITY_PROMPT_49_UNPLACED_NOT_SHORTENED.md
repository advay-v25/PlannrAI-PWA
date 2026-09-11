# PROMPT 49: Blocks are now going unplaced instead of shortened, and the diagnostic has gone dark

The full-length requirement from Prompt 48 §2a landed without a working fallback, so blocks that cannot find a full-length window are now **dropped entirely**. The week went from 16 blocks / 19.7h to **9 blocks / 14.2h**, with several goals barely covered and days almost empty.

This is worse than the shortening it replaced. An 8-hour Gym target delivered as 3 hours is a worse outcome than one delivered as 8 shortened hours.

---

## §1. Every rejection reason is "unknown" — fix this first

From the placement log:

```
Assignments          target= 240m placed= 240m blocks= 6 days=4/4  MET
Gym                  target= 480m placed= 180m blocks= 2 days=2/4  SHORT — unknown
Readings for Class   target= 120m placed= 120m blocks= 4 days=2/2  MET
Sports               target= 120m placed=  60m blocks= 1 days=1/2  SHORT — unknown
SiteSmith            target= 540m placed= 450m blocks=10 days=5/6  SHORT — unknown
Stocks               target= 210m placed= 150m blocks= 5 days=5/7  SHORT — unknown
PlannrAI             target= 630m placed= 450m blocks= 5 days=5/7  SHORT — unknown
Reading              target= 315m placed= 225m blocks= 5 days=5/7  SHORT — unknown
```

**Six of eight goals short, and every reason is `unknown`.** The new full-length search rejects windows without recording why, so `lastRejection[goal.id]` is never populated on the path that now does the rejecting.

Before changing any behaviour: **every rejection must name the rule that caused it.** Window too short, energy phase mismatch, day cap, block cap, buffer, body wind-down gap, meal separation, `days_per_week` cap — whichever fired. `unknown` must be impossible; if a rejection path has no reason string, that is a bug in its own right.

Also note `Gym: days=2/4` — it used only two of its four permitted days. It did not run out of days; it stopped trying and nothing recorded why.

## §2. A block may never be dropped when the day has room

The ladder from Prompt 48 §2a exists but its lower rungs are not running. Make the fallback **exhaustive and mandatory**:

1. Every window, that day, that fits the block at full length.
2. Every window, on **every other permitted day**, at full length.
3. The swap pass — relocate a flexible block to create a full-length window.
4. **If and only if all of the above fail:** shorten — see §2a.

**Rung 4 is not optional.** The gate in §2b decides *whether shortening is acceptable*, not whether the code path exists. A block reaching the end of the ladder must always be placed at *some* length — never dropped.

**Hard invariant: `placed > 0` for every active goal, always.** A goal placed at zero minutes while its days remain available is a bug, not an outcome. Assert it and log an error if violated.

### 2a. Rung 4 in detail — concentrated, lowest-priority first

Shortening is reached **only when the alternative is not placing the block at all.** Rungs 1–3 must be genuinely exhausted first, and the log must show they were.

When a day is over by `N` minutes:

1. **Candidates** are blocks on **that day** whose current length exceeds `MIN_BLOCK_MINS`. Blocks already at the floor are not candidates.
2. **Sort ascending by importance.** Tie-break by **larger current length** — the block with the most slack absorbs first.
3. Take the first candidate and shorten it by `min(N, currentLength − MIN_BLOCK_MINS)`. Subtract from `N`.
4. If `N` remains, move to the next candidate and repeat.
5. Stop as soon as `N` reaches zero.

**Exhaust each candidate's slack before touching the next.** If a day is 60 minutes over, that is *one* block shortened by 60 — not four blocks shortened by 15 each. Concentrating the loss on one low-priority block is the goal; spreading it across the day is the failure mode to avoid.

Invariants to assert:

- **A higher-importance block is never shortened while any lower-importance block on that day still sits above `MIN_BLOCK_MINS`.**
- **The number of shortened blocks in the week is the minimum needed** for the over-full days to fit. If a day could have been made to fit by shortening one block and two were shortened, that is a bug.
- **Never below `MIN_BLOCK_MINS`** (15, from Prompt 34).
- **Only blocks on the over-full day are touched.** Never shorten a block on a day that already fits.
- Shortening always beats dropping. If shortening every candidate to the floor still leaves the day over, place what fits and report the remainder — do not drop the block.

Log every shortening as: goal, date, importance, wanted, got, minutes the day was over, and the number of blocks shortened on that day.

## §3. The gate is not running

A grep of the dev log for gate output returns **nothing**. Prompt 48 §2b's per-day free-vs-needed calculation is either not implemented or not logging.

It must log, for every day, on every plan:

```
[PlanWeek] gate <date>: free=<mins> needed=<mins> → OPEN|CLOSED
```

Without this line, there is no way to tell an over-full day from a search failure — which is the distinction the whole design rests on.

## §4. The target is exact coverage

For each goal: `placed` should equal `target`, with the block count matching `days_per_week` and each block equal to `minutes_per_day`.

`Gym target=480 placed=180 blocks=2 days=2/4` should be `placed=480, blocks=4, days=4/4`, each block 120 minutes.

Any deviation must be explained by a gate-closed day and a named rejection reason. "Short with no reason" is the specific thing this prompt exists to eliminate.

---

## §5. Do not touch

- The overlap invariant, the completion-mark fix, and the Goals-page figure from Prompt 48 §§1, 3, 4 — keep them.
- Body contiguity, the 15-minute floor, buffers, importance ordering.

Separately, the log shows a **React hydration mismatch** in `ThemeProvider` (a `<script>` rendering where a `<div>` was expected). It is unrelated to scheduling and predates this work — note it for later, do not fix it here.

---

## Verification (required)

1. `npm run build` passes.
2. **No rejection reason is `unknown`.** Post the full placement log; every `SHORT` line names a specific rule.
3. **Every active goal has `placed > 0`.**
4. **`placed == target` for every goal** unless a gate-closed day explains the shortfall. Post target vs placed for all eight.
5. **Gym is 4 × 120 minutes across 4 days.**
6. **The gate logs for all 7 days** — free, needed, open/closed.
7. **Block count recovers.** The week should be back above 16 blocks / 19.7h, not 9 / 14.2h. Post the header figure.
8. **Rung 4 fires when it should** — construct a genuinely over-full day and confirm the block is shortened rather than dropped.
8b. **Shortening is concentrated.** On a day 60 minutes over, exactly **one** block is shortened by 60, not several by smaller amounts. Post the shortening log with the count of blocks shortened per day.
8c. **Lowest importance absorbs first.** Confirm no higher-importance block was shortened while a lower-importance block on that day remained above `MIN_BLOCK_MINS`.
8d. **Minimum block count.** For each over-full day, state the minimum number of blocks that had to be shortened and confirm that is the number actually shortened.
9. **Take one goal that is currently short** and post every window in the week that could have held one of its blocks at full length. That tells us whether this was a search failure or real capacity.
10. No overlaps; no future completion marks; Goals page busiest-day figure intact.

---

## Note for the human

This is the regression I flagged when you asked how the gate would help, and it landed exactly as described: requiring full length without a working fallback converts a shortened block into a missing one. Gym went from shortened-but-present to 180 minutes of an 8-hour target across two days instead of four.

The more useful finding is that **all six reasons read `unknown`**. The diagnostic broke at the same moment the behaviour did, which is why this looks inexplicable from the calendar — the planner is rejecting placements through a new code path that records nothing. That is why §1 comes before any behavioural change: with reasons restored, the remaining questions answer themselves, and without them the next round is guesswork again.

On §2a, the part worth getting right is *concentration*. The instinct when a day is 60 minutes over is to shave a bit off everything, which feels even-handed and produces a week where nothing is the length you asked for. Taking the whole 60 out of one low-priority block leaves every other block intact, and leaves you with one clearly identified casualty rather than a diffuse sense that the planner has been trimming things. Exhausting each candidate's slack before moving to the next is what produces that, and it falls out of the sort order rather than needing separate logic.

`Gym days=2/4` is the detail I would look at first once reasons are back. It had four permitted days and used two. That is not a day-cap or a capacity limit — something rejected days three and four silently, and whatever that is will likely explain most of the other five goals too.
