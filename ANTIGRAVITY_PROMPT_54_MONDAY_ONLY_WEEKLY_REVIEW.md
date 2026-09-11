# PROMPT 54: The weekly review is a Monday ritual — open on Monday, closed every other day, past weeks read-only

Branch: `fix/apply-claude-changes`.

The weekly review currently runs on any day, for any week, and spends AI quota every time someone opens the page. It becomes a **Monday-only ritual**: prompted the moment the user opens the app on a Monday, closed the rest of the week, with past weeks browsable as a read-only dashboard that generates nothing.

---

## §1. One source of truth for "is the review open?", and it must use the user's timezone

Every gate below reads from one shared helper. Write it once, export it, and use it on both the client and the server:

```ts
// true only when today, in the user's own timezone, is a Monday
export function isReviewWindowOpen(nowUtc: Date, timezone: string): boolean

// the Monday of the week containing `now`, in the user's timezone
export function userThisMonday(nowUtc: Date, timezone: string): string   // YYYY-MM-DD
export function userLastMonday(nowUtc: Date, timezone: string): string
```

**The existing helpers are UTC-based and will get this wrong.** `page.tsx:165-172`:

```ts
const mondayOf = (iso: string) => { ... dt.getUTCDay() ... };
const thisMonday = () => mondayOf(new Date().toISOString().slice(0, 10));
```

For a user in `Asia/Kolkata` (the app's `DEFAULT_TIMEZONE`), Monday 04:00 local is Sunday 22:30 UTC — so the review would be **closed on Monday morning**, which is precisely when it must be open. For a user in `America/Los_Angeles`, Sunday 17:00 local is already Monday UTC and the review would open a day early.

Use `profiles.timezone` with `DEFAULT_TIMEZONE` as the fallback, via the existing `@/lib/timezone` helpers (`nowInTimezone`, `DEFAULT_TIMEZONE`) — the same ones `context-builder.ts:568` and `coach/context-builder.ts:143` already use. Do not introduce a fourth way of deciding what day it is.

**A day boundary bug here is invisible in testing and total in production**, because every gate in this prompt depends on it. Get it right first and log the resolved value (`timezone`, local date, weekday) once per page load.

---

## §2. Monday — the review is the first thing the user sees

On any `/app/*` route, when `isReviewWindowOpen()` is true, prompt the weekly review before anything else.

**Prompt it when all of these hold:**

- Today is Monday in the user's timezone.
- No `weekly_reviews` row exists for **last week** (`user_id`, `week_start = userLastMonday()`).
- The user has at least one prior week of data — a brand-new account whose first day is a Monday must not be prompted to review a week that never happened.
- Onboarding is complete.
- The prompt has not been dismissed already this Monday.

**Dismissal.** The prompt must be dismissible — a blocking modal the user cannot escape will be the single most hated thing in the app. Once dismissed, suppress it for the rest of that Monday (key the flag by `week_start`, not by date, so it cannot leak into the next week). Completing the review suppresses it permanently for that week via the `weekly_reviews` row.

Make it a prompt, not a redirect. The user may have opened the app to check something specific; a forced navigation is hostile. A prominent, unmissable card or sheet with "Start weekly review" and "Not now" is the right weight.

### 2a. Monday is also when the week gets planned

Planning the current week through the review already works (the `plan_current_week` path). Nothing there changes. The Monday prompt is simply the natural entry point: last week's stats, this week's plan, one sitting.

---

## §3. Every other day — the closed state

When `isReviewWindowOpen()` is false and the user navigates to `/app/weekly-review`, the page **still loads**. It does not redirect, and it does not show an error.

- The **week picker and the stats dashboard work normally** for past weeks (§4).
- **Where the AI summary and action cards would be**, show the closed-state message: that the weekly review opens on Monday, and when the next one is — *"Your next review opens Monday 14 September."* Give the exact date, not "come back Monday"; a user opening this on a Saturday wants to know it is two days away.
- **No AI summary is generated. No proposals are generated. No execution controls are shown.**

### 3a. The current, in-progress week

Selecting the current week (`weekStart === userThisMonday()`) shows the **same closed-state message**, on every day including Monday. The week is not over, its stats are incomplete, and its review is not due until next Monday.

`page.tsx:619` already disables the forward-nav button at `weekStart >= thisMonday()`. A disabled button explains nothing — if the current week is reachable by any route (deep link, stale state, URL parameter), it must render the message rather than a half-populated dashboard. Decide deliberately whether the current week is reachable at all, and say which you chose.

---

## §4. Past weeks — stats always, AI never, and a completion line

Any completed past week is viewable on any day. The deterministic dashboard — completion rates, planned vs actual, the day chain, the productivity profile — renders in full. **Only the AI narrative and the action controls are gated.**

Where the AI summary and actions would sit, render one of two states, decided by whether a `weekly_reviews` row exists for that `week_start`:

**a. The week was reviewed** — a row exists.

> **Weekly review completed** — *Reviewed Monday 8 September.*

Include what was actually decided, since the row already holds it: `user_response` (the execution mode chosen) and `lever_applied`. A user looking back at a week is usually asking "what did I decide to do about this?", and the row answers it.

**b. The week was never reviewed** — no row exists.

> **This week wasn't reviewed** — *the review window closed on Monday 8 September.*

Both states are terminal. Neither offers a button to generate a summary, and neither shows the action controls. Nothing about a past week is actionable.

*(You asked for "weekly review completed" on any past week whose stats have been opened. I have split it into these two states because claiming a week was reviewed when it never was is a small lie the user will eventually notice, and the honest version reads just as final. If you would rather both cases say "Weekly review completed", it is a one-line change — say so and I will fold it back.)*

---

## §5. No AI spend outside the window — enforce on the server, not just the UI

Hiding the card is not the same as not calling the endpoint. Today, `fetchAi` (`page.tsx:254`) fires on every week change regardless of anything.

**Client.** `fetchAi` is called only when: today is Monday **and** the selected week is last week **and** no `weekly_reviews` row exists for it. In every other case it is never called — not called-and-discarded, not called-and-cached. The existing in-flight guard, cooldown and `summaryCache` all stay as they are; this gate sits in front of them.

**Server.** `POST /api/weekly-review/generate-report` and `POST /api/weekly-review/execute` both **reject** a request outside the window with a clear, specific error — a stale tab, a background retry, or a direct call must not be able to spend quota or mutate goals on a Thursday. `execute` mutating goals off-window is the more serious of the two: it is the path that writes plans and changes targets.

Return a distinguishable code (e.g. `REVIEW_WINDOW_CLOSED`) with the next open date, so the client can render §3's message from the server's answer rather than from its own clock. Where the two disagree, **the server wins.**

Also gate on the week: `generate-report` and `execute` accept **only** `week_start === userLastMonday()`. A request for an older week is refused even on a Monday.

---

## §6. Do not touch

- **The calendar's Plan Week button stays available every day.** This is the escape hatch, and it matters: if planning only happened through the review and the review only opened on Monday, a user who missed Monday would have no plan for the entire week. The Monday lock is on the *review*, never on planning.
- Prompts 51–53 — recovery-mode scheduling and the Plan Week skeleton are unrelated.
- `computeWeekStats` and the stats route. Stats are deterministic, cheap and always allowed.
- The coach.
- The `weekly_reviews` schema, unless §4 genuinely needs a column that is not there. It already carries `week_start`, `user_response`, `lever_applied` and `completed_at`, which is everything §4 asks for — report it if you think otherwise rather than adding a migration by reflex.
- Nothing may auto-clear or auto-delete a week's plan. "That week has no plan" on a Monday is the normal state of a fresh week, not something to enforce.

---

## Verification (required)

1. `npm run build` passes.
2. **Timezone correctness.** With the system clock set to Monday 04:00 in `Asia/Kolkata` (Sunday 22:30 UTC), the review is **open**. With it set to Sunday 17:00 in `America/Los_Angeles` (Monday 00:00 UTC), it is **closed**. Post both, and post the resolved timezone/local-date/weekday log line.
3. **Monday prompt appears** on opening any `/app` route, when last week is unreviewed.
4. **The prompt is dismissible** and stays dismissed for the rest of that Monday, without leaking into the following week.
5. **No prompt for a brand-new account** with no prior week of data.
6. **No prompt once the review is completed** for that week.
7. **Tuesday–Sunday:** `/app/weekly-review` loads, past-week stats render in full, and the closed-state message shows **the exact next-Monday date**.
8. **The current week shows the closed-state message** on every day, Monday included. State whether it is reachable at all and why.
9. **A reviewed past week shows "Weekly review completed"** with the review date and the mode that was chosen.
10. **An unreviewed past week shows the "wasn't reviewed" state.**
11. **Zero AI calls off-window.** Open the review on a Wednesday, browse four past weeks, and post the network log — there must be no `generate-report` request at all.
12. **Server-side refusal.** `curl` `generate-report` and `execute` on a non-Monday; both return `REVIEW_WINDOW_CLOSED` with the next open date. Confirm `execute` wrote nothing.
13. **Week-scope refusal.** On a Monday, call `generate-report` for a week older than last week; it is refused.
14. **The client renders §3's message from the server's response**, and the server wins on disagreement. Demonstrate with a clock-skewed client.
15. **Plan Week in the calendar still works on a Wednesday.** This is the regression that would hurt most; prove it explicitly.
16. **Monday end-to-end:** prompt → last week's stats → AI summary → choose a mode → this week's plan is generated → the prompt no longer appears → `weekly_reviews` has the row.

---

## Note for the human

This is a good change and the reason is the one you gave implicitly: a review that is available every day is not a ritual, it is a page. Tying it to Monday gives it a shape — you look back once, you plan forward once, and for the rest of the week the thing is simply closed. It also happens to fix the quota problem, since the current page fires `generate-report` on every week change and a user clicking back through six weeks spends six summaries on weeks they cannot act on.

The part I would build first and test hardest is §1, because it is the one that fails silently. Every gate in this prompt asks "is it Monday?", and the existing helpers answer that in UTC — `dt.getUTCDay()` at `page.tsx:168`. For an `Asia/Kolkata` user, which is the app's own default timezone, Monday morning local is still Sunday in UTC, so the review would be closed during the exact hours it exists for. That would look like the feature simply not working, and it would be maddening to diagnose because it would work perfectly for whoever tested it in the afternoon.

Two design points worth being explicit about. The first is §6's escape hatch: if planning only happens through the review and the review only opens on Monday, then a user who misses Monday has no plan for seven days. The calendar's Plan Week button is what prevents that, so the Monday lock has to be on the review and nothing else. The second is that the prompt must be dismissible — a modal that cannot be escaped on a Monday morning, when the user opened the app to check one thing, will read as the app taking itself more seriously than the user does.

On §4, I split your "weekly review completed" into two states. A week that was genuinely reviewed can say so and can also say what was decided, which is the useful part — `weekly_reviews` already stores `user_response` and `lever_applied`, so that line costs nothing. A week that was never opened saying "completed" is a small lie, and the honest version reads just as terminal. Easy to collapse back into one message if you disagree.
