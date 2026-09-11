# PROMPT 44: "Failed to generate plan" — surface the real error, then fix it

Plan Week now fails outright for the **current** week (Aug 31 – Sep 6, today Tue Sep 1). The toast says *"Failed to generate plan"* and nothing else. That message is hiding the actual cause.

I verified the following directly, so do not re-investigate them:

- `npx tsc --noEmit` exits **0** — no type errors.
- Prompt 42 **is applied**: `buildCalendarContext(userId, supabase?, targetWeekStart?)` at `context-builder.ts:210`, and `plan-week/route.ts:44` passes `weekStart`.
- The route catches everything and returns `Planning failed: ${e.message}` (`route.ts:125-127`), which the client renders as a generic toast.

---

## §1. Make the error visible — do this first

The failure is being flattened into six words. Before changing any logic:

- **Log the full error server-side** in the `catch` at `route.ts:125` — message **and stack**, not `e.message` alone.
- **Return the real message** to the client in development, and render it in the toast instead of "Failed to generate plan". A generic failure string on a 500 is why this is guesswork.
- Add a `console.log` at the top of the `try` with the resolved `weekStart`, `mode`, `allowWeekend` and the goal count, so the inputs are on record when it throws.

Then reproduce and **post the actual error and stack**. Everything below is ranked speculation until you have it.

## §2. Ranked suspects — all in the newly week-aware code

Prompt 42's changes are the only thing between working and not, so start there.

**a. The past-week guard fires when it should not.** `context-builder.ts:224`:

```ts
if (targetWeekStart && targetWeekStart < currentWeekStartStr) {
    throw new Error(`Planning a past week is refused: ...`);
}
```

For today (Tue 1 Sep 2026) `currentWeekStartStr` should be `2026-08-31`, and the client should send the same, so `'2026-08-31' < '2026-08-31'` is false. **Log both values.** If `currentWeekStartStr` is computing to `2026-09-07`, or the client is sending a date rather than the Monday, this throws on the legitimate current week — which matches the symptom exactly.

Check what the Plan Week modal actually sends as `start_date`, and whether it sends the *displayed* week or today's date.

**b. Invalid date arithmetic.** `weekStart = new Date(\`${weekStartStr}T00:00:00\`)` followed by `endOfWeek(...)` and `format(...)`. If `weekStartStr` is ever malformed or undefined, `new Date` yields `Invalid Date` and `date-fns` `format` throws `RangeError: Invalid time value`. Validate `weekStartStr` matches `YYYY-MM-DD` before using it, and fail with a clear message naming the bad value.

**c. A week-relative field that is now undefined.** Prompt 42 asked for `schedule.this_week` to be renamed, `goalProgress.completed_minutes_this_week` to be scoped to the target week, and `daysRemainingInWeek` to be recomputed. If any consumer still reads the old field name, it gets `undefined` and the failure appears downstream in `generateWeekPlan` rather than in the context builder. Grep for the old names and confirm every read was updated.

**d. A division by zero.** `daysRemainingInWeek` for a future week should be 7; for the current week, days from today. If it can now be 0, `daily_target_today: Math.ceil(remaining / daysLeft)` produces `Infinity` or `NaN` and something downstream throws. `context-builder.ts` previously guarded this with `Math.max(1, ...)` — confirm that guard survived.

## §3. Two things I confirmed are broken regardless

**`ts-jest` is not installed.** Running the golden-week test fails before it starts:

```
● Validation Error:
  Module ts-jest in the transform option was not found.
```

`jest.config.js` declares a `ts-jest` transform, and neither `jest` nor `ts-jest` is in `package.json`. So the one safeguard against silent regressions **has never run**. Add `jest`, `ts-jest` and `@types/jest` to `devDependencies` at the resolved versions, commit the lockfile, and confirm `npm run test:planner` actually executes.

**The test would have caught this.** Once it runs, add a case for the current week to the fixture — the failing scenario here is `weekStart` = this Monday, which is the most common call there is.

---

## §4. Do not touch

- The placement algorithm. This is a throw, not a scheduling-quality problem.
- Prompt 40's block-cap work — still on hold.
- The weekly review flow, the coach, the rate-limit fixes.

---

## Verification (required)

1. **Post the real error and stack** from §1. This is the deliverable.
2. `npm run dev` runs and Plan Week succeeds for the current week (Aug 31 – Sep 6). Post the calendar and the per-goal placement log.
3. **Name the root cause** by file and line.
4. Log the resolved `weekStart` and `currentWeekStartStr` on every Plan Week call; confirm they are what you expect for today.
5. **Errors are no longer generic** — a 500 from this route surfaces its real message in development.
6. Planning a genuinely past week is still refused, with a clear message.
7. Planning next week still works (Prompt 42's original goal).
8. `jest`, `ts-jest`, `@types/jest` declared; `npm run test:planner` runs and reports pass or fail.
9. `npm run build` passes.

---

## Note for the human

I could inspect your repo but not run it — the sandbox I have has no network access, so I could not install `tsx` to execute the planner directly, and the dev log had been cleared with the `.next` cache. So this prompt leads with instrumentation rather than a diagnosis, which is the honest position.

What I can tell you: this is almost certainly Prompt 42's change, because it is the only thing standing between "current week planned fine" and "current week fails outright", and the failure is a thrown exception rather than a bad schedule. The new past-week guard is the first thing I would look at — it throws, it is new, and it sits on exactly the path that broke. It *should* pass for the current week, since the comparison is `<` rather than `<=`, but that depends on the client sending the week's Monday rather than today's date, and I could not verify what the modal sends.

The thing that annoys me is §3. The golden-week test from Prompt 41 was written — fixture, config, snapshots, all there — but `ts-jest` was never installed, so it has never run once. A test for exactly this scenario existed and sat inert while the scenario broke. Worth fixing before anything else, because the next regression will be found the same slow way otherwise.

Also: your toast says "Failed to generate plan" while the server knows precisely what went wrong. That gap has cost us several rounds now, and §1 closes it permanently.
