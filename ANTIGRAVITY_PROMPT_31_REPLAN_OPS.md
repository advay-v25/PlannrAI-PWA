# PROMPT 31: Fix `replan_week` and `replan_day` without changing what the coach can ask for

Both ops keep their meaning exactly. `replan_week` still means "redo the rest of THIS week from tomorrow"; `replan_day` still means "redo today from now". The coach's vocabulary, schemas and call sites do not change. What changes is that neither op is allowed to reach outside its own window, and both write through `writeWeek`.

Call sites confirmed, for reference — none of these need edits: `api/coach/apply/route.ts:254,262`, `lib/coach/response-generator.ts:1894,1900,2018,2024`, `lib/ai/schemas.ts:209,213`.

---

## §1. The unbounded delete — worse than the BIO_TYPES filter

**`replan_week`:**

```ts
const { data: futureBlocks } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, status, date')
    .eq('user_id', userId)
    .gt('date', todayStr);          // ← no upper bound
```

**`replan_day`:**

```ts
    .gte('date', todayStr);          // ← no upper bound
```

Neither has a `.lte(...)`. Both delete **every future block the user has, forever** — and then reinsert only the current week (`replan_week`) or today onward within the generated week (`replan_day`).

So a coach-triggered replan **destroys the next week that Weekly Review just planned**, and puts nothing back. Everything built in Prompts 26–30 is one coach message away from being wiped. This matters more than the missing bio blocks.

Bound both deletes to the window the op actually owns:

- **`replan_week`** — `tomorrowStr` … `weekStartStr + 6` (this Sunday). Nothing outside the current week.
- **`replan_day`** — `todayStr` … `todayStr`. Today only.

## §2. `replan_day` is replanning the whole week

Despite the name, its insert filter is:

```ts
if (b.date < todayStr) return false;   // TODAY ONWARDS — i.e. the rest of the week
```

`newPlan.blocks` comes from `generateWeekPlan` for the whole current week, so `replan_day` inserts **today plus every remaining day**. Combined with §1 it deletes the future and rewrites several days when the coach asked it to fix one.

Restrict the insert to `b.date === todayStr`. The existing time-of-day guard (`startMins < nowTime` → skip) is correct — keep it exactly.

Check the coach's prompt copy while you are here: `response-generator.ts:1152` and `:1157` tell the model to use `replan_day` to "reorganize the schedule around the newly added task". Once it is genuinely one day, confirm that guidance still matches. **Report if it doesn't — do not rewrite coach prompts in this task.**

## §3. The `is_locked` check has never fired

Both ops filter on a column they never selected:

```ts
.select('id, block_type, start_time, status, date')   // no is_locked
...
if (b.is_locked) return false;                        // always undefined
```

So locked blocks have been deletable in both ops for as long as they have existed. `writeWeek` selects it correctly (`week-writer.ts:179`), so switching to it fixes this for free — but note it as a real behaviour change: users with locked blocks will see them survive a replan for the first time. That is the intended behaviour, and worth calling out in your report.

## §4. The BIO_TYPES trap — these two changes must land together

Removing the `BIO_TYPES` filter on its own would be **wrong**, and so would switching to `writeWeek` on its own. They are only correct as a pair.

Today the ops are internally consistent: the delete preserves `IMMUTABLE = ['sleep','meal','wind_down','anchor']`, and the insert skips the same bio types because they were never removed. Preserve-and-skip. That pairing works — which is why `replan_week` does **not** in fact produce the half-empty day seen in `plan_next_week`, provided the days already had bio blocks. The weekly review's version broke because next week had nothing to preserve.

`writeWeek`'s clear step deletes bio blocks — it only spares anchors, locked blocks, `done` and `in_progress` (`week-writer.ts:186-197`). So:

- Switch to `writeWeek` but keep the `BIO_TYPES` filter → sleep and meals are deleted and never restored. **Half-empty days, for real this time.**
- Drop the filter but keep the hand-rolled delete → bio blocks are preserved *and* reinserted. **Duplicate sleep and meal blocks.**

Do both, in one change: pass the full generated block list (including sleep, meals and wind-down) to `writeWeek`, and let it clear and rewrite the window.

Verify `generateWeekPlan` actually emits bio blocks for the window in question. For `replan_day` restricted to a single day, confirm today's sleep/meal/wind-down blocks are in `newPlan.blocks` — if the generator only emits them for the full week, the day-scoped call may return none, and blindly clearing would leave the day genuinely empty. **Check before you switch; if they aren't there, keep preserve-and-skip for `replan_day` and say so.**

## §5. Wiring to `writeWeek`

**`replan_week`:**

```ts
await writeWeek({
    userId, supabase,
    action: 'manual',          // see the note below
    clearRange: { start: tomorrowStr, end: weekEndStr },
    notBefore: todayStr,
    add: newPlan.blocks.filter(b => b.date > todayStr && b.date <= weekEndStr),
    filterCommitmentOverlaps: true,
    enforceGoalDailyLimits: true,
    snapshot: false,           // PatchService takes its own snapshot
});
```

**`replan_day`** cannot use `clearRange`: `notBefore` is date-granular (`b.date <= notBefore`, `week-writer.ts:188`) and cannot express "today, but only after 14:30". Keep the existing id computation, including the time guard, and pass the result as an explicit `remove` list with `clearRange: null`.

Two things to get right:

- **`action`.** The `WriteAction` union is `'plan_week' | 'weekly_review' | 'optimize_day' | 'manual'`, and `action === 'manual'` **skips every preservation rule** in the clear filter — it returns `true` for anchors and completed work. Using `'manual'` here would let a replan delete anchors and finished blocks. **Add a `'replan'` action to the union** rather than reusing one, and make sure it takes the preserving branch.
- **`snapshot: false`.** `PatchService.applyPatch` already snapshots for `scope: 'week'` patches and `REGEN_OPS` undo depends on that specific `schedule_version_id`. A second snapshot inside `writeWeek` would be wasted work and could confuse the undo path. Confirm undo still restores correctly after the switch — that is verification item 9, and it is not optional.

Surface `result.skipped` and `result.failed`. Both ops currently swallow drops silently; the coach should be able to tell the user "3 blocks couldn't be placed" rather than reporting a clean success.

## §6. Generator parity

Both ops call:

```ts
generateWeekPlan(calendarCtx, weekStartStr, mode, allowWeekend, undefined, tomorrowStr)
                                                                ^^^^^^^^^ protocolConfig
```

`undefined` means `maxGoalBlocksPerDay` and `maxDeepWorkMins` fall back to internal defaults instead of the mode's configured caps, so a coach replan packs days differently from the Plan Week button at the same mode. Pass `SchedulingProtocol.getModeConfig(mode)` as Plan Week does (`api/calendar/plan-week/route.ts:60-63`).

`replanFromDate` is correct in both — unlike `plan_next_week`, their replan point is genuinely inside the week being planned, which is the case that arithmetic was written for.

---

## §7. Do not touch

- The coach's op vocabulary, schemas, prompt copy, or `coach/apply/route.ts` routing. §2 asks you to *report* on prompt copy, not change it.
- The placement algorithm, energy phases, buffers, session pacing.
- `plan_next_week` and the carry-forward path from Prompt 30.
- The Plan Week button.
- `writeWeek`'s existing logic, beyond adding the `'replan'` action in §5.

---

## Verification (required)

1. `npm run build` passes.
2. **Next week survives a replan.** Plan next week via Weekly Review, note every block. Trigger `replan_week` from the coach. Diff next week before and after — it must be **byte-identical**. Repeat for `replan_day`.
3. **`replan_week` window.** Only tomorrow through Sunday changed. Today untouched, past untouched, next week untouched.
4. **`replan_day` is one day.** Only today changed. Tomorrow onwards untouched.
5. **Blocks earlier today survive** a `replan_day` run in the afternoon.
6. **Locked blocks survive** both ops. State that this is newly true.
7. **Anchors, `done` and `in_progress` survive** both ops — confirm the new `'replan'` action takes the preserving branch and not the `'manual'` one.
8. **No missing or duplicated bio blocks.** After each op, exactly one sleep, one wind-down and the right number of meals per affected day. Post the count by type. If `replan_day` kept preserve-and-skip per §4, say so and show it still holds.
9. **Undo still works** for both ops — token issued, `/api/calendar/undo` returns 200, and the week restores intact, with `snapshot: false` in place.
10. **Skips and failures are reported**, not swallowed.
11. **Generator parity** — `protocolConfig` passed in both.
12. **Coach smoke test.** Run `src/scripts/stress_test_coach.ts`, especially Scenario 5 (`is_locked` + `replan_day` cascade). Report pass/fail against the pre-change baseline.
13. Confirm no duplicate delete/insert logic remains in either op.

---

## Note for the human

Antigravity was right that the filter is in two more places, but the more urgent thing sits three lines above it. Both replan ops delete with `.gt('date', todayStr)` and **no upper bound** — they remove every future block you have and then reinsert only the current week. So one coach message saying "replan my week" wipes the next week that Weekly Review just built, and puts nothing back. That's the fix worth making first.

The trap in the BIO_TYPES change is that the filter isn't wrong on its own. Today's delete deliberately preserves sleep, meals and wind-down, and the insert skips them precisely because they were never removed — preserve-and-skip, internally consistent. It only broke in `plan_next_week` because next week had no bio blocks to preserve. `writeWeek` uses the opposite model: it clears bio blocks and expects the caller to supply them. So either change alone breaks things — dropping the filter gives you duplicate meals, switching to `writeWeek` first gives you the half-empty days for real. They have to go in together, which is why this is a prompt rather than the two-line change it looked like.

One more thing worth flagging: `action: 'manual'` in `writeWeek` bypasses every preservation rule, including the one protecting anchors and completed work. It's the natural-looking choice for these ops and it would quietly let a replan delete your finished blocks. Hence the new `'replan'` action.

