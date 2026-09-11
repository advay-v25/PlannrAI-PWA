# PROMPT 26: Automatic and Semi-Automated always generate next week's plan

Choosing Automatic or Semi-Automated must **always** regenerate the coming Monday–Sunday from scratch, with whatever goal changes the user accepted already applied. Right now it only happens when at least one goal changed, so a user who accepts the review and gets no goal edits — or ticks nothing in semi-auto — walks away with next week untouched.

The op that does this already exists and is correct. This is about when it fires, and about telling the truth when it doesn't.

---

## §1. Drop the gate

`src/app/api/weekly-review/execute/route.ts:114`:

```ts
if (goalOps.length > 0) {
    const patchResult = await PatchService.applyPatch(userId, {
        ops: [...goalOps, { op: 'plan_next_week', payload: {...} }],
        scope: 'week',
    }, supabase, 'coach');
```

Change the condition to the **mode**, not the op count:

```ts
const shouldPlanNextWeek = mode === 'auto' || mode === 'semi-auto';
```

- `auto` → always plans, with every proposal applied.
- `semi-auto` → always plans, with only the ticked proposals applied. **Including when the user ticked nothing** — they still chose to accept the review, and a fresh week built on their current goals is the right outcome.
- `manual` → **never** plans. Unchanged. Manual means "I'll handle it myself," and silently rewriting their week would be the opposite of that.

`goalOps` may now be empty. That's fine — verify a patch of `[plan_next_week]` alone still takes the traditional path in `applyPatch` (it does: `isBlockModsOnly` requires *every* op to be a block-mod op, and `plan_next_week` isn't one), still creates a snapshot because `scope: 'week'` is set, and still returns a usable undo token.

## §2. `replanned: true` is currently a lie

This is the more serious half.

`applyPatch` executes ops in a **loop with a per-op try/catch** (`patch-service.ts:750`). A failing op pushes to `errors` and the loop continues. Success is then decided by `changes === 0` — so if two `update_goal` ops succeed and `plan_next_week` throws, `changes` is 2, `success` is `true`, and the route reports:

```ts
replanned = patchResult.success;   // true — but nothing was planned
```

The user is told next week is ready when it isn't. Once §1 makes this the headline outcome of the whole flow, that failure has to be visible.

- Derive `replanned` from whether **`plan_next_week` itself** succeeded, not from the patch as a whole. `patchResult.errors` entries are prefixed with the op name (`` `${op.op}: ${e.message}` ``) — check for one starting `plan_next_week:`.
- Return the **reason** when it fails, so the UI can say something specific. Add `plan_error: string | null` to the response.
- Keep goal changes applied even when planning fails. They're already committed and reverting them would be worse — but the user must be told: *"Your goals were updated, but next week couldn't be generated."* with a way to retry just the planning.

**Do not wrap the whole thing in a rollback.** The mixed patch is deliberate: `undoPatch` already handles it correctly, restoring `schedule_blocks` from the snapshot *and* the goals from the inverse ops. One Undo covers both, and that property must survive this change.

## §3. Report what actually happened

`plan_next_week` logs its counts but returns nothing:

```
[PatchService] Deleting N of M blocks inside <mon>..<sun>
[PatchService] Inserting K blocks for <mon>..<sun>
```

Surface those. Have the op return `{ week_start, week_end, blocks_created, blocks_cleared }` and thread it up through `applyPatch` into the route response.

The UI then confirms concretely — *"Next week (1–7 Sep) has been rebuilt: 34 blocks."* — instead of a bare success toast. This is also how you'll verify the feature works at all without reading server logs.

**If `blocks_created` is 0, that is a failure, not a success.** A plan that inserts nothing means every goal is paused, or the generator returned only bio blocks. Treat it as `replanned: false` with an explanatory message.

## §4. The confirm dialog must say what's about to happen

The user is about to have next week deleted and regenerated. Nothing currently tells them that.

Update the confirm modal (`pendingApply`) for both modes to state it plainly — the week's dates, that existing plans for those days will be replaced, and that completed and locked blocks are preserved.

That last part is true and worth saying: the delete filter at `patch-service.ts:1712` already skips `is_locked`, `status === 'done'`, and the immutable types (`sleep`, `meal`, `wind_down`, `anchor`). Nothing the user has protected or already finished is at risk. Say so — it's the difference between the dialog reading as safe and reading as alarming.

## §5. Timeout

`maxDuration = 45` on the execute route was set when the route did goal writes and, sometimes, a plan. Now every accepted review runs a **full week AI generation** — `generateWeekPlan` — after the goal writes, in series.

- Raise `maxDuration` to **60**, and confirm that's within the limit for the current Vercel plan. If it isn't, say so rather than shipping a route that times out in production.
- The client currently shows a generic executing state. Make it say **"Planning next week…"** once the request passes a few seconds, so a 30-second wait doesn't read as a hang.
- Confirm the `aiWeeklyReview` rate limit is not so tight that a legitimate retry after a timeout is refused.

## §6. Guard the double-fire

`isExecuting` gates the buttons, but the `finally` at the end of the handler has a conditional reset:

```ts
if (mode !== 'semi-auto' || finalChanges) { setIsExecuting(false); }
```

Trace this and make sure there is no path where `isExecuting` resets while a request is still in flight. Two overlapping executions would generate next week twice and produce a duplicated schedule.

Belt and braces: make the route **idempotent for the same week**. If a `weekly_reviews` row for this `user_id` + `week_start` already has `lever_applied = true` and was written in the last 60 seconds, return the existing result instead of planning again.

---

## §7. Do not touch

- The internals of `plan_next_week` in `patch-service.ts` other than adding the return value in §3. The window arithmetic, the `nextMondayStr <= todayStr` guard, the delete filter and the insert filter are all correct — **do not adjust them**.
- `replan_week` — the coach depends on it and it stays as it is.
- `undoPatch` and the `REGEN_OPS` snapshot handling.
- Manual mode's behaviour.
- The proposals logic from Prompt 25 §3, and everything in Prompt 25 §1–2.

---

## Verification (required)

1. `npm run build` passes.
2. **Auto with proposals** — goals update *and* next week regenerates. Report the date window and block count from the response.
3. **Auto with zero proposals** — next week **still** regenerates. This is the main case that was broken.
4. **Semi-auto with nothing ticked** — next week still regenerates, no goal changed.
5. **Semi-auto with a subset ticked** — only the ticked goals change, and the new plan reflects **the new targets**. Verify directly: change a goal from 30→45 min/day, then confirm next week's blocks for that goal are 45 minutes. This is the whole point of the feature — sequential op execution is what makes it work, so confirm it empirically rather than assuming.
6. **Manual plans nothing.** Next week is untouched.
7. **The window is right** — blocks land on the coming Monday through Sunday, and **nothing dated today or earlier is modified**. Check the current week is byte-identical before and after.
8. **Preserved blocks survive** — put a locked block and a `done` block in next week, run auto, confirm both are still there.
9. **A planning failure reports honestly.** Force `plan_next_week` to throw. Confirm the response has `replanned: false` with a `plan_error`, the UI says goals were updated but planning failed, and the goal changes are still applied.
10. **Zero blocks created reports as a failure**, not a success.
11. **One Undo reverts both** — goals return to their old values *and* next week returns to its previous state.
12. **No double-fire.** Rapid-click the confirm button; exactly one plan generation runs.
13. **Timing.** Report the actual wall-clock duration of the full auto path against the 60s ceiling.

---

## Note for the human

The good news is the hard part was already built. `plan_next_week` clears and regenerates exactly next Monday–Sunday, refuses to run if its computed window isn't in the future, and preserves locked, done and bio blocks. The ops also execute sequentially, so goal updates are committed before the planner builds its context — which is precisely why the new plan will reflect the accepted changes. That ordering is load-bearing; §7 says don't touch it for that reason.

What's worth flagging is §2. Because `applyPatch` treats "at least one op succeeded" as success, the route can currently tell you next week is replanned when the planning op threw and only the goal writes landed. That's survivable while planning is a side effect. Once it's the headline outcome of clicking Automatic, it isn't — you'd get a confident success toast and an empty week.
