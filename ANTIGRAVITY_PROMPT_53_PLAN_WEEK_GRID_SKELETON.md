# PROMPT 53: Plan Week loads as a skeleton of the user's own calendar, not a spinner over a dead screen

Branch: `fix/apply-claude-changes`.

This **replaces Prompt 50 §5a and the loader half of §5c's presentation**. Prompt 50 §5b — adding an `isApplying` flag to `use-calendar` and awaiting `applyOption` before the modal closes — is still required, because it is the state this prompt renders from. Prompt 50 §5c's requirement that a failure leaves the modal open with a readable reason also still stands.

Today, pressing Generate replaces the calendar with a centred ring loader and rotating text, and applying an option shows nothing at all. Both should become **the real calendar grid, in place, with its blocks rendered as shimmering ghosts** — so the user watches their own week being rebuilt rather than watching the app disappear.

---

## §1. The principle

**The calendar never goes away during planning.** The header, the day columns, the hour ruler, the current-time line, the scroll position — all stay exactly where they are. What changes is that the goal blocks become ghosts and the week dims slightly.

That matters for a reason beyond looking nicer: a full-screen loader gives the user no idea *what is being changed*. A skeleton of their own week shows immediately that Tuesday's lecture is staying put, that lunch is still at 13:00, and that it is the goal blocks — and only the goal blocks — that are in flux.

---

## §2. What the skeleton is made of

Build it from what is genuinely known, in three tiers. **This is the part that makes it a skeleton of the user's schedule rather than a grid of grey rectangles.**

### Tier 1 — Fixed scaffolding: render for real, dimmed

Anchors, commitments, meals, sleep, wind-down, morning routine, and any block with `status === 'done'`. These **survive a replan** — `writeWeek`'s clear step spares them — so they are not unknown and must not be drawn as placeholders.

Render them with their real titles and times at roughly 40–50% opacity, no shimmer. They are the fixed points the new plan is being built around, and showing them solid is what makes the ghosting of everything else legible.

### Tier 2 — Goal blocks in flux: ghosts in their current positions

Every current `block_type === 'goal'` block that is about to be replaced. Render a rounded rectangle at the block's **existing** `top` / `height`, carrying its **pillar colour at low opacity**, with the `skeleton-shimmer` treatment over it. No title text — or at most a short shimmer bar where the title would be.

Keeping them at their current positions is deliberate: the week retains its familiar silhouette while the new plan is computed, so the change reads as a transformation of something rather than a load from nothing.

### Tier 3 — Empty target week: plausible ghosts

When the target week has no goal blocks yet (planning a fresh future week), Tier 2 has nothing to draw and an empty grid looks broken. Generate ghost rectangles inside the user's real waking bounds — between `wake` and `wind_down` from the profile — at the block count and rough sizes the mode implies, avoiding the Tier 1 scaffolding. Three to five per day is enough; they are an impression, not a prediction.

### Colours

Reuse `getBlockColors` (`week-grid.tsx:156-172`) and `PILLAR_COLORS` so a Gym ghost is still recognisably a body block. Muted, not greyed — a week of grey boxes loses exactly the information this change exists to add.

---

## §3. Geometry — reuse the grid's own maths, do not re-derive it

The ghosts must line up with the real blocks to the pixel, or the transition will jump when the plan lands.

- `CELL_HEIGHT = 120` (`week-grid.tsx:22`).
- `calculateLayout(dayBlocks, CELL_HEIGHT)` (`src/lib/calendar-layout.ts:18`) returns a `Map<string, LayoutBlock>` carrying `top`, `height`, `colIndex`, `totalCols`.
- The grid's vertical offset is `layout.top - (6 * CELL_HEIGHT)` (`week-grid.tsx:378`) — the grid starts at 06:00.

**Call the same `calculateLayout` with the same `CELL_HEIGHT` and apply the same offset.** Do not hardcode pixel values and do not write a second layout function. If the ghost layer and the real layer ever disagree about geometry, that is the bug this instruction exists to prevent.

Render the ghosts as an **overlay layer inside `WeekGrid`**, absolutely positioned in the same stacking context as `BlockCard`, with `pointer-events: none`. Do not unmount or replace the real grid — unmounting loses scroll position, and the scroll position is where the user is looking.

---

## §4. The two phases

### 4a. Generating

Driven by `isPlanning`.

The modal must stop being a wall. During the `generating` step:

- **Remove the full-screen backdrop blur** so the calendar is visible behind it.
- **Collapse the modal to a compact status strip** — a small pill or bar over the grid, not a centred card. Keep the existing rotating status text (`loadingTexts`, `plan-week-modal.tsx:41-56`); it is good copy and belongs in the pill.
- **Delete the ring-loader block** at `plan-week-modal.tsx:224-248`. Leave the `.ring-loader-1/2/3` CSS in `globals.css:1012-1020` unless nothing else uses it, in which case remove that too.
- The grid skeleton (§2) runs behind it.

The modal stays **mounted** throughout — when options arrive it expands back into the selection step. Do not close and reopen it.

### 4b. Applying — show the incoming plan, not a spinner

Driven by `isApplying` (Prompt 50 §5b).

This phase can do something better than a skeleton of the old week: **the chosen option already contains the new blocks.** `option.patch.ops` is a list of `create_event` ops whose payloads carry `date`, `start_time`, `end_time`, `title`, `block_type` and `pillar` (built at `api/calendar/plan-week/route.ts:100-112`, consumed at `use-calendar.ts:370-372`).

So on apply:

1. Clear the Tier 2 ghosts of the **old** goal blocks.
2. Render ghosts of the **new** blocks, at their real positions, from the option's own payloads — pillar-coloured, shimmering, with titles visible since they are known.
3. Keep Tier 1 scaffolding solid throughout.
4. When `loadData()` resolves, the ghosts are replaced by the real blocks in the same positions — so the transition is a settle, not a swap.

The user watches the new week arrive rather than watching nothing for four seconds. Take the modal down as this starts, since the grid is now the thing to look at.

### 4c. Failure

If either phase throws, the skeleton clears immediately and the modal expands back with the error (Prompt 50 §5c). A skeleton that keeps shimmering after a failed request is worse than no skeleton at all — put a hard ceiling on it (the existing `LoadingTimeout` component used by `CalendarSkeleton` is the precedent) so it can never shimmer forever.

---

## §5. Details that are easy to get wrong

- **Stagger by column.** Give each day column an incremental `animation-delay` (≈60ms per column) so the shimmer sweeps Monday → Sunday. Cheap, and it reads as progress rather than as a stuck screen.
- **`prefers-reduced-motion`.** There is currently **no** `prefers-reduced-motion` rule anywhere in `globals.css`. Add one: under it, ghosts render as a flat dimmed fill with no shimmer sweep, and the staggered delays are dropped. Apply it to `.skeleton-shimmer` generally, not only to this feature.
- **`aria-busy="true"`** on the grid container while either phase runs, plus a visually-hidden live region announcing "Generating your week" / "Applying your plan".
- **Day view.** `WeekGrid` also renders `viewMode === 'day'` (`:180`). The skeleton must work in both; it is the same layer over one column instead of seven.
- **The page-level `CalendarSkeleton` stays as it is** for the genuine cold start (`page.tsx:368`). This overlay is a different thing and does not replace it. Prompt 50 §5a's instruction to loosen the `blocks.length === 0` gate is **withdrawn** — with an in-place overlay, that gate is now correct as written.

---

## §6. Do not touch

- The planner. Nothing in `src/lib/calendar/` changes here.
- `BlockCard`'s real rendering, drag-and-drop, and the block inspector.
- The `selection` step of the Plan Week modal, and `handleApply`'s behaviour beyond the loading state.
- The weekly review flow, the coach.
- Prompts 51 and 52 — recovery-mode scheduling is unrelated to this.

---

## Verification (required)

1. `npm run build` passes.
2. **Screen recording of Generate → options → Apply → settled week.** This is a visual change; the recording is the verification.
3. **The calendar is visible and correctly positioned throughout.** Header, day columns, hour ruler and current-time line never disappear.
4. **Scroll position is preserved** across generate and apply. Scroll to 17:00, plan the week, confirm you are still at 17:00.
5. **Tier 1 blocks stay solid and correct.** Anchors, meals, sleep, wind-down and completed blocks keep their real times and titles, dimmed. Post a screenshot with an anchor day.
6. **Ghosts align to the pixel.** Capture a frame mid-apply and the frame after settling; block tops and heights must match. Name the shared `calculateLayout` call.
7. **Pillar colours are preserved** in the ghosts — a body ghost is not the same colour as a craft ghost.
8. **The apply phase shows the NEW blocks**, drawn from `option.patch.ops`, not the old ones. Confirm the ghost positions match the plan that lands.
9. **Empty future week falls back to Tier 3**, not an empty grid. Plan a week with no existing blocks and screenshot it.
10. **A failure clears the skeleton** and reopens the modal with the reason. Force a 500 and post it.
11. **The skeleton cannot shimmer indefinitely** — state the timeout and demonstrate it.
12. **`prefers-reduced-motion` renders a static dimmed state** with no sweep. Post both.
13. **Day view works**, same treatment over one column.
14. **The ring loader markup is gone** from `plan-week-modal.tsx`, and the modal no longer blurs out the calendar while generating.
15. **No layout shift** when the skeleton mounts or unmounts.

---

## Note for the human

This is the right instinct and it is worth saying why it is more than cosmetic. A centred spinner communicates one bit — *something is happening* — and then takes away the only thing that could communicate anything else. A skeleton of the actual week communicates several things at once and for free: that the calendar is still there, that the lecture on Tuesday and lunch at 13:00 are not being touched, that it is the goal blocks and only the goal blocks that are in flux, and roughly how full the resulting week is going to be. The user spends the wait reading their own schedule instead of reading an animation.

The part I would build first is §4b, because it is the biggest win for the least work. The chosen option already carries every new block's date, time, title and pillar — the payloads are right there in `option.patch.ops` and `applyOption` is already unpacking them. So the apply phase can show the **actual incoming schedule** settling into place, rather than a generic shimmer. That turns the longest and currently emptiest part of the interaction into the most informative one, and when `loadData()` resolves the ghosts are replaced by real blocks in the same positions, so it reads as a settle rather than a swap.

The one instruction I would not let slide is §3. There are two ways to draw a rectangle at 14:30 on Wednesday, and if the skeleton layer computes its own geometry it will drift from `BlockCard`'s the first time anyone touches `CELL_HEIGHT` or the 06:00 offset — and the symptom will be a subtle jump at the exact moment the plan lands, which is the worst possible place for one. Same `calculateLayout`, same constant, same offset.

Also worth noting since it came up while reading: there is no `prefers-reduced-motion` rule anywhere in `globals.css`. This app has a lot of motion in it, and a full-week shimmer sweep is a reasonable prompt to add the rule properly rather than only for this feature.
