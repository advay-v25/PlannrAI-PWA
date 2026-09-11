# PROMPT 32: The weekly review hands its change to the Plan Week planner and gets out of the way

**This replaces the carry-forward approach from Prompt 30.** Carry-forward was my suggestion and it is the wrong machine — it is deforming blocks instead of planning them. Delete it from this path.

The process the user wants, and the one to build:

1. Weekly Review proposes a change **that is anchored to time actually missed that week**.
2. The user accepts it (Automatic: straight from the card. Semi-Automated: via the review-changes page).
3. The accepted change is written to the `goals` table.
4. **The Plan Week planner plans the whole week** — the same working pipeline as the Plan Week button on the calendar — reading the goals as they now stand.
5. The week is written with every block type present.

The weekly review's only job is deciding *what changes about the goals*. All scheduling belongs to the planner that already works.

---

## §1. Carry-forward is producing the mangled blocks

`src/lib/services/carry-forward.ts:318`:

```ts
: Math.round((durationOf(b) / originalTotal) * newMins);
```

It takes `new_minutes_per_day` as a **daily budget** and splits it across that day's existing blocks *in proportion to their old lengths*. That is why the calendar shows `SiteSmith 14:45–15:23` — a 38-minute block, off the 15-minute grid, that no scheduler would ever emit. Every other odd duration in that screenshot comes from the same line.

It also explains blocks vanishing: when a proportional share falls under the minimum, the block is dropped rather than placed.

And it did not even achieve the change — the modal promised **Stocks 30m/day → 35m/day**, and the resulting Stocks blocks are still 30 minutes (`14:15–14:45`, `16:15–16:45`, `16:00–16:30`).

**Remove `carry-forward.ts` from the `plan_next_week` path entirely.** Delete the file if nothing else imports it; check first and say what you found.

## §2. Plan the week exactly the way the Plan Week button does

`plan_next_week` becomes a thin wrapper around the working pipeline.

```ts
// 1. Goal changes are already committed by the update_goal ops that run first.
const calendarCtx = await buildCalendarContext(userId, supabase);
const modeConfig = SchedulingProtocol.getModeConfig(mode);

// 2. Same call shape as api/calendar/plan-week/route.ts:60-63.
//    NOTE: no replanFromDate — see §3.
const variants = await generateWeekPlan(calendarCtx, nextMondayStr, mode, allowWeekend, {
    maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
    maxDeepWorkMins: modeConfig.maxDeepWorkMins,
});

// 3. Write EVERY block type — sleep, meals, routine, wind_down included.
await writeWeek({
    userId, supabase,
    action: 'weekly_review',
    clearRange: { start: nextMondayStr, end: nextSundayStr },
    notBefore: todayStr,
    add: variants[0].blocks.filter(b => b.date >= nextMondayStr && b.date <= nextSundayStr),
    filterCommitmentOverlaps: true,
    enforceGoalDailyLimits: true,
    snapshot: false,
});
```

Then run the anchor service for the target week, as Prompt 30 §2 established — the generator emits commitments as exclusion windows, not blocks.

Keep the `nextMondayStr <= todayStr` guard. Keep the undo snapshot behaviour from `PatchService`.

**The change reaches the plan through the `goals` table, not through the scheduler.** Ops execute sequentially, so `update_goal` has already written `minutes_per_day = 35` before `buildCalendarContext` runs. The planner reads 35 and plans 35. Nothing needs to tell it about the proposal — that is the whole point of doing it this way, and it is why Stocks will actually come out at 35 minutes.

## §3. Why this still needs the progress fix

Do **not** pass `replanFromDate`. But that alone is not enough.

`computeRemainingWeeklyMins` (`plan-week.ts:328`) prefers `ctx.goalProgress[].remaining_minutes`, and `context-builder.ts:418` computes it as `weekly_target_minutes − completed_this_week`. When planning **next** week, "completed this week" is irrelevant — but it is what gets subtracted, so a goal the user finished this week reports **zero remaining** and is skipped by `plan-week.ts:933`.

This is exactly why the Plan Week button works and `plan_next_week` does not: the button plans the *current* week, where progress-against-current-week is the correct subtraction.

**When the week being planned is not the current week, `remaining_minutes` must be the full weekly target.** Either build the context for the target week, or zero the progress before calling. Do not paper over it with the `replanFromDate` bound from Prompt 29 §1 — that fix stays for `replan_week`, where it belongs, but it is the wrong tool here.

## §4. A proposal must point at time the user actually missed

The screenshot shows **"1 goal goes up — Stocks 30m/day × 6 days → 35m/day × 6 days"** in a week whose own summary reports hours skipped. Offering to raise a target in a week the user fell short of is incoherent, and it is what "some random change" means.

Every proposal must carry evidence and be rejected without it.

Add to `ProposedChange`:

```ts
evidence: {
    missed_minutes: number;
    missed_dates: string[];      // the specific dates this goal lost time on
    completed_minutes: number;
    target_minutes: number;
};
```

Rules:

- **No proposal may be emitted for a goal with `missed_minutes === 0`** when the trigger was week-level missed time (Prompt 29 §3's >1h floor). The forced-proposal fallback must rank goals by *their own* missed minutes and skip any goal that missed nothing.
- **An `increase` may not fire in a week where total missed time exceeds 60 minutes.** Raising a target belongs in a week the user actually cleared. Gate rule 3 in `proposals.ts` on the week-level figure, not only the per-goal ratio.
- **A `redistribute` must name the days it is responding to** — the dates where that goal's blocks went unfinished.
- If, after these rules, there is genuinely nothing evidence-backed to propose, **show no proposals** and say the week was clean. That is a better outcome than inventing one. This narrows Prompt 29 §3: the >1h floor forces us to *look* for a proposal, never to *fabricate* one.

Surface the evidence in the confirm modal, under the change: *"You missed Stocks on Wed and Fri — 55 minutes short of your 3h target."* A user should be able to see why they are being asked to change something.

## §5. The two flows

**Automatic** — proposals shown on the card → user clicks Apply changes → confirm modal → goals updated → week planned. One uninterrupted action.

**Semi-Automated** — proposals shown → user is taken to the review-changes page → ticks the ones they want → Apply changes with the count → goals updated → week planned. Same planning path, only the selected subset applied.

Both must show a progress state while planning (Prompt 26 §5) and report the outcome concretely: the date window and the block count by type.

## §6. Confirm-modal copy is now wrong

The modal currently promises:

> Every goal you are **not** changing keeps exactly the same days and times.

That was carry-forward's guarantee and it will no longer hold. Replace it with what is actually true:

- Next week is planned fresh from your goals, with this change applied.
- Sleep, meals, morning routine and wind-down are rebuilt from your profile; commitments stay where they are.
- This week is not touched.

Worth knowing, and worth telling the user plainly: `generateWeekPlan` is deterministic, so changing one goal will not scatter the others at random — unchanged goals will mostly land where they landed before, moving only where the changed goal genuinely forces it. But it is not a guarantee of identical times, and the modal must not claim one.

---

## §7. Do not touch

- `generateWeekPlan` and the placement algorithm. This prompt is about calling it correctly, not changing it.
- The Plan Week button and `api/calendar/plan-week/route.ts`.
- `writeWeek`, beyond calling it.
- `replan_week` / `replan_day` and Prompt 31's fixes, including the `replanFromDate` bound.
- Prompt 27's capacity function and pause filtering.
- The coach.

---

## Verification (required)

1. `npm run build` passes.
2. **The change lands.** Accept "Stocks 30m/day → 35m/day". Every Stocks block next week is **35 minutes**, across 6 days. Post the actual blocks.
3. **No mangled durations.** Every goal block next week is a clean multiple of 5 minutes and matches its goal's `minutes_per_day`. No 38-minute blocks anywhere.
4. **Nothing is dropped.** Every active goal has blocks totalling its weekly target. Post the per-goal placement log — no goal reporting "already met".
5. **All block types present** — sleep, meals, morning routine, wind-down, anchors, goal blocks. Post the count by type and a screenshot of one full day.
6. **§3 is fixed.** Prove it: complete a goal fully in the current week, then run the review. That goal must still be planned in full next week.
7. **Evidence gating.** A goal that missed nothing produces no proposal. State the evidence attached to each proposal generated on real data.
8. **No increase in a bad week.** Construct a week with >1h missed; confirm no `increase` proposal appears.
9. **Empty is allowed.** Confirm that when nothing is evidence-backed, zero proposals show and the copy says the week was clean — no fabricated proposal.
10. **Both flows work end to end** — Automatic and Semi-Automated, the latter applying only ticked changes.
11. **Determinism check.** Run the planner twice with identical goals; confirm identical output. Then change one goal and report how many *other* blocks moved — this is the honest answer to "does changing one thing disturb the rest".
12. **Undo works** — goals revert and next week restores.
13. **carry-forward.ts is gone** from this path. State whether the file was deleted or still has other importers.

---

## Note for the human

You're right, and the 38-minute SiteSmith block is the proof. `carry-forward.ts:318` computes each block's new length as `(oldDuration / dayTotal) × newMinutes` — it treats the new daily target as a budget to divide proportionally across whatever blocks that day already had. That is a resizing operation, not a planning one, and it produces durations no scheduler would emit. Blocks disappeared for the same reason: a proportional share below the minimum gets dropped instead of placed. It also failed at its own job, since the Stocks blocks came out at 30 minutes after promising 35.

Carry-forward was my call in Prompt 30, made to stop the packer moving unrelated blocks. It traded one problem for a worse one. Your approach is better and simpler: let the planner that already works do the planning, and let the weekly review only decide what the goals should say.

The neat part is that the change needs no plumbing at all. The `update_goal` ops already run before the planner in the same patch, so by the time `buildCalendarContext` reads the goals, Stocks *is* 35m/day. The planner doesn't need to know a weekly review happened.

The one thing standing in the way is §3, and it is worth understanding because it has now bitten three times. `remaining_minutes` is computed as "weekly target minus what you completed **this** week". For the Plan Week button that is correct, because it plans the current week. For planning *next* week it is nonsense — and it silently reports zero remaining for every goal you completed, which is what produced the empty weeks earlier. Not passing `replanFromDate` avoids one half of that; the progress subtraction is the other half and still needs fixing.
