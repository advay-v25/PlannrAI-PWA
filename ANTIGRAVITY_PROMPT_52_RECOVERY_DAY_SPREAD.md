# PROMPT 52: Recovery mode must spread its blocks across the week, not stack them at the front

Branch: `fix/apply-claude-changes`. Follows Prompt 51 and depends on it — the triage there is what makes this visible, because a recovery week has few enough blocks that clumping is obvious.

**Recovery only. Balanced and momentum both work; no change here may alter their output.**

---

## §1. Why recovery front-loads and clumps today

Two separate causes, both in the day-selection path.

### 1a. The day order is computed once per goal and then never revisited

`plan-week.ts:1908-1966` builds `preferredDays` and sorts it **once, before the goal's day loop begins**:

```ts
} else if (strategyId === 'recovery') {
    preferredDays.sort((a, b) => {
        const loadA = workloadPerDay.get(a) || 0;
        const loadB = workloadPerDay.get(b) || 0;
        if (loadA !== loadB) return loadA - loadB;
        return forceLightWeekend ? b - a : a - b;
    });
}
```

The loop at `:1981` then walks that fixed list, and `recordGoalBlockPlacement` (`:2220`) updates `workloadPerDay` **after** the order was decided. So a goal's own placements never influence where its *next* block goes.

The consequence: at the start of a variant every day has a load of zero, the tie-break is `a - b`, and the first goal therefore takes **Monday, Tuesday, Wednesday** — consecutive days — rather than Monday, Wednesday, Friday. Every subsequent goal inherits a week that is already lumpy, and on a recovery week with a third of the usual blocks there is nothing later to even it out.

### 1b. Load is measured in minutes, not blocks

`workloadPerDay` accumulates minutes. A day holding one 120-minute Gym reads as "heavier" than a day holding three 45-minute blocks, so the balancer keeps adding blocks to the second day. You asked for **equal block load across weekdays**, which is a different quantity and the right one for how a day actually feels in recovery.

### 1c. The later passes walk the week in raw calendar order

`:1979`:

```ts
const daysToTry = pass === 0 ? preferredDays : allDays;
```

`allDays` is `[1,2,3,4,5,6,7]`. Every relaxation pass, and the top-up pass at `:2453`, therefore starts at Monday and works forward — re-introducing front-loading precisely when the planner is trying hardest to place things.

### 1d. `forceLightWeekend` currently does the opposite of its name

`forceLightWeekend ? b - a : a - b` sweeps the week **backwards**, so on a variant flagged as wanting a light weekend the day order runs Sun → Mon. It is inert today only because `Gentle Afternoon` is built with `allowWeekend: false`, so weekends are never in the list. Once §2 gives weekends an explicit weight this flag must express "fewer blocks on Sat/Sun", not "start at Sunday".

---

## §2. The rule

**On a recovery week, blocks are distributed as evenly as possible across the available weekdays, weekends carry visibly less than weekdays, and a single goal's sessions are spaced apart rather than run on consecutive days.**

Implement it as one ranking function, evaluated **live for every block placed**, not once per goal:

```ts
// recovery only
const RECOVERY_WEEKEND_WEIGHT = 0.5;     // a weekend day should carry ~half a weekday's blocks
const RECOVERY_ADJACENCY_PENALTY = 1.0;  // worth one whole block of load to avoid back-to-back days

function rankRecoveryDays(candidateDays, goal, goalBlockCountPerDay, workloadPerDay, daysUsedByThisGoal) {
    // lower score wins
    //   loadScore   = (blocksAlreadyOnDay + 1) / dayWeight
    //   dayWeight   = isWeekend(d) ? RECOVERY_WEEKEND_WEIGHT : 1.0
    //   adjacency   = thisGoalAlreadyUses(d-1) || thisGoalAlreadyUses(d+1) ? RECOVERY_ADJACENCY_PENALTY : 0
    //   score       = loadScore + adjacency
    // ties, in order: larger gap from this goal's nearest existing day
    //                 → fewer total minutes on the day
    //                 → lower day number
}
```

Three things follow from that shape, and all three are required:

1. **Block count is the primary quantity, minutes only a tie-break.** Equal block load across weekdays is the goal; total minutes decides between two days that already hold the same number of blocks.
2. **A weekend day costs twice as much as a weekday.** Dividing by `0.5` means a Saturday holding one block ranks as heavily as a Tuesday holding two, so weekends fill roughly half as fast. This is a weighting, not a hard cap — a week that genuinely needs the weekend can still use it, it just goes there last.
3. **A goal does not take consecutive days while a non-adjacent day of equal or lower load exists.** A medium goal halved to 3 days out of 5 should land Mon / Wed / Fri, not Mon / Tue / Wed. This is what "Spaced Mindfulness" claims to do and currently does not.

### 2a. Re-rank after every placement

This is the part that actually fixes it. After `recordGoalBlockPlacement` (`:2220`) updates the counters, the next day must be chosen from the **updated** ranking. Either re-sort `preferredDays` inside the loop or, better, select the next day by taking the minimum of the ranking function each time rather than iterating a precomputed array.

Whatever the mechanism, the invariant is: **no day is chosen using a load figure that predates a placement already made in this variant.**

### 2b. The relaxation and top-up passes use the same ranking

Replace the raw `allDays` at `:1979` for recovery with the live ranking, and do the same for the top-up sweep's `topUpDays` at `:2453` (currently a literal `[1, 2, 3, 4, 5, 6, 7]`). A relaxation pass exists to find room, not to refill Monday.

### 2c. Body day-lanes

The body-pillar apportionment at `:1766-1809` assigns body goals to day lanes with `largestRemainderApportion` over `eligibleDays` before the main loop runs. On recovery, those lanes must be spread with the same spacing intent — two Gym sessions belong on Tuesday and Friday, not Monday and Tuesday. Body goals are the ones where back-to-back sessions matter most physically, so if only one thing gets the spacing treatment it should be these.

### 2d. Fix `forceLightWeekend`

Make it mean what it says: on a variant with `forceLightWeekend`, apply a stronger weekend weight (e.g. `0.25` instead of `0.5`) rather than reversing the day sweep. Remove the `b - a` reversal — a variant's identity should not come from walking the calendar backwards.

---

## §3. Constraints this must not break

- **Prompt 51's triage.** Medium goals still get exactly `ceil(days_per_week / 2)` days; this prompt changes *which* days, never *how many*.
- The `days_per_week` cap at `:2008`, `MIN_BLOCK_MINS`, full-length blocks, body contiguity and one body block per day, the wind-down gap, the overlap invariant.
- `allowWeekend: false` still means **zero** weekend blocks. The weekend weighting only applies when weekends are permitted at all.
- Adjacency spacing is a preference, not a hard rule. A goal with more days than half the eligible week (a 6-day high-importance goal on a 5-weekday week) must still place — spacing yields before a goal goes short.

---

## §4. Do not touch

- **Balanced and momentum.** Every change is gated on `strategyId === 'recovery'`. The `timeFocus === 'weekend'` and `timeFocus === 'weekday'` branches at `:1911-1937` are shared with those modes — do not modify them; add the recovery ranking as its own path.
- `protocol.ts` constants.
- The weekly review flow, the coach, the rate limiter.
- Everything Prompt 51 §5 lists.

---

## Verification (required)

1. `npm run build` passes.
2. **Post a block-count-per-day table** for a generated recovery week: Mon–Sun, blocks and minutes each.
3. **Weekday block counts are even** — the difference between the busiest and quietest weekday is at most 1 block.
4. **Weekends are lighter.** With `allow_weekend: true`, each weekend day carries no more than about half the mean weekday block count. Post the figures.
5. **`allow_weekend: false` still yields zero weekend blocks.**
6. **No goal occupies consecutive days** while a non-adjacent eligible day with equal or lower block count was available. Post any exceptions with the reason they were unavoidable.
7. **A medium goal halved to 3 of 5 weekdays lands on non-adjacent days** — Mon/Wed/Fri or equivalent. Post the dates for every halved goal.
8. **Body goals are spaced.** Post Gym's dates; two sessions must not be back-to-back unless the week left no alternative.
9. **The ranking is live.** Add a log line showing, for a few placements, the day chosen and the block counts it was chosen against — and confirm those counts include blocks placed earlier in the same variant.
10. **Relaxation and top-up passes do not front-load.** Re-run a week tight enough to reach pass 2+ and confirm the added blocks are not clustered on Monday.
11. **Prompt 51's arithmetic is intact** — every halved goal still gets exactly `ceil(days_per_week / 2)` days, every high goal its full count.
12. **Balanced is byte-identical.** Post per-goal target vs placed and a per-day block count for balanced before and after; every number must match.
13. **Momentum is unchanged.** Same check.
14. **Zero overlaps, zero rejected variants** on recovery.

---

## Note for the human

The clumping has a precise cause and it is a small one. `preferredDays` is sorted once, before a goal starts placing, and `workloadPerDay` is only updated after each block lands — so a goal's own placements never affect where its next block goes. At the start of a variant every day is at zero, the tie-break is the day number, and the first goal walks straight down Monday, Tuesday, Wednesday. Everything after that inherits a lopsided week. On balanced this mostly washes out because there are enough blocks to fill every day anyway; on recovery, with a third of the blocks, there is nothing left to even it out and the lopsidedness is the whole calendar.

Two details worth flagging. The balancer counts **minutes**, so a day holding one 120-minute Gym looks busier than a day holding three 45-minute blocks and keeps attracting more blocks — which is the opposite of what you asked for. Ranking on block count with minutes as the tie-break is the change, and it is the one that makes "equal load across weekdays" mean what you mean by it.

The other is `forceLightWeekend`, which currently reverses the day sweep so the week runs Sunday backwards to Monday. It is harmless today only because the variant that sets it also has weekends switched off, so the flag never sees a weekend. Once weekends carry an explicit weight, that reversal would actively fight the thing the flag is named after — so it should become a stronger weekend penalty rather than a backwards walk.

The adjacency penalty is the piece I would watch in review. It is deliberately soft — worth about one block of load — so it spaces sessions when there is a choice and gets out of the way when there is not. Making it hard would be the obvious instinct and would start pushing goals short on tight weeks, which is a worse failure than two Gym sessions landing on Tuesday and Wednesday.
