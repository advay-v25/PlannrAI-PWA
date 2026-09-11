# PROMPT 16: Ship Weekly Review for real — completion tracking, accurate Productivity Profile, and the shareable Day Chain

Weekly Review is fully built but hidden behind a feature flag, saves nothing, and is fed by completion data that users are never asked to provide. This prompt turns it into a real, shipped feature and adds the Day Chain as its shareable artefact.

Work in this order. §1 and §2 are prerequisites — the Chain in §5 is meaningless without them.

---

## §0. Context you need before changing anything

**Block status is 100% user-entered.** There is no cron, no scheduled job, no end-of-day sweep anywhere in the repo. `schedule_blocks.status` is only ever written by `/api/calendar/block-status`, `/api/deviation`, `/api/habit-stacks`, and the coach via `PatchService`. Every one of those is a user tap. A block scheduled last March still reads `planned` today.

`/api/weekly-review/generate-report` papers over this at line ~84 by treating `planned`/`in_progress` as `missed` **at read time only** — it never writes back. That's fine for an AI summary and fatal for a streak, because it cannot distinguish "I didn't do it" from "I did it and forgot to tap."

**The canonical completed status is `'done'`, not `'completed'`.** See the Zod enum in `src/app/api/calendar/block-status/route.ts:14`. This one mistake is the cause of §3's bug.

---

## §1. End-of-day completion sweep

`src/components/reality-intake.tsx` already exists with exactly the right UI (`done / partial / missed / skipped`) and posts to the right endpoints. **Nothing renders it.** Wire it up rather than building something new.

### 1a. Surface unmarked blocks from the API

`/api/home/state` already fetches the day's blocks and computes the current time in the user's timezone. Add to its response — do **not** add a second query or a new route:

```ts
unmarked: {
  date: string,              // the day needing attention
  is_yesterday: boolean,
  blocks: Array<{ id, title, start_time, end_time, block_type, pillar }>
}
```

Populate it when either trigger fires:

- **Same day** — the user's local time is past the `end_time` of the last non-sleep block of today, and ≥1 of today's blocks is still `planned` or `in_progress`.
- **Previous day** — it is a new local day and ≥1 of *yesterday's* blocks is still `planned`/`in_progress`.

**Only ever look back one day.** Someone returning after a week away must not be handed 60 blocks to triage. Anything older than yesterday is left untouched and continues to be read as missed.

Return `unmarked: null` when neither trigger applies.

### 1b. Render the sweep

New client component `src/components/home/day-sweep.tsx`, mounted on `src/app/app/page.tsx`:

- Appears as a sheet/modal when `unmarked` is non-null, headed "How did today go?" or "Yesterday still needs marking".
- One row per block: title, time range, and four buttons — Done / Partial / Missed / Skipped.
- Each tap POSTs `/api/calendar/block-status` immediately and optimistically. Do not batch behind a submit button; a half-finished sweep must still persist what was answered.
- Dismissible. Re-appears next open while blocks remain unmarked. Never blocks the app.
- Tone follows `src/lib/celebration.ts` — this is data collection, not an interrogation. No "you failed to complete" copy.

### 1c. `skipped` is not `missed`

Add this distinction and honour it everywhere downstream: **`skipped` = a deliberate decision not to do it; `missed` = it didn't happen.** For every completion ratio in this prompt, `skipped` blocks are **excluded from the denominator entirely** — they neither help nor hurt.

If skipped counted as missed, users would learn never to press it, and you would lose the most useful signal in the whole system.

---

## §2. Fix and activate Weekly Review

### 2a. Turn it on — fully, everywhere, with no flag

Weekly Review ships as a **normal, permanently available feature**. It is not a preview, not "Soon", and not gated behind anything. It must behave **identically on `npm run dev` at localhost, on a Vercel preview deploy, and on production `main`** — with **no environment variable set**. `NEXT_PUBLIC_IS_PREVIEW_BUILD` must be irrelevant to it.

There are **five** separate locks. Remove all five:

1. `src/app/app/weekly-review/page.tsx:143` — delete the `if (!isPreviewEnabled())` early return and the `<ComingSoon>` render. Also delete the now-unused `isPreviewEnabled` and `ComingSoon` imports from this file. **Do not delete the `ComingSoon` component itself** — other pages may still use it.
2. `src/app/app/weekly-review/page.tsx` — the two `useEffect` hooks at ~lines 51 and 70 each begin with `if (!isPreviewEnabled()) return;`. Remove those guards too, or the page will mount and never fetch its report.
3. `src/middleware.ts:55` — remove **only** the `pathname.startsWith('/api/weekly-review')` clause from that condition. **Leave every other path in it untouched** (`/api/habit-stack`, `/api/goals/plan`, `/api/goals/strategy`, `/api/goals/generate-strategy`, `/api/goals/auto-schedule`) — those stay preview-gated.
4. `src/app/api/weekly-review/generate-report/route.ts:11` — delete `if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);` and its import.
5. `src/app/api/weekly-review/execute/route.ts:10` — delete the same guard and its import.

Then surface it properly in navigation:

- `src/app/app/layout.tsx:45` — change to `{ href: '/app/weekly-review', icon: Activity, label: 'Review' }`. Remove `badge: 'Soon'` and `disabled: true` entirely.
- `src/components/navigation/tab-bar.tsx:24` — remove `soon: true` from the weekly-review entry. The two `tab.soon` render branches (the pulsing orange dot at ~line 63 and the "Soon" pill at ~line 144) then have no truthy case for this tab; leave that rendering logic in place for future use.

**No Sunday gate.** The intended long-term cadence is once a week on Sundays, but that is explicitly **out of scope here** — the page must be openable on any day, any number of times. Do not add a date check, do not add a "come back Sunday" state, and do not consume `profile_preferences.weekly_review_enabled` to gate access. Leave that column alone; it is a notification preference, not an access control.

**Grep check before you finish:** searching the repo for `isPreviewEnabled` must return **zero** matches under `src/app/app/weekly-review/` and `src/app/api/weekly-review/`. If any remain, the feature is still gated.

### 2b. Delete the dead code

Seven of nine weekly-review routes have zero callers. Verified. Delete:

- `src/app/api/weekly-review/analyze/route.ts`
- `src/app/api/weekly-review/complete/route.ts`
- `src/app/api/weekly-review/context/route.ts`
- `src/app/api/weekly-review/generate/route.ts`
- `src/app/api/weekly-review/save/route.ts`
- `src/lib/ai/WeeklyReviewAI.ts` — also queries a `habit_logs` table that does not exist in any migration

**Keep** `generate-report` and `execute` (both live), `summary` (used by `src/hooks/use-coach-analytics.ts`), and `apply` — which §2c rewires.

### 2c. Persist the review

Right now **running a weekly review leaves no record whatsoever.** Nothing writes to `weekly_reviews` on the live path. Fix by having `execute` upsert on completion, reusing the logic already in `apply/route.ts`:

```
user_id, week_start, week_end,
planned_minutes, actual_minutes,
friction_patterns  → report.data.struggles
suggested_adjustment → report.data.summary
lever_action       → the proposed_goal_changes array
user_response      → 'accepted' (auto) | 'partial' (semi-auto) | 'ignored' (manual)
completed_at       → now()
```

The table already exists with `unique(user_id, week_start)` and RLS — upsert on that constraint. Manual mode must record `'ignored'` before routing to `/app/goals`, so declining is still a recorded decision.

Then delete `apply/route.ts` once its logic lives in `execute`.

### 2d. Three bugs in `execute/route.ts`

1. **`delete` hard-deletes a goal.** There's already a comment saying pausing would be safer. Change `change_type === 'delete'` to set `is_paused: true` and `status: 'archived'`. Automatic mode can currently destroy a goal the user never saw proposed — that is unacceptable.
2. **`replan_week` fires even when zero changes were applied.** Guard it: only replan when `changes.length > 0`.
3. **No rate limit.** Add `rateLimit: 'aiWeeklyReview'` to match `generate-report`.

---

## §3. Rebuild the Productivity Profile and move it into Weekly Review

### 3a. Move it

- Delete the `<ProductivityProfile />` mount at `src/app/app/settings/page.tsx:166` and its import at line 20.
- Move `src/app/app/settings/_components/productivity-profile.tsx` → `src/components/weekly-review/productivity-profile.tsx`.
- Render it on the Weekly Review report screen **above** the "Week in Review" summary card (`page.tsx` ~line 344). Users see their stats *before* choosing an action.
- Move `/api/settings/profile-analysis` → `/api/weekly-review/profile`.

### 3b. THE BUG — why every number reads 0%

`src/app/api/settings/profile-analysis/route.ts` filters on `b.status === 'completed'` in **four** places (lines ~23, ~41, ~84, ~107). `'completed'` is not a valid status. The enum is `planned | in_progress | done | missed | cancelled | partial`.

Result: `data_points` correctly reads 285 while every single percentage renders 0%. Replace with a shared helper:

```ts
const isComplete = (b) => b.status === 'done' || b.status === 'partial';
const counts     = (b) => b.status !== 'skipped' && b.status !== 'cancelled';
```

`partial` counts as complete. `skipped` and `cancelled` are excluded from the denominator (per §1c).

### 3c. Real 2-hour windows

Current code buckets by **single hour** and then displays `hour` → `hour+2` as if it were a window. That's why the screenshot shows an overlapping, nonsensical `09:00–11:00` peak and `10:00–12:00` low.

Replace with genuine rolling 2-hour windows:

- Build 24 hourly buckets of `{ total, complete }` from all blocks in range, assigning each block to the bucket of its `start_time` hour.
- Evaluate every **rolling 2-hour window** — `00:00–02:00`, `01:00–03:00`, … `22:00–24:00`.
- Require **≥4 blocks** in a window for it to be eligible; skip anything below that.
- **Peak window** = highest completion rate. **Low window** = lowest completion rate *among windows that actually had blocks scheduled*.
- Peak and low **must not overlap**. If the top-scoring low window overlaps the peak, take the next eligible one.
- If fewer than two eligible windows exist, return `null` for both and have the component show "Not enough data yet" rather than fabricating `09:00–11:00`.

### 3d. Archetype from the real peak

Derive from the peak window's **start hour**:

| Peak starts | Archetype |
|---|---|
| before 09:00 | **Early Riser** |
| 09:00–11:59 | **Morning Sprinter** |
| 12:00–15:59 | **Afternoon Builder** |
| 16:00–19:59 | **Evening Operator** |
| 20:00 or later | **Night Owl** |

No eligible peak window → **"Still Learning"** with copy explaining more data is needed. Never show a confident archetype built on nothing.

### 3e. All seven days, always

Current code does `.filter(d => d.total >= 2)`, sorts by rate, takes `slice(0, 3)` as `best_days` plus a separate `worst_day`. That's why the screenshot shows four arbitrary days (Mon, Tue, Wed, Sun).

Replace with a single `day_patterns` array of **exactly 7 entries, Monday → Sunday, in calendar order, never sorted or filtered**:

```ts
day_patterns: Array<{ day: string, rate: number | null, blocks: number }>
```

`rate` is `null` when that weekday has no eligible blocks — render as "—", not 0%. Drop `best_days` and `worst_day` entirely; update the component's `ProfileAnalysis` interface to match.

**`rate` here must use the identical formula as the Chain's daily completion ratio in §5.** They are the same number and must never disagree.

### 3f. Pillar performance

- Take the pillar from **`schedule_blocks.pillar`** first, falling back to the linked goal's `category` only when the block's own pillar is null. The current code reads only `goals.category`.
- **Remove the `general` bucket entirely.** Blocks with no resolvable pillar are excluded from this section, not lumped into a junk category.
- Report exactly the three real pillars — **Mind, Body, Craft** — every time, in that fixed order, with `null` for any pillar that had no blocks.
- Drop the `.slice(0, 6)`.

### 3g. Overall completion header

Add `overall_completion_rate` to the response: complete blocks ÷ eligible blocks across the whole range.

Render it as a header **directly above the Day Patterns section** — a single large percentage labelled e.g. `WEEK COMPLETION`. This is the headline number the whole panel builds toward.

### 3h. Data points

`data_points` must be the **real** count of eligible blocks analysed and must already be correct — keep it, and make sure the subtitle reads `AI-generated from N data points` using that live value. Never hardcode.

### 3i. Range

Change the window from **last 30 days** to **the reviewed week only** (`weekStart`/`weekEnd`, matching `generate-report`'s default of the *previous* Mon–Sun). This panel describes the week under review, not a rolling month. Accept optional `weekStart`/`weekEnd` query params, defaulting the same way `generate-report` does.

---

## §4. Chain state that survives across weeks

The Chain streak spans weeks, so it cannot live in `weekly_reviews`. New migration:

```sql
create table if not exists public.chain_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_complete_date date,
  updated_at timestamptz default now()
);
```

RLS on, owner-only select/insert/update, matching the policies on `weekly_reviews`.

**Recompute on read, don't trust a counter.** A helper `src/lib/chain/chain-service.ts` walks `schedule_blocks` backwards from a given date, finds the longest unbroken run of 100%-complete days, and upserts `chain_state`. Recomputation makes the streak self-healing when a user retroactively marks a block via §1's sweep — which they will, constantly.

**Definition of a complete day:** every eligible block on that date has status `done` or `partial`. A date with zero eligible blocks **breaks the chain** (you can't keep a streak on a day you never planned).

---

## §5. The Day Chain

New route `GET /api/weekly-review/chain?weekStart=&weekEnd=`, defaulting to the same week as `generate-report`.

### 5a. Response

```ts
{
  days: Array<{
    date: string,
    completion: number,        // 0..1, complete ÷ eligible
    total: number,
    complete: number
  }>,                          // exactly 7, Monday → Sunday
  streak: number,              // current, from chain_state
  longest: number,
  state: 'RUNNING' | 'ENDED',
  enters_left: boolean,        // the day before Monday was 100%
  exits_right: boolean,        // Sunday was 100% AND streak still live
  hours: { committed: number, invested: number, recovery: number }
}
```

**No AI call.** This must be pure arithmetic so the Chain renders instantly while the AI summary is still loading. It must never be blocked by the 40s NVIDIA timeout in `generate-report`.

### 5b. The three hour figures

- **Committed** — total hours of completed blocks whose `block_type` is `anchor`, `meal`, or `routine`. Obligations the user added, not chosen work.
- **Invested** — total hours of completed blocks belonging to the three pillars (`mind`/`body`/`craft`), i.e. AI-scheduled goal blocks.
- **Recovery** — waking hours (derived from `profiles.sleep_start`/`sleep_end`) minus committed minus invested. Free time.

These three are **descriptive only and must have zero effect on the chain**. The chain is driven solely by block completion.

### 5c. Rendering rules

One link per day, Monday → Sunday, horizontal. **Only 100% days join the chain** — they interlock with their neighbours at full size. Every partial day is a **detached, smaller link with clear air on both sides**, so it can never read as connected.

| Completion | Link |
|---|---|
| 100% | Full size, closed, interlocked |
| 90–99% | Detached, small, `--color-primary` @ **85%** opacity |
| 80–89% | Detached, small, @ **55%** |
| 70–79% | Detached, small, @ **30%** |
| Under 70% | Detached, small, neutral grey, no colour |

Every broken link is the **identical shape and size at every tier** — opacity is the only variable, so the fade reads purely as how close you came. Show the rounded percentage beneath any broken day.

Edge behaviour: if `enters_left`, the chain runs off the **left** edge of the canvas (it was already running before Monday). If `exits_right`, it runs off the **right** edge into next week.

Below the chain: current streak as a large number, `DAY CHAIN · RUNNING` (or `· ENDED`, in grey) beneath it, `LONGEST N DAYS` beneath that, then the three hour figures in a row.

### 5d. Where it goes

Render on the Weekly Review report screen, between the Productivity Profile (§3) and the "Week in Review" summary card. Add a **Share** action beside it.

Sharing is out of scope for this prompt — wire the button to `navigator.share()` with a placeholder for now. The server-rendered share image is a separate piece of work.

---

## §6. Do not touch

`src/lib/ai/**`, `src/lib/agents/**`, `src/lib/calendar/**`, `src/stores/**`, `public/sw.js`, `public/manifest.json`. No changes to auth, onboarding, or the coach.

Do not add push notifications, and do not add a Sunday gate.

Do not remove `isPreviewEnabled()` from anywhere outside `src/app/app/weekly-review/` and `src/app/api/weekly-review/`. The habit-stack and goals-planning features stay preview-gated exactly as they are.

Do not change `middleware.ts` beyond removing the single `/api/weekly-review` clause in §2a.

---

## Verification (required)

1. `npm run build` passes (`tsc --noEmit` runs first).
2. **Un-gating, proven three ways.** With **no `NEXT_PUBLIC_IS_PREVIEW_BUILD` set anywhere**:
   - `npm run dev` → `/app/weekly-review` loads the real report, not `<ComingSoon>`.
   - `npm run build && npm start` (a true production build) → same page, same behaviour, and `POST /api/weekly-review/generate-report` returns 200 rather than 403.
   - Reachable from **both** the sidebar and the mobile tab bar, with **no "Soon" badge and no pulsing dot**, and the sidebar entry is clickable rather than disabled.
   - Openable on a **non-Sunday** (i.e. today), repeatedly, with no date restriction.
   - `grep -r isPreviewEnabled src/app/app/weekly-review src/app/api/weekly-review` returns nothing.
3. **The 0% bug is dead.** Open the Productivity Profile with real data: `data_points` matches the number of blocks analysed, and peak window, low window, day patterns, pillar performance and overall completion all show non-zero, plausible values.
4. Peak and low windows are genuine, **non-overlapping** 2-hour ranges. Confirm by hand against the block data.
5. Day Patterns shows **all 7 days, Monday first, in calendar order**, with "—" for empty days.
6. Pillar Performance shows **Mind, Body, Craft only** — no `GENERAL` bucket anywhere.
7. Overall completion percentage renders directly above Day Patterns.
8. **Day-sweep:** with unmarked blocks on today after the last block's end time, opening `/app` shows the sweep. Mark one and reload — it's gone from the list and persisted in the DB. Repeat for the yesterday trigger. Confirm a user with blocks unmarked from 5 days ago is **not** prompted.
9. **Chain accuracy:** a day where every block is `done` produces a full interlocked link; 9/10 produces a detached 85% link; 7/10 a detached 30% link; 6/10 a grey link. A `skipped` block changes the denominator, not the numerator.
10. **Chain persistence:** complete a day, confirm `chain_state.current_streak` increments. Retroactively mark an older block via the sweep and confirm the streak **recomputes upward**.
11. Run a review through all three modes. Confirm a `weekly_reviews` row is written each time with the correct `user_response`, including `'ignored'` for manual.
12. Confirm a `delete` proposal **pauses and archives** the goal rather than deleting the row.
13. Report every file added, changed and deleted.

---

## Note for the human

Weekly Review comes fully off the feature flag in this prompt — it works on localhost and on production `main` with no env var, on any day. The Sunday cadence is deliberately deferred; when you do add it later, it belongs as a *prompt to visit* (a home-screen nudge on Sundays) rather than a lock that refuses entry the other six days. Locking the page would break the one thing that makes it testable.


The single highest-impact change here is §1, the completion sweep. Everything else in this prompt — the Profile percentages, the Chain, the AI summary quality, the coach's context — reads from `schedule_blocks.status`, and until now nothing has ever asked users to fill it in. The 0% Productivity Profile was two bugs stacked: a wrong status string, *and* no data behind it.

§3f will change what you see. The old `GENERAL` bucket existed because pillars were read from `goals.category` with a fallback, so every block without a linked goal landed there. Reading `schedule_blocks.pillar` first is more correct, and it may reveal that fewer blocks carry pillars than expected — worth checking the data once it renders.
