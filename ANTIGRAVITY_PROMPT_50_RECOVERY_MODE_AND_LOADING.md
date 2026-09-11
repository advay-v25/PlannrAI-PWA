# PROMPT 50: Recovery mode cannot generate a plan, and the Plan Week button gives no visual response

Two problems. The first is a hard failure — recovery mode returns `Planning failed. Please try again.` every time. The second is that pressing Plan Week and applying a plan both happen with no visible sign that anything is running.

Branch: `fix/apply-claude-changes`.

---

## §1. First: the real error is being discarded before it reaches you

`src/app/api/calendar/plan-week/route.ts:155-163`:

```ts
const isDev = process.env.NODE_ENV !== 'production';
return apiError(
    isDev ? `Planning failed: ${message}` : 'Planning failed. Please try again.',
    500,
    'PLAN_WEEK_FAILED',
    isDev ? { weekStart, mode, allowWeekend, stack: e?.stack } : undefined
);
```

The toast reads exactly `Planning failed. Please try again.` — the production string. So this failure was observed against a production build, where the one place that knows the cause throws it away.

Separately, **there is no recovery-mode run anywhere in `.next/dev/logs/next-development.log`.** Grepping the log for `recovery` returns zero lines. The only successful `[PlanWeek] inputs` line in it is `mode=balanced`. So there is currently no recorded evidence of what recovery actually does.

**Do this before changing any scheduling logic:**

1. Add a short, safe **reason** to the production error — not a stack, but a classified cause: `no_valid_variant`, `capacity_exhausted`, `internal_error`, plus the mode and week. A user hitting this should be able to tell you *which* failure it was, and you should be able to tell from a log line alone.
2. **Run recovery locally and post the stack trace and the `[PlanWeek]` log block.** Everything below §2 is a ranked hypothesis derived from reading the code; the trace decides which one is right. Do not skip this step and implement §3 blind.

## §2. Recovery is the only mode structurally able to fail outright

Balanced and momentum each build two variants with buffers of 15 and 0 minutes. Recovery builds two variants that **both** use a 120-minute buffer:

`plan-week.ts:127-133`, `getBufferMinutes`:

```ts
} else if (strategyId === 'recovery') {
    return timeFocus === 'weekend' ? 60 : 120;
}
```

`Spaced Mindfulness` has `timeFocus` undefined → 120. `Gentle Afternoon` has `timeFocus: 'afternoon'` → 120. `Weekend Shift` (60) is only built when `allowWeekend` is true, and the user has weekend work off.

So on a weekday-only week, **every recovery variant is a 120-minute-buffer variant.** If that constraint stack produces an overlapping or malformed block, both variants are rejected by `VariantValidationError` (`:2613`) and `:1265` throws:

```ts
if (variants.length === 0 && rejected.length > 0) {
    throw new Error(`Every schedule option contained overlapping or malformed blocks and was rejected ...`);
}
```

which becomes the 500 and the toast. Balanced and momentum cannot reach that line because their two variants do not share a single extreme parameter.

**That is the shape of the bug: recovery has no fallback variant.** Whatever the specific defect turns out to be, recovery having zero low-buffer options is what converts it from "one option fewer" into "the feature is down."

## §3. The most likely specific cause: recovery's day caps make full-length blocks impossible

`src/lib/scheduling/protocol.ts:113-114`:

```ts
maxGoalBlocksPerDay: 2,
maxDeepWorkMins: 90,
```

Those caps only relax when the week is light. `computeEffectiveDailyCaps` (`plan-week.ts:646-666`):

```ts
const weeklyCapacityUnderCaps = protocolConfig.maxDeepWorkMins * Math.max(1, eligibleDayCount);
const isLightLoad = totalWeeklyMinsNeeded <= weeklyCapacityUnderCaps * RECOVERY_LIGHT_LOAD_THRESHOLD;
```

For this user: `90 × 7 × 0.75 = 472` minutes. Actual weekly need, from the capacity log, is **2660 minutes** (44.3h). So `isLightLoad` is false and **the caps are enforced in full**: a ceiling of `90 × 7 = 630` minutes for a week that needs 2660.

Two consequences follow directly:

**a. Every block is silently truncated to 90 minutes.** `:1923`:

```ts
remainingToPlace = Math.min(remainingToPlace, dayCap.minutesHeadroom);
```

**b. Any goal whose `minutes_per_day` exceeds 90 can never be placed at all.** `:1932`:

```ts
if (goal.pillar === 'body' && !isRelaxedDayCaps && dayCap.minutesHeadroom < remainingToPlace) {
    reject(goal.id, dateStr, `body needs ${remainingToPlace}m contiguous but only ${dayCap.minutesHeadroom}m of day-cap headroom remains`);
    continue;
}
```

Gym is 120 minutes and body-pillar, so it is rejected on **every one of its permitted days**, on every pass where day caps are not relaxed. And since Prompt 48 §2a made full length a **hard requirement of window selection** rather than something negotiated down at placement time, this is no longer merely a truncation — it is a goal with **no valid window anywhere in the week**.

Before Prompt 48, this same collision produced `Gym (Shortened) 90m` and the plan still rendered. After Prompt 48, it produces nothing, and the ladder from Prompt 49 has no rung that resolves it, because the shortening rung is gated on *the day being over capacity* — and on a recovery week the day is not over capacity, it is over a **mode cap**. Those are different things, and nothing currently distinguishes them.

### The rule

**A mode cap may never make a goal's own `minutes_per_day` unplaceable.**

The caps exist to make a recovery week feel lighter, not to make it impossible. So:

1. **The effective daily minute cap is at least the largest `minutes_per_day` among goals eligible that day.** Something like `effectiveMaxDeepWorkMins = Math.max(protocolCap, maxMinutesPerDayAmongEligibleGoals)`. A 120-minute Gym under a 90-minute cap must resolve in favour of placing Gym.
2. **The block-count cap must not starve goals to zero.** `maxGoalBlocksPerDay: 2` across 7 days is 14 block slots for 8 goals needing 40+ placements. Keep 2/day as the *preference* recovery expresses, but it must relax before any goal reaches `placed = 0`. The Prompt 49 hard invariant (`placed > 0` for every active goal) applies to recovery exactly as it does to balanced — right now it is only a `console.error` at `:2637`, and on recovery it will be firing for most of the goal list.
3. **The 120-minute buffer is a preference, not a hard constraint.** It should relax through the existing relaxation passes the same way other buffers do, and it must relax before a goal goes unplaced. Recovery should mean "generous spacing where there is room for it", not "no plan".
4. **Give recovery a genuinely low-buffer second variant** so a single extreme parameter can never take down the whole mode. When `allowWeekend` is false, the fallback is currently `Gentle Afternoon` at the *same* 120-minute buffer — make that second option meaningfully different (e.g. 45–60 minutes), so `variants.length === 0` becomes structurally much harder to reach.

### 3a. Also check `MODE_BUFFER_MINS.recovery`

`src/lib/scheduling/capacity.ts:17` sets `recovery: 120`, and `computeWeekCapacity` multiplies it by every block:

```ts
const bufferMins = (goalBlocks + bioBlocks) * perBlockBuffer;
```

From the balanced log, `goalBlocks + bioBlocks = 74`. At 120 minutes each that is **8880 minutes — 148 hours of buffer in a 108.5-hour waking week**, so `availableMins` clamps to `0` and `isOvercommitted` becomes permanently true.

`context-builder.ts:444` currently calls `computeWeekCapacity` **without a mode argument**, so it always computes at `balanced` and this never fires on the plan-week path. But `dry-run.ts:109` and `patch-service.ts:1613` do pass a mode. **Report every call site that passes `mode` to a capacity function**, and confirm whether any of them is producing `availableMins = 0` for recovery. A zero denominator there also makes `daily_load_percentage` (`context-builder.ts:464`) infinite, which is a plausible route to the `minutesToTime received a non-finite value` throw at `plan-week.ts:86`.

Either the per-block figure for recovery is wrong, or capacity should not multiply the full inter-session gap by every block. Decide which and make both call paths agree.

## §4. `start_date: "tomorrow"` is 400ing

The dev log contains, twice:

```
[API FAIL] ... 400 - Invalid start_date: expected YYYY-MM-DD, received "tomorrow"
```

Nothing in `src/` sends that literal, so it is almost certainly a coach-generated `plan_week` op passing a natural-language date straight through. The 400 is correct in that a bare string should not reach the planner — but the user-visible result is a planning request that silently fails.

Normalise relative date words (`today`, `tomorrow`, `next week`, weekday names) to `YYYY-MM-DD` at the boundary that builds the op, in the user's timezone, and keep the 400 for anything still unparseable. Log which caller sent it.

---

## §5. The Plan Week button has no visual response

Three separate gaps, all real:

### 5a. The skeleton is gated behind an empty calendar

`src/app/app/calendar/page.tsx:368`:

```tsx
if (isLoading && blocks.length === 0) {
    return <CalendarSkeleton />;
}
```

`CalendarSkeleton` therefore only ever appears on a **first, empty** load. Every subsequent `loadData()` — including the one after a plan is applied — runs with `isLoading === true` and `blocks.length > 0`, so nothing renders. This is the skeleton that has "gone missing": it is still there, it just cannot show in the situation that matters.

Show a loading treatment on the calendar grid whenever a plan is being generated or applied, regardless of whether blocks are already present. Keep the existing full-page skeleton for the genuine cold start; for a refresh-in-place, dim or skeletonise the grid rather than replacing the whole page, so the week header and navigation stay stable.

### 5b. Applying an option has no loading state at all

`src/hooks/use-calendar.ts:367-425`, `applyOption` — no flag is set anywhere in it:

```ts
const applyOption = async (option: any) => {
    try {
        ...
        const result: any = await apiClient.post('/api/calendar/apply-schedule', body);
        if (result.version_id) setLastUndoToken(result.version_id);
        await loadData();
        showToast(`✅ Plan applied! ${total} blocks created.`, 'success');
```

Meanwhile `page.tsx:643` closes the modal the instant Apply is pressed:

```tsx
onApply={(opt) => { applyOption(opt); setShowPlanWeekModal(false); }}
```

So the sequence the user sees is: modal vanishes → old week still on screen → several seconds of nothing while ~40 blocks are written and the whole week is refetched → the calendar changes. **This is the phase with no feedback at all**, and it is the longest one.

- Add an `isApplying` flag to `use-calendar`, set around the whole of `applyOption` including `loadData()`, and export it alongside `isPlanning`.
- Await `applyOption` before closing the modal, or keep the modal in an "Applying…" state until it resolves. Do not fire-and-forget it.
- Drive 5a's grid loading state from `isPlanning || isApplying`.

### 5c. On failure the modal disappears instead of explaining

`plan-week-modal.tsx:80-83`:

```ts
} catch (e) {
    console.error("Plan Week Failed", e);
    onClose();
}
```

The modal closes and a red toast appears. Combined with §1's generic message, the whole interaction reads as "the button did nothing."

Keep the modal open on failure and show the error **in the modal**, on the mode step, with the reason from §1 and a Try again button. Closing the dialog should be the user's decision, not the error handler's.

The `generating` step itself (`plan-week-modal.tsx:224-248`) is fine — the ring loader and rotating text exist and their CSS (`ring-loader-1/2/3`, `animate-crossfade-in`, `globals.css:1012-1088`) is present. Leave it alone; the missing feedback is entirely in the apply phase and on failure.

---

## §6. Do not touch

- The overlap invariant and `findBlockDefects` (Prompt 48 §1) — recovery must be made to satisfy it, never exempted from it.
- Body contiguity, one body block per day, `MIN_BLOCK_MINS`, `BODY_WIND_DOWN_GAP_MINS`.
- Balanced and momentum placement behaviour. Nothing in §3 may change the output of a balanced week — post a before/after to prove it.
- The weekly review flow, the coach, the rate limiter.
- The `generating` step of the Plan Week modal.

---

## Verification (required)

1. `npm run build` passes.
2. **Post the recovery stack trace** from the local reproduction, before any fix. State which hypothesis in §2/§3 it confirms, and say plainly if it is none of them.
3. **Recovery generates a plan** for the week in question, with weekend work off. Post the full `[PlanWeek] "Spaced Mindfulness" placement:` block.
4. **Every active goal has `placed > 0`** on recovery. The `INVARIANT VIOLATED` line at `:2637` appears zero times.
5. **Gym is placed at 120 minutes**, not 90 and not zero, despite `maxDeepWorkMins: 90`. Post the block.
6. **Recovery still feels like recovery.** Post blocks-per-day and total planned hours for recovery beside balanced for the same week — recovery should be visibly lighter and more spaced, just not empty.
7. **Recovery's two variants differ.** Post both labels with their effective buffer values; they must not both be 120.
8. **Report every capacity call site that passes a mode**, and the `availableMins` each produces for recovery. None may be 0.
9. **Balanced is unchanged.** Post per-goal target vs placed for balanced before and after this prompt; the numbers must match.
10. **The production error names a reason.** Trigger a failure with `NODE_ENV=production` and post the response body — it must identify the cause without leaking a stack.
11. **`start_date: "tomorrow"` now resolves** to a real date instead of 400ing. Post the normalisation and the caller you found.
12. **Pressing Generate shows the loader; applying shows a loading state on the calendar grid** until the new week is on screen. Post a screen recording or the sequence of states.
13. **A failed generation leaves the modal open** with the reason visible and a working Try again.
14. **The grid loading state fires with blocks already present** — confirm the `blocks.length === 0` gate no longer suppresses it.

---

## Note for the human

The recovery failure has a clean explanation and it is a knock-on from Prompt 48, not something that broke on its own.

Recovery caps a day at 90 goal-minutes. Gym is 120 minutes a day. Before Prompt 48, the planner handled that collision by shrinking Gym to 90 and labelling it `(Shortened)` — ugly, but it produced a calendar. Prompt 48 §2a made full length a hard requirement of window selection, which was the right call for balanced mode, and it turned that collision into a goal with **zero valid windows in the entire week**. Prompt 49's ladder was supposed to catch exactly this, but its last rung is gated on the *day being over capacity*, and a recovery week is not over capacity — it is over a mode cap. Nothing in the code currently tells those two apart, so the block falls off the end of the ladder.

Why it takes the whole mode down rather than one option is the second half. Balanced and momentum each build two variants with different buffers, so one can fail and the other still ships. Recovery, with weekend work off, builds two variants that **both** use a 120-minute buffer — `Spaced Mindfulness` and the `Gentle Afternoon` fallback are the same extreme parameter twice. When that stack produces a defect, both variants are rejected, `variants.length === 0`, and the throw at `:1265` becomes a 500. That is why recovery is the only mode that can fail outright, and giving it a genuinely different second variant is worth doing independently of the cap fix.

I want to be straight about confidence: §3 is a reading of the code, not something I watched happen. There is no recovery run in the dev log at all, and the toast you saw is the production string, which means the one message that knew the cause was thrown away before it reached you. That is why §1 comes first and why verification item 2 asks for the trace before the fix. If the trace says something else, follow the trace.

On the loading state — the skeleton was never removed. `CalendarSkeleton` is still imported and still rendered, but behind `isLoading && blocks.length === 0`, so it can only appear on a cold start with an empty calendar. Every refresh after a plan is applied has blocks already, so it silently does nothing. The bigger gap is next to it: `applyOption` sets no loading flag anywhere, and the modal closes the moment you press Apply. So the longest part of the whole operation — writing forty blocks and refetching the week — happens with the old calendar sitting there unchanged and nothing on screen to say why. That is the part that reads as "the button did nothing", and it is a five-line fix.
