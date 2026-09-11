# PROMPT 40: Four goals get nothing because the day runs out of block *slots*, not time — and the Goals page capacity is fabricated

Four separate faults. The headline one is not capacity at all.

---

## §1. The binding constraint is the per-day block count

From the placement log:

```
SiteSmith           target= 540m placed= 535m blocks=10 days=6/6  SHORT — days_per_week cap
PlannrAI            target=1260m placed=1095m blocks=20 days=7/7  SHORT — day's remaining 120m reserved for other goals
Assignments         target= 240m placed= 180m blocks= 8 days=4/4  SHORT — days_per_week cap
Readings for Class  target= 240m placed= 240m blocks= 4 days=4/4  MET
Reading             target= 315m placed= 135m blocks= 3 days=3/7  SHORT — day already at its block limit
Stocks              target= 210m placed=   0m blocks= 0 days=0/7  SHORT — day already at its block limit
Gym                 target= 480m placed=   0m blocks= 0 days=0/4  SHORT — day already at its block limit
Sports              target= 240m placed=   0m blocks= 0 days=0/2  SHORT — day already at its block limit
```

**"day already at its block limit"** is `maxGoalBlocksPerDay`, which balanced mode sets to **4** (`lib/scheduling/protocol.ts:94`).

Count what the first two goals consume: PlannrAI takes **20 blocks across 7 days (~2.9/day)**, SiteSmith **10 across 6 days (~1.7/day)**. Together ~4.6 blocks per day — the entire allowance, every day. Reading, Stocks, Gym and Sports arrive to find every day full and get **nothing**.

This is not a time problem. Gym needs 8 hours and there are hours available; there is no *slot* left to put them in.

## §2. Fair-share allocates minutes but not block slots

Prompt 33 §1's `allocateDayShares` is working for minutes — PlannrAI's log line says *"day's remaining 120m is reserved for other goals"*, which is exactly the reservation doing its job.

But block **slots** are still first-come-first-served, so the same starvation Prompt 33 fixed for minutes is happening one level up for slot count.

**Reserve block slots the same way minutes are reserved.**

- Compute each goal's slot need per day from its allocated minutes and its shape (Prompt 33 §3), then apportion the day's `maxGoalBlocksPerDay` across goals using the same largest-remainder method.
- **Every active goal with minutes allocated on a day gets at least one slot on some day of the week.** A goal must never finish `placed = 0m` because other goals took the slots.
- A goal cannot exceed its reserved slots in passes 0–1, exactly as it cannot exceed its reserved minutes.

## §3. Four slots a day cannot serve eight goals — stop over-splitting

Even with fair apportionment, 4 slots ÷ 8 goals is half a slot each. The cap has to stretch further, and the way to do that is fewer, longer blocks.

- **PlannrAI at 180 min/day should be 2 blocks (90 + 90), not ~3.** SiteSmith at 90 min/day should be **1**, not 1.7. Prompt 33 §3 asked for even, shape-first splitting; the block counts say it is still fragmenting. Find out why and fix it — the fewest sessions that satisfy the session cap, never more.
- **Raise `maxGoalBlocksPerDay` when the goal count demands it.** Four is sensible for three or four goals; with eight active goals it is arithmetically impossible. Make the cap `max(configuredCap, ceil(activeGoalCount / eligibleDays) + configuredCap)` or similar — derive a floor from how many goals genuinely need placing, and log when the configured value is raised and why.
- The cap exists to stop a fragmented day. Two 90-minute blocks are not fragmentation; six 20-minute blocks are. Consider counting **blocks under 30 minutes** double against the cap, so the limit pushes toward longer sessions rather than blocking legitimate ones.

## §4. The Goals page capacity is invented

`api/goals/route.ts:43-60`:

```ts
// Assumptions: Awake 16h (960m), Meals 3x30m (90m), Buffer 60m
const baseAvailable = 810; // 13.5 hours active time logic
const available_min_per_day = Math.max(0, baseAvailable - avgDailyAnchorMinutes);
```

A hardcoded 810 minutes a day, minus anchors. It ignores the user's real sleep window, morning routine, wind-down, real meal durations and real buffers.

Compare the actual figure from `capacity.ts`:

```
awake 108.5h − routine 5.3h − winddown 5.3h − meals 14.0h − commitments 6.0h − buffers 19.0h
= available 59.0h  vs  targeted 58.8h  →  headroom 0.3h
```

**59.0h/week is 506 minutes a day, not 759.** So the true load is `504 / 506` ≈ **100%**, and the Goals page is showing **66%**. It is telling the user a third of their day is free when eighteen minutes are free in the entire week.

**Delete the hardcoded calculation and call `capacity.ts`.** One capacity number, computed once, used by the Goals page, the planner and the weekly review. This is the third time two implementations of the same quantity have disagreed in this codebase.

While you are there: `committed_min_per_day` averages the weekly total over 7 days, which understates a goal concentrated on 3 days. Report whether the daily-load figure should be an average or a peak — a 66% average can hide a 130% Tuesday.

## §5. Buffers are consuming 19 hours a week

The same log line shows buffers at **19.0h/week** — up from 9.8h before Prompt 34. That is 163 minutes a day of buffer, and it is what took headroom from ~10 hours to 0.3.

Prompt 34 §2 asked for a buffer after every exclusion, and that was too broad. Buffers protect the *transition into and out of focused work*; two consecutive fixed blocks do not need one.

- **Buffer goal blocks from their neighbours**, in both directions.
- **Do not buffer between two consecutive bio/fixed blocks.** Sleep → morning routine, morning routine → breakfast: the user wakes and starts. No 15-minute gap is required or wanted.
- Keep the existing larger separations that are deliberate: the meal→body/high-energy gap, the pre-bed decompression, `resolveAdjacencyBuffer`'s floors.
- Recompute the capacity estimate to match and report the new figure. It should land between the old 9.8h and the current 19h.

---

## §6. Do not touch

- Body contiguity (Prompt 35 §1) — Gym and Sports must still be one block per day. §§1–3 are about giving them a slot at all.
- The 15-minute floor (Prompt 34 §1).
- The no-reduction rule (Prompt 38) — none of this licenses cutting a target.
- The weekly review flow (Prompt 37), the rate-limit fixes (Prompt 39).

---

## Verification (required)

1. `npm run build` passes.
2. **No goal finishes at 0m.** Re-run the exact scenario. Gym, Sports, Stocks and Reading all get placed. Post the full before/after placement log.
3. **No goal reports "day already at its block limit"** while other goals hold multiple slots on that day.
4. **Block slots are reserved, not raced** — log each day's slot apportionment per goal.
5. **PlannrAI's 180 min/day is 2 blocks**, SiteSmith's 90 min/day is 1. Post the counts.
6. **The cap adapts to goal count** — state the configured value, the derived value and the reason, for 8 active goals.
7. **The Goals page uses `capacity.ts`.** No hardcoded 810 remains. Report the percentage before and after — it should move from 66% to roughly 85–100%.
8. **One capacity number** — Goals page, planner and weekly review all agree. Print all three.
9. **Buffers no longer sit between consecutive bio blocks.** Post the new weekly buffer total and the new headroom.
10. **Body blocks are still contiguous** and still one per day.
11. **Nothing under 15 minutes**, no block off the 5-minute grid.
12. State whether daily load should be average or peak, and what Tuesday's peak actually is.

---

## Note for the human

Neither of the two things you were comparing is the culprit — it is a third one, and the log names it: **"day already at its block limit"**.

Balanced mode allows four goal blocks per day. PlannrAI is taking about 2.9 of them daily and SiteSmith another 1.7. That is the whole allowance gone on two goals, so Reading, Stocks, Gym and Sports arrive at every single day already full and get zero minutes. It has nothing to do with hours being available — there is simply no slot left to put them in. Prompt 33 fixed exactly this starvation for *minutes*; block slots were left first-come-first-served and the same failure reappeared one level up.

Your instinct that the numbers disagreed was right, though, and the 66% is genuinely wrong. The Goals page hardcodes `baseAvailable = 810` minutes a day with invented assumptions — 16 hours awake, three 30-minute meals, an hour of buffer, no morning routine, no wind-down. The real figure from `capacity.ts` is 506 minutes. So your true load is about 100%, not 66%, and the page is showing you a third of a free day that does not exist.

And that real capacity has itself just collapsed, for a reason I introduced. Prompt 34 §2 said to buffer every block; buffers have gone from 9.8 to **19 hours a week**, which took your headroom from ten hours to eighteen minutes. That was too blunt an instruction — a buffer between sleep and your morning routine protects nothing. §5 narrows it to what buffers are actually for.
