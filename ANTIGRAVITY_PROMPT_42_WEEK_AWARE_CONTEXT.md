# PROMPT 42: The planner is always told about *this* week, whatever week it is asked to plan

Your diagnosis is right and it identifies a bug that **predates all recent work** — which is why production shows it too. Prompt 41's bisect is no longer needed; the cause is below. Keep Prompt 41 §5 (the golden-week test), drop the rest.

---

## §1. The context has no idea which week it is for

`context-builder.ts:234`:

```ts
export async function buildCalendarContext(userId: string, supabase?: any): Promise<CalendarContext>
```

**No target week parameter.** Every week-relative field is anchored to *now*:

```ts
:242   const todayStr = nowIst.date;
:245   const weekStart = startOfWeek(now, { weekStartsOn: 1 });   // ALWAYS the current week
:309   .gte('date', weekStartStr)                                  // this week's blocks
:487   const todayDow = now.getDay();
:488   const daysRemainingInWeek = todayDow === 0 ? 0 : 7 - todayDow;
:499   completed_minutes_this_week: completed,
:502   daily_target_today: Math.ceil(remaining / daysLeft),
:535   schedule: { today: todayBlocks, this_week: weekBlocks },
:552   date: todayStr, day_of_week: getDayOfWeek(now),
```

Then the planner is called with a **different** week:

```ts
generateWeekPlan(calendarCtx, nextMondayStr, mode, allowWeekend, protocolConfig)
```

So when the target week *is* the current week, everything lines up and the output is correct — which is exactly what you observed. When the target is any other week, the planner is reasoning about one week and writing into another.

### What that does to next week specifically

1. **`ctx.schedule.this_week` becomes the exclusion set.** The planner builds `dayExclusions` from blocks dated in the *current* week and then places blocks on *next* week's dates. It believes slots are occupied that are free, and free that are occupied. This alone produces scheduling with no discernible logic — it is the main answer to "why is it random".
2. **`computeRemainingWeeklyMins` subtracts this week's completions from next week's target** (`plan-week.ts:328` reading `ctx.goalProgress[].remaining_minutes`, built at `context-builder.ts:499`). A goal finished this week reports zero remaining and gets skipped entirely next week.
3. **`daysRemainingInWeek` and `daily_target_today`** are computed from today's weekday, so per-day targets are skewed by where we happen to be in the current week.
4. **`dailyEnergyState`** applies today's energy to a week that has not happened.

## §2. Make the context week-aware

```ts
export async function buildCalendarContext(
    userId: string,
    supabase?: any,
    targetWeekStart?: string,   // ISO Monday; defaults to the current week
): Promise<CalendarContext>
```

When `targetWeekStart` is supplied, every week-relative field must describe **that** week:

- `weekStartStr` / `weekEndStr` — the target week.
- The `weekBlocksRes` query (`:309`) — blocks within the target week, not the current one. Rename `schedule.this_week` to `schedule.target_week` so no caller can misread it, and update every consumer.
- `goalProgress.completed_minutes_this_week` — completions **within the target week**. For a future week that is zero, so `remaining_minutes` is the full weekly target. This is the fix I have described three times under different symptoms; doing it here fixes it at the source.
- `daysRemainingInWeek` — for a future week, all 7 days remain. For the current week, days from today. For a past week, zero.
- `schedule.today` and `context.date` / `day_of_week` — keep these as genuinely today (the planner uses them for "don't schedule in the past"), but they must not leak into week arithmetic.
- `dailyEnergyState` — for a future week, do not apply today's transient energy. Use the user's baseline. State what you chose.

Then pass the target week from every caller:

- `api/calendar/plan-week/route.ts` — pass its `weekStart`, so the calendar's week switcher works for any week.
- `patch-service.ts` `plan_next_week` — pass the target Monday.
- `replan_week` / `replan_day` — pass the current week explicitly rather than relying on the default.

**Guard against the past.** Planning a week that has already happened should be refused, not silently attempted.

## §3. The review cycle: Monday, reviewing last week, planning this week

Your proposed cycle is better than what we have, and it has a property worth stating: **it removes future-week planning from the weekly review entirely.** The review would plan the week the user is currently in — the case that already works.

- **Runs Monday morning.**
- **Reviews** the week that just ended: **last Monday → last Sunday**.
- **Plans** the week the user is now in: **this Monday → this Sunday**.

Rename `plan_next_week` to reflect this — it is now planning the *current* week, the same window Plan Week uses.

**Handle a late open.** If the user opens the review on Wednesday, the reviewed week is still last Mon–Sun, but only Wed–Sun of the current week can be planned. Plan from today to Sunday, never touch days already past, and say so in the confirm modal: *"Planning Wednesday to Sunday — Monday and Tuesday have already happened."*

**Keep `notBefore: todayStr`** in the `writeWeek` call so nothing dated today or earlier is disturbed. With the target week now being the current week, this guard matters more than before, not less.

Update the review's week arithmetic, the stats/`generate-report` `weekStart` defaults, and the confirm-modal copy to match. `page.tsx:193` currently defaults to `lastMonday`, which is already right for the reviewed week — confirm the *target* week is derived separately and correctly.

## §4. Do not touch

- The placement algorithm in `plan-week.ts`. This is about what it is told, not how it decides.
- Prompt 40's block-cap work — hold it until §§1–3 are in and re-measured. Some of what looked like a packing failure may have been the context mismatch.
- The coach, the rate-limit fixes, the no-reduction rule.

---

## Verification (required)

1. `npm run build` passes.
2. **Planning next week from the calendar's week switcher produces a sane schedule** — the specific thing that is broken on production. Post the calendar and the per-goal placement log.
3. **Current-week planning is unchanged.** Diff a current-week plan before and after this change; it must be equivalent. This is the regression risk.
4. **A future week sees zero completions.** Prove that `remaining_minutes` equals the full weekly target for a goal completed in the current week.
5. **Exclusions come from the target week.** Put a distinctive block in the current week only, plan next week, and confirm it does not affect the result.
6. **`schedule.this_week` is renamed** and every consumer updated. No caller reads a current-week field while planning another week.
7. **Planning a past week is refused** with a clear error.
8. **The review cycle runs Monday → reviews last Mon–Sun → plans this Mon–Sun.** Show the three date ranges.
9. **A Wednesday open plans Wed–Sun only**, leaves Mon–Tue untouched, and the modal says so.
10. **Golden-week test** (Prompt 41 §5) passes for the current week *and* a future week. The future-week case is the one that matters here.
11. Post before/after for a next-week plan, side by side.

---

## Note for the human

You isolated this better than the last several rounds of guessing did. "Current week fine, next week nonsense, on production too" narrows it to one thing, and the code confirms it: `buildCalendarContext` takes no target week. It always describes today and the week containing today, and the planner is then handed a different week to fill.

The specific reason next week comes out looking random is the exclusion set. The planner builds its picture of which time is already taken from `ctx.schedule.this_week` — blocks dated in the **current** week — and then places blocks on **next** week's dates. So it is avoiding times that are free and filling times that are not. That is not a subtle scheduling-quality issue; it is planning against the wrong calendar.

This also corrects something I told you in Prompt 41. I said the regression was probably in our uncommitted work. It was not — this bug is in `f802686` and earlier, which is exactly why production shows it. The golden-week test from that prompt is still worth building, but the bisect is not, and I would have sent you down that path for nothing.

Your Monday cycle is the right design independently of the bug. Reviewing the week that just finished and planning the week you have just started means the review never plans a future week at all — it uses the same current-week path that already works. Fixing §1 and adopting §3 together means the feature stops depending on the fragile case even after the fragile case is fixed.
