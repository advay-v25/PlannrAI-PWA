# PROMPT 21: Score only goal-linked blocks, and make Recovery mean genuinely empty time

Every percentage in Weekly Review is currently computed over the wrong set of blocks. Mind 100%, Body 80% and Craft 100% cannot coexist with day rates of 58/58/75/50 — the pillar figures and the day figures are counting different things.

---

## §0. The cause

`src/lib/chain/chain-service.ts` line ~28:

```ts
const NON_ACTIONABLE_TYPES = new Set(['sleep', 'wind_down', 'buffer']);
```

`isActionable()` excludes only those three. **`meal`, `anchor`, `routine` and every other non-goal block still land in the denominator** of `isEligible()`, which feeds `tally()`, `isCompleteDay()`, `dayCompletion()` and `recomputeChain()`.

Meanwhile Pillar Performance filters to blocks that carry a `pillar`, so it scores a genuinely goal-only set. The two never agree, and the day rates are diluted by meals and anchors the user cannot meaningfully "complete".

---

## §1. One definition: a scored block is a goal block

Replace the type-exclusion list with an inclusion rule. **A block is scored if and only if it is work the calendar AI scheduled against a goal.**

In `chain-service.ts`, replace `NON_ACTIONABLE_TYPES` / `isActionable()` with:

```ts
/**
 * Only AI-scheduled goal work is scored. Sleep, meals, anchors, morning
 * routine, wind-down and buffers are scaffolding the user did not choose and
 * cannot meaningfully "complete" — counting them made a 100% day impossible
 * and diluted every percentage on the page.
 */
export function isScored(b: BlockLike): boolean {
    if (!b.goal_id) return false;
    return PILLARS.includes((b.pillar || '').toLowerCase() as Pillar);
}
```

Rules:

- **Require `goal_id`.** That is what "tied to a goal" means, and it is the single unambiguous marker.
- **Also require a valid pillar** (`mind` / `body` / `craft`). A goal-linked block with a null or unrecognised pillar is excluded — the same set Pillar Performance already scores, so the two can finally agree.
- Keep `EXCLUDED_STATUSES` (`skipped`, `cancelled`) exactly as it is.
- `isEligible()` becomes `isScored(b) && !EXCLUDED_STATUSES.has(b.status || '')`.
- Keep the name `isActionable` exported as an alias if anything outside this file imports it, or update the call sites — **do not leave a stale export that still uses the old logic.**

**Critical:** `recomputeChain()` at line ~129 selects only `date, status, block_type`. It **must** now also select **`goal_id`** and **`pillar`**, or every block will fail `isScored()` and every streak will read zero. This is the easiest thing in this prompt to miss.

Audit every other query feeding these helpers and make sure `goal_id` and `pillar` are selected.

---

## §2. Everything downstream inherits it

Because Prompt 18 §3 routed Day Patterns and the Chain through `completion.ts`, both pick this up for free. Verify the rest:

- **Week completion** — goal blocks only.
- **Day Patterns** — same, and must now match the Chain exactly.
- **Peak / Low windows** — bucket only scored blocks. A 100% peak window built on meals is meaningless.
- **Data points** — the subtitle count must be the number of **scored** blocks, not all blocks. Expect it to drop sharply. That is correct.
- **`data_points` thresholds** — the "Still Learning" floor and the ≥4-blocks-per-window rule now sit over a much smaller set. Lower the window minimum to **≥3** so the profile does not permanently read "not enough data".
- **Pillar Performance** — should be unchanged, since it already scored this set. If it moves, the two were computing differently and you have found a second bug: report it.

---

## §3. Recovery means nothing is scheduled

Recovery currently subtracts committed and invested from waking hours, so it silently counts sleep-adjacent padding, meals, anchors and routine as "recovery". It is not — those are scheduled time.

**Recovery = waking minutes in which no block of any kind exists.**

- Take the waking window from `profiles.sleep_start` / `sleep_end`.
- Subtract **every** block that overlaps it, whatever its type — goal blocks, meals, anchors, morning routine, wind-down, buffers, commitments. All of it.
- What remains is Recovery: genuinely empty calendar.
- Merge overlapping blocks before subtracting, or double-booked time will be deducted twice and Recovery will come out too low.
- Recovery can be **0**. Do not floor it at some minimum, and never let it go negative — clamp at zero and log a warning if the arithmetic produces one, since that indicates overlapping blocks weren't merged.

Keep the other two figures as they are, but restate them against the new definition:

- **Committed** — completed `anchor`, `meal` and `routine` hours (obligations the user added).
- **Invested** — completed goal-block hours (the same set §1 now scores).

The three no longer sum to waking hours — wind-down, buffers and any missed blocks fall outside all three. **That is correct and intended.** Do not add a fourth bucket to force them to reconcile.

---

## §4. Do not touch

`src/lib/ai/unified-client.ts`, `src/lib/agents/**`, `src/lib/calendar/**`, `src/stores/**`, `src/middleware.ts`, `public/manifest.json`.

Do not change the chain's visual tiers, the `plan_next_week` op, or the apply path. This prompt is scoring rules only.

Do not change what the **calendar** displays — meals, anchors and sleep still appear on the user's schedule exactly as now. This changes only what is *counted*.

---

## Verification (required)

1. `npm run build` passes.
2. **The reported inconsistency is gone.** With Mind 100% / Body 80% / Craft 100%, the day rates and week completion must be arithmetically consistent with those three figures. Show the working: list the scored blocks per day with their status, and confirm the percentages follow.
3. **Day Patterns and the Chain are identical for every past day** — they already share `completion.ts`, so any divergence means something bypassed it.
4. **A day whose only blocks are meals, sleep and anchors reports `—`, not 0% and not 100%.** It has no scored blocks, so it has no verdict.
5. **Streaks still compute.** Confirm `recomputeChain()` selects `goal_id` and `pillar`, and that a known-complete day still produces a streak. If every streak reads 0, §1's query change was missed.
6. **Recovery.** Pick one real day, list every block on it, and show by hand that Recovery equals waking minutes minus the merged union of all blocks. Confirm a fully-booked day gives 0 and never a negative.
7. **Overlap safety.** Construct a day with two overlapping blocks and confirm the overlap is deducted once, not twice.
8. Confirm Pillar Performance is unchanged. If it moved, say by how much and explain why.
9. Report the before/after for: data points, week completion, all seven day rates, and the three hour figures — so the size of the correction is visible.

---

## Note for the human

The pillar figures were right all along; everything else was diluted. Day Patterns was scoring your meals, anchors and morning routine alongside your actual goal work, so a day where you did every goal block but hadn't ticked lunch came out at 58%.

The change worth being aware of: **your numbers will get better and your data-point count will get much smaller.** Both are correct. A 58% day that was really 100% goal completion has been misreporting you for as long as this has existed — and it was feeding the chain, so the streak has been wrong too.

`recomputeChain()`'s `select` is the one line that will silently break everything if it's missed: without `goal_id` in the query, every block fails the new test and every streak zeroes out.
