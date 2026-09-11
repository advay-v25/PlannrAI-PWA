# PROMPT 22: The day-sweep asks about goal blocks only

Narrow the end-of-day sweep to the same set the stats score. It currently asks the user to mark meals, anchors and morning routine — blocks that nothing counts and that the user should never have to tick.

This is the "one-line change" flagged as judgement call #1 in the Prompt 21 report. Take it.

---

## §1. The change

`src/app/api/home/state/route.ts`, lines ~232–234:

```ts
const NOT_SWEEPABLE_TYPES = new Set(['sleep', 'wind_down', 'buffer']);
const isSweepableType = (b: any) => !NOT_SWEEPABLE_TYPES.has(b.block_type || '');
```

Replace the exclusion list with the **same inclusion rule the stats use** — a block is sweepable only if it is AI-scheduled goal work:

```ts
// The sweep asks only about goal work. Sleep, meals, anchors, morning
// routine, wind-down and buffers are scaffolding the user did not choose,
// nothing scores them, and asking about them is pure friction.
const isSweepableType = (b: any) =>
    Boolean(b.goal_id) && PILLARS.includes((b.pillar || '').toLowerCase());
```

**Import `isScored` from `src/lib/chain/chain-service.ts` and use that directly rather than duplicating the predicate.** Prompt 21's whole point was one shared definition; a second local copy here would drift the same way Day Patterns and the Chain did. If `isScored` doesn't already handle a raw Supabase row shape, widen its `BlockLike` type rather than writing a parallel function.

Leave `UNMARKED_STATUSES` and the `sweepable` composition exactly as they are — only the type test changes.

## §2. Check the data reaches it

The sweep's block query must select **`goal_id`** and **`pillar`**, or every block fails the new test and the sweep silently never fires. Verify the `select` at ~line 82 includes both; add them if not.

This is the same failure mode as `recomputeChain()` in Prompt 21 — a predicate that reads fields the query didn't fetch fails silently and looks like "the feature just doesn't work".

## §3. Knock-on checks

- `toSweepShape` already returns `block_type` and `pillar` — leave it.
- The **`actionableToday`** filter at ~line 262 uses `isSweepableType` to decide the day's last end time. Think about whether the trigger should still be "after the last **goal** block ends" or "after the last block of any kind ends". **Use the last goal block** — that is when the user's actual work is done, and it makes the prompt appear earlier and more usefully. State which you chose.
- The **`missedBlocks` / `BEHIND_SCHEDULE`** logic at ~line 215 is separate and **must not change**. That banner is about the day going sideways in general, not about goal completion.
- `day-sweep.tsx` needs no change — it renders whatever it's given.

---

## §4. Do not touch

Anything outside `src/app/api/home/state/route.ts` and, if needed, the `BlockLike` type in `chain-service.ts`.

Do not change the stats, the chain, the calendar's rendering, `plan_next_week`, or the apply path.

---

## Verification (required)

1. `npm run build` passes.
2. **The sweep offers only goal blocks.** On a day with unmarked meals, an anchor, morning routine *and* one unmarked goal block, the sweep lists **exactly one** row — the goal block.
3. **A day whose only unmarked blocks are meals/anchors/routine does not trigger the sweep at all.** `unmarked` comes back `null`.
4. **The sweep still fires.** Confirm `goal_id` and `pillar` are in the query. If the sweep stops appearing entirely, §2 was missed.
5. Marking the offered block still persists via `/api/calendar/block-status`, and the block leaves the list on reload.
6. The yesterday trigger behaves the same way — goal blocks only, still capped at one day back.
7. `BEHIND_SCHEDULE` and the "N blocks missed today" banner are unchanged.
8. Confirm the sweep uses the **shared** `isScored` from `chain-service.ts`, not a local duplicate.

---

## Note for the human

Antigravity was right to preserve the old behaviour rather than silently narrow it — Prompt 21 said "scoring rules only" and the sweep isn't scoring. This is the follow-up that closes it.

Worth noticing what this does to the numbers: the sweep is the *only* thing that produces completion data, so pointing it at exactly the set the stats score means the two are now the same universe. Every block the user is asked about counts, and every block that counts is asked about. That's the property that was missing.
