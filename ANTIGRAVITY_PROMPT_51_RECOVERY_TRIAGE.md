# PROMPT 51: Recovery mode becomes a priority triage — high in full, medium halved, low deferred

Branch: `fix/apply-claude-changes`.

This **replaces §§2–3 of Prompt 50**. Prompt 50 §1 (make the failure legible), §4 (`start_date: "tomorrow"`) and §5 (the loading state) still stand as written — do those too, unchanged.

Recovery mode currently tries to schedule everything and then rations it with a blunt 90-minute-per-day ceiling, which is why it fails outright. The new design is different in kind: **recovery decides what to schedule, not how much to trim.** Once it has decided, every surviving block is planned at its full requested length under every existing rule.

**Nothing in this prompt may change balanced or momentum output. Both work; leave them alone.**

---

## §1. The triage rule

`importance` is a three-value column — `'low' | 'medium' | 'high'` (`api/goals/route.ts:101`) — normalised to numbers by `normalizeImportance` (`context-builder.ts:21-25`) as `{ low: 2, medium: 5, high: 9 }`. Because a raw numeric value can also pass through that function unchanged, **band on thresholds, never on equality**:

```
high    importance >= 7
medium  importance >= 4 && < 7
low     importance < 4
```

Then, for a recovery week only:

### High importance — scheduled in full

`minutes_per_day` × `days_per_week`, exactly as requested. No shortening, no dropped days, no reduced session length. Every existing rule still applies — body contiguity, one body block per day, buffers, the wind-down gap, no overlaps, full-length window selection from Prompt 48 §2a.

If a high-importance goal cannot be placed in full on a recovery week, that is a bug to surface, not an outcome to accept. Recovery has fewer goals competing for the week than any other mode; there is no excuse for a high goal falling short.

### Medium importance — every goal appears, at half its weekly time

**No medium goal is ever dropped.** Missing one entirely is worse than halving all of them, which is the whole point of doing this by goal count rather than by minutes.

Halve **by days, not by minutes**:

```
recoveryDays = Math.ceil(days_per_week / 2)      // minutes_per_day unchanged
```

- `60min × 4 days` → `60min × 2 days`
- `60min × 5 days` → `60min × 3 days`  (ceil(5/2) = 3 — this is the `n/2 + 1` case)
- `45min × 3 days` → `45min × 2 days`
- `120min × 2 days` → `120min × 1 day`

`Math.ceil` guarantees at least one day for every medium goal, so the "nothing is fully missed" rule falls out of the arithmetic rather than needing a separate guard. Assert it anyway.

**The single exception — `days_per_week === 1`.** `ceil(1/2) = 1`, so halving days does nothing. For that case only, halve the minutes instead:

```
recoveryMinutes = Math.max(MIN_BLOCK_MINS, Math.round(minutes_per_day / 2 / 15) * 15)
```

floored at `MIN_BLOCK_MINS` (15) and snapped to the 15-minute grid.

**Why days and not minutes.** You offered either, and days is the better of the two. Prompts 47 through 49 were all about one thing: a block is `minutes_per_day` long, as one continuous session, and `(Shortened)` is a failure state. Halving minutes would reintroduce shortened blocks as the *normal* recovery output and undo that work. Halving days keeps every block exactly the length you asked for and simply asks for it less often — which is also what "recovery" should feel like. It matters most for body goals, where contiguity and one-block-per-day mean a 120-minute Gym cut to 60 is a different activity, whereas Gym twice instead of four times is the same activity, rested.

### Low importance — deferred entirely

Not scheduled at all on a recovery week. Not shortened, not given a token block — omitted.

**Low goals must not be reported as shortfalls.** They were deliberately deferred, and surfacing them as "Reading is 315 min short this week" makes recovery look broken. See §4.

---

## §2. Apply the triage once, at the top of the variant

`minutes_per_day` and `days_per_week` are read in roughly a dozen places inside `generateVariant` and its helpers — `:1664-1665` (goal sort), `:1719-1721` (allocation), `:1832` (swap needs), `:1878` (main loop), `:1893` (per-day target), `:2008` (`days_per_week` cap), `:2024` (per-day minutes cap), `:2453` (top-up pass), `:2729` (retitling targets), `:2764` (placement log). Patching them individually will produce a half-implemented feature that looks right in the log and wrong on the calendar.

**Instead: one function, applied once.**

```ts
export function applyRecoveryTriage(goals): {
    goals: TriagedGoal[];          // shallow copies with adjusted minutes_per_day / days_per_week
    deferred: Array<{ id, title, importance }>;   // low-importance, omitted
    summary: { full: number; halved: number; deferred: number };
}
```

Call it at the top of `generateVariant` when `strategyId === 'recovery'`, and have every downstream site read the triaged list. High goals come back untouched; medium goals come back with `days_per_week` (or `minutes_per_day`) already reduced; low goals are not in the list at all. Everything below it then behaves exactly as it does for balanced, because as far as the placement engine is concerned these simply *are* the week's goals.

**One trap: `computeRemainingWeeklyMins` (`:948-964`).** It prefers `ctx.goalProgress[…].remaining_minutes` over the goal's own numbers:

```ts
const remainingMins = progress ? progress.remaining_minutes : (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
```

`remaining_minutes` comes from the goal's real weekly target and knows nothing about the triage, so a medium goal would come back demanding its full unhalved time and silently defeat the whole feature. On recovery, clamp it:

```ts
Math.min(remainingMins, triagedDays * triagedMinutes)
```

Log the triage once per recovery variant, in the form already used elsewhere:

```
[PlanWeek] recovery triage: FULL Gym(9) PlannrAI(9) | HALF SiteSmith(5) 6d→3d, Stocks(5) 7d→4d, … | DEFERRED Reading(2)
```

---

## §3. The day caps must follow the triage, not fight it

This is what actually breaks recovery today and it does not go away on its own.

`protocol.ts:113-114` sets recovery to `maxGoalBlocksPerDay: 2, maxDeepWorkMins: 90`, and `computeEffectiveDailyCaps` (`plan-week.ts:646-666`) only relaxes them when `totalWeeklyMinsNeeded <= maxDeepWorkMins × eligibleDays × 0.75` — that is, 472 minutes. Even after triage the week will be well above that, so the caps stay enforced and impose a **630-minute weekly ceiling**. A 120-minute Gym is then unplaceable on every day (`:2024`, and for body `:2032`), and since Prompt 48 §2a made full length a hard requirement of window selection, unplaceable now means *not placed at all* rather than *trimmed to 90*.

**With the triage in place, that cap is redundant and harmful.** Recovery's lightness now comes from scheduling fewer goals, which is a far better mechanism than a per-day minute ceiling that cannot express "one long Gym session".

So, for the plan-week path only:

1. **`maxDeepWorkMins` on recovery becomes the larger of** the protocol value, the largest `minutes_per_day` among goals surviving triage, and `ceil(triagedWeeklyMins / eligibleDayCount)`. A mode cap may never make a surviving goal's own requested session length impossible.
2. **`maxGoalBlocksPerDay` likewise** — at least `ceil(triagedBlockCount / eligibleDayCount)`. Keep 2/day as the shape recovery *prefers*, but it must give before any surviving goal reaches `placed = 0`.
3. **Leave `protocol.ts` itself alone.** `generate-today` and `patch-service.ts:1613` read the same values for the daily protocol and the coach; changing the constants would alter behaviour well outside this prompt. Derive the effective caps inside `computeEffectiveDailyCaps`.

### 3a. The 120-minute buffer, and recovery's missing second variant

Both still apply from Prompt 50:

- `getBufferMinutes` (`:127-133`) returns **120** for recovery. With far fewer blocks after triage this becomes genuinely achievable, which is the point — but it must still relax through the normal relaxation passes before any surviving goal goes unplaced. Generous spacing where there is room; never "no plan".
- With weekend work off, `Spaced Mindfulness` and the `Gentle Afternoon` fallback are **both** 120-minute-buffer variants, so a single defect rejects both, `variants.length === 0`, and `:1265` throws the 500. Give the fallback a meaningfully lower buffer (45–60) so one extreme parameter can never take down the whole mode.

---

## §4. Reporting — recovery must explain itself, not look broken

The route builds `goal_shortfalls` and `warnings` from `variants[0].stats.goal_placements` (`api/calendar/plan-week/route.ts:118-142`). Left alone, a triaged recovery week will report every medium goal as short and every low goal as missing, and the user will see six warnings telling them the planner failed at exactly the moment it did what they asked.

- **`target_mins` for a recovery variant is the triaged target**, not the goal's configured weekly total. A medium goal placed at its halved target is `MET`, not `SHORT`.
- **Deferred low goals never enter `goal_shortfalls`.** Return them separately, e.g. `deferred_goals: [{ goal_id, title, reason: 'low importance — deferred for recovery week' }]`.
- **A genuine shortfall is still a shortfall.** A high goal that could not be placed in full, or a medium goal short of its *halved* target, belongs in `goal_shortfalls` and should be loud.
- **The variant description should state the trade.** Something the user reads before applying: *"Full: Gym, PlannrAI. Half: SiteSmith, Stocks, Assignments, Readings. Deferred: Reading."* Recovery is a decision about what matters this week, and the plan should say so rather than quietly returning a thinner calendar.
- The `INVARIANT VIOLATED` check at `:2775` applies to surviving goals only. A deferred low goal at zero is correct and must not log an error.

---

## §5. Do not touch

- **Balanced and momentum.** No shared code path may change their output. Every change here is gated on `strategyId === 'recovery'`.
- `protocol.ts` constants — derive effective caps instead.
- The overlap invariant and `findBlockDefects`; body contiguity and one-body-block-per-day; `MIN_BLOCK_MINS`; `BODY_WIND_DOWN_GAP_MINS`; full-length window selection from Prompt 48 §2a. Recovery must satisfy all of these, never be exempted from them.
- The weekly review flow, the coach, the rate limiter.
- Prompt 50 §1, §4 and §5 — still wanted, as written.

---

## Verification (required)

1. `npm run build` passes.
2. **Recovery generates a plan.** Post the full `[PlanWeek] "Spaced Mindfulness" placement:` block for the week that was failing.
3. **Post the triage line** for that week — which goals are full, which are halved with their day counts, which are deferred.
4. **Every high-importance goal is `MET` at 100%**, at full `minutes_per_day` per block. Post target vs placed.
5. **Gym is placed at 120 minutes**, not 90 and not zero, despite `maxDeepWorkMins: 90`.
6. **Every medium goal has at least one block.** Zero medium goals at `placed = 0`.
7. **Each medium goal's placed time matches `ceil(days_per_week / 2) × minutes_per_day`.** Post the arithmetic per goal; confirm a 5-day goal became 3 days.
8. **No medium block is `(Shortened)`.** Halving is by days; session length is untouched.
9. **A `days_per_week === 1` medium goal halves its minutes instead**, floored at 15 and on the 15-minute grid. Construct one and post it.
10. **Low-importance goals produce zero blocks**, appear in `deferred_goals`, and appear in neither `goal_shortfalls` nor `warnings`.
11. **No `INVARIANT VIOLATED` lines** for deferred goals.
12. **Balanced is byte-identical.** Post per-goal target vs placed for balanced before and after; every number must match.
13. **Momentum is unchanged.** Same check.
14. **Recovery still reads as recovery** — post blocks-per-day and total planned hours for recovery beside balanced for the same week. It should be visibly lighter and more spaced, not empty.
15. **Recovery's two variants differ.** Post both labels with their effective buffer values; they must not both be 120.
16. **The overlap invariant holds** on every recovery variant. Zero defects, zero rejected variants.

---

## Note for the human

This is a better design than what recovery had, and worth saying why. The old mechanism expressed "take it easier this week" as a per-day minute ceiling — 90 minutes, regardless of what the user's goals actually look like. That cannot represent a 120-minute Gym at all, so it produced either a shortened Gym (before Prompt 48) or no Gym (after it). Deciding *which goals* get scheduled, and then planning each of them properly, sidesteps that entirely: nothing is compromised, some things simply wait.

The one call I made without asking is halving by days rather than by minutes. You said either was fine, and days is the one that survives everything else we have fixed. Prompts 47 through 49 were a long argument that a block is `minutes_per_day` long as one continuous session and that `(Shortened)` is a failure — halving minutes would make shortened blocks the *standard* recovery output and quietly undo all of it. It matters most on body goals, where a 120-minute session cut to 60 is a different activity, while doing it twice a week instead of four times is the same activity with more rest. It is a one-line change if you want the other behaviour.

Two things worth watching in the implementation. The first is `computeRemainingWeeklyMins`, which prefers `goalProgress.remaining_minutes` over the goal's own numbers — that value is derived from the real weekly target and knows nothing about the triage, so without the clamp in §2 a halved goal would quietly demand its full time back and the feature would look implemented while doing nothing. The second is §3: the triage does not on its own rescue recovery, because the 90-minute cap still makes a 120-minute goal unplaceable no matter how few goals are competing. Both have to land together or recovery will still fail, just with a shorter goal list.

The reporting in §4 is not cosmetic. If `target_mins` stays at the configured weekly total, a working recovery week returns six warnings saying the planner fell short, and it will read as a bug every single time.
