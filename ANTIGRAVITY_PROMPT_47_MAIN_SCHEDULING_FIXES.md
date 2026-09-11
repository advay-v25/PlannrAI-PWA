# PROMPT 47: Meal placement, full-length blocks, coach reschedule options, and completion marks on replan

**These are bugs on `main`, not regressions from the weekly-review branch.** Four independent fixes.

---

## §1. Meals drift far from their intended time when anchors collide

Observed: Breakfast at **13:40** on Monday and Wednesday, Lunch at **19:00** Tuesday and **18:45** Wednesday. The anchors that day are `Business Stats 11:45–13:25`, `Supply Chain Management 13:25–15:15`, `Financial Management 08:00–09:40`, `Co-op Prep 15:25–17:05`.

The cause is `resolveBioBlockOverlap` (`plan-week.ts:419`):

```ts
const tryForward = (): number | null => {
    let s = tmplStart;
    while (guard++ <= merged.length + 1) {
        if (s + duration > maxBound) return null;
        const z = firstOverlap(s);
        if (!z) return s;
        s = z.end;              // jump past this zone and try again
    }
};
```

Three faults:

1. **It walks arbitrarily far.** Each collision jumps to the end of the blocking zone and retries, with no limit on drift from the intended time. Breakfast starting at 08:00 can end up at 13:40.
2. **It takes the first success, not the best.** The direction order is chosen by the *shape* of the overlap (`isTrailingEdge ? [tryBackward, tryForward] : ...`), then whichever attempt returns first wins. It never compares the two candidates.
3. **No buffer, no usability check.** It snaps flush to `z.end`, so a meal can start the instant an anchor ends, and it never verifies the resulting gap is genuinely usable.

### The rule

**A meal is placed in the usable slot nearest to the user's configured meal time.**

Rewrite the resolver to:

1. Compute **both** candidates — nearest usable slot before the conflicting zone(s), and nearest usable slot after.
2. A slot is **usable** only if it is at least the meal's duration **and** leaves the user's configured buffer (`default_buffer_duration`) clear on both sides against every neighbouring block or anchor.
3. **Pick whichever candidate's start is closer to the configured meal time.** Distance decides, not direction, not overlap shape.
4. Treat consecutive anchors separated by less than `duration + 2 × buffer` as a **single merged zone** — the gap between them is not a real option. In the user's example, anchors at 12:30–13:15 and 13:30–14:15 leave 15 minutes, which is not a lunch slot; lunch goes *before* 12:30 with its buffer.
5. Enforce a **maximum drift**. If neither candidate is within a reasonable distance of the configured time, place at the closest usable slot anyway but **log it** — a meal three hours from its intended time should be recorded, not silent.
6. If genuinely nothing is usable, return `null` as today (skip that meal for that day) and log why. Never place a meal at a random time.

This must hold for every meal, every day, every user — it is not specific to the example.

## §2. Blocks must be full length; splitting is a last resort

Observed at **60% load with hours free**: `Gym (Shortened) 22:30–23:15`, `PlannrAI (Part) 09:30–10:30` + `10:45–11:15`, `Studying (Part)` fragments across several days.

**The rule, stated plainly: a goal's block on a given day is exactly its `minutes_per_day`, as one continuous block.**

- Gym at 120 min × 3 days → three 120-minute blocks. Not 45, not two 60s.
- Reading at 60 min × 7 days → seven 60-minute blocks.
- **Splitting or shortening is permitted only when the day mathematically cannot hold the full block** after all fixed blocks, anchors and buffers.
- If **any** contiguous gap in the week can hold the full block, it goes there. A block is never shortened while ≥30 minutes of usable contiguous free time exists somewhere that could take it.

Implementation requirements:

- **Compute real free time first.** Before placing anything, build a per-day map of genuine contiguous gaps after sleep, meals, routine, wind-down, anchors and buffers. Place against that map. Report it in the placement log.
- **Order by constraint tightness.** Body goals (contiguous, one per day, meal separation) have the fewest viable windows and must choose before flexible craft/mind goals. A craft block that can sit anywhere must not take the one window a body block needs.
- **Relocate before shortening.** When a block does not fit where it was tried: another window that day → another day → move a *flexible* block out of the way → and only then shorten.
- **Log every shortening with the free time that existed at that moment.** An unnecessary trim must be auditable.
- **Merge adjacent same-goal blocks** on the same day into one, and drop `(Part)` from any block that is not genuinely a part.

## §3. Coach reschedule options

From the screenshot, at 01:20 Wednesday, rescheduling a 30-minute Studying block:

- Option 1 — *"Move to 11:45 today"* — **collides with an anchor** (`Business Stats` / `Decision Making`, 11:45–13:25).
- Option 2 — *"Move to Wednesday 02/09 at 07:45"* — labelled as a future day but **it is today**, and it sits immediately after the morning routine while hours of free time exist later.
- Option 3 — correct. Replaces a lower-priority block in the same pillar. **Leave it alone.**

### 3a. Today is today

`response-generator.ts:901` already branches on `sameDay = targetDate === coachCtx.current.date`, so the labelling logic exists — but Option 2 rendered a date for a day that is today. **The prime suspect is a date/day-of-week mismatch at 01:20:** `coachCtx.current.date` and `coachCtx.current.day_of_week` are likely derived differently (one UTC, one local), so just after midnight they disagree.

Log both values on every reschedule and confirm they agree. Then:

- Any option on the current date says **"today"**, never a weekday name plus date.
- The full date appears only in the **Review & Execute** confirmation.

### 3b. Option 1 — same day, largest free slot, exact duration

- Must be on **the same date as the missed block**.
- Must be the **largest available contiguous free slot** on that day, not the first found.
- Must be **exactly the block's original duration**.
- Must not overlap **any** anchor, meal, existing block or buffer. The current suggestion overlapping an anchor means the anchor is not in the occupancy set — `findAvailableSlots` (`:176`) takes a `blocks` array; verify anchors and commitments are actually in it.
- Only slots **after the current time** on the current day.

### 3c. Option 2 — a different, later day, largest free slot

- Must be on a **different date, later in the week than the missed block's day**, weekends included.
- Must be the **largest contiguous free slot** on that day.
- Same duration and same collision rules as 3b.
- It must never resolve to the same day as Option 1.

### 3d. Option 3 — unchanged

Lowest-priority block in the same pillar. Working correctly; do not modify. Verify it still works after 3a–3c.

Confirm all three options **apply correctly** when executed, not just that they display correctly.

## §4. Completion marks when a plan is regenerated

When a plan is generated on day *D* of a week:

- **Days before D:** blocks that already existed and carried a `done` / `incomplete` mark **keep that mark**. Blocks newly created for those days carry **no mark**.
- **Day D itself and all days after:** **no marks at all**, regardless of any previous state.

Implementation notes:

- Match "already existed" by a stable identity — same `goal_id`, same date, and overlapping time — not by row id, since a regeneration creates new rows.
- The write path already preserves `status === 'done'` blocks by not deleting them; confirm that interacts correctly with this rule rather than duplicating them.
- Applies to Plan Week, plan-day, and any replan path.
- Report which paths you changed.

---

## §5. Do not touch

- Option 3's logic.
- Anchors and commitments — they are fixed points and nothing here may move them.
- The weekly-review branch work; this is `main`.

---

## Verification (required)

1. `npm run build` passes.
2. **Meals sit near their configured times.** Re-run the week in the screenshot: breakfast is not at 13:40, lunch is not at 19:00. Post every meal time for all 7 days against the configured times.
3. **Meals respect the buffer** on both sides and never sit in a sub-duration gap between two anchors.
4. **Excessive drift is logged** when it happens.
5. **Blocks are full length.** Gym at 120×3 produces three 120-minute blocks. Post per-goal target vs placed.
6. **No `(Shortened)` or `(Part)` while free time exists.** Post the per-day free-time map beside the placement log.
7. **Adjacent same-goal blocks are merged.**
8. **Body goals get their windows** ahead of flexible craft blocks.
9. **Coach: no option overlaps an anchor.** Confirm anchors are in the occupancy set.
10. **Coach: today is labelled "today"** in all options; log `current.date` and `current.day_of_week` and confirm they agree just after midnight.
11. **Coach: Option 1 is the largest same-day slot; Option 2 is the largest slot on a different, later day.** Post all three options for the screenshot's scenario.
12. **All three options execute correctly.**
13. **Completion marks:** generate a plan mid-week with marks on earlier days. Confirm earlier-day existing blocks keep marks, new earlier-day blocks have none, and everything from the generation day onward is unmarked. Post the before/after.

---

## Note for the human

The meal bug is the clearest of the four. `resolveBioBlockOverlap` handles a collision by jumping to the end of the blocking zone and trying again, repeatedly, with no limit on how far it drifts and no comparison between going earlier and going later — it takes whichever direction it happened to try first. So an 08:00 breakfast that collides with a morning anchor keeps hopping forward past each subsequent zone until it lands at 13:40. Your rule is exactly the right one: compute both candidates, require the buffer on each side, and pick whichever is closer to the time the user actually asked for.

The point about consecutive anchors is the part that would have been easy to miss, and it is worth calling out: the gap *between* two anchors is usually not a real option, because a 15-minute window between meetings is not somewhere anyone eats lunch. Merging anchors that sit closer together than `duration + 2 × buffer` into a single zone handles that cleanly.

On §3, the likeliest cause of "Wednesday" appearing for a day that is today is that `current.date` and `current.day_of_week` are computed from different clocks, so at 01:20 they disagree by a day. The code already branches correctly on `sameDay`; it is being handed inconsistent inputs. Worth logging both before changing any logic.

And Option 1 overlapping an anchor suggests anchors simply are not in the array passed to `findAvailableSlots`. That would explain both the collision and why it thinks 11:45 is free — it is free, in a world where the anchor does not exist.
