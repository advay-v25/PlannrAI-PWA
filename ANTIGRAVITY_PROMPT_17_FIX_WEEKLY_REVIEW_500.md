# PROMPT 17: Fix the Weekly Review 500 — never let the AI call blank the page

Weekly Review is now un-gated (Prompt 16 §2a is done) but the page renders nothing: `POST /api/weekly-review/generate-report` returns **500**, `apiClient` throws at `src/lib/api-client.ts:150`, `fetchReport` catches it at `weekly-review/page.tsx:72`, sets `report` to null, and toasts "Failed to generate weekly report". The user is left staring at an empty purple screen.

This prompt fixes the root cause **and** restructures the page so that this class of failure can never blank it again.

**Read Prompt 16 first.** This prompt supersedes Prompt 16's assumptions about render order and error handling, and depends on the stat definitions in Prompt 16 §3 (Productivity Profile) and §5 (Day Chain). Do not duplicate those specs — implement them as written there, arranged as described here.

---

## §0. Root cause

`src/app/api/weekly-review/generate-report/route.ts` has **no try/catch at all.** It contains exactly three unguarded throws:

| Line | Throw |
|---|---|
| 44 | `if (blocksRes.error) throw blocksRes.error;` |
| 45 | `if (goalsRes.error) throw goalsRes.error;` |
| 148 | `throw new Error(aiRes.error \|\| 'Failed to generate AI report');` |

Any one of them bubbles to `secureApiRoute`'s catch-all (`api-protection.ts:223`), which logs and returns a bare `apiError(safeMessage, 500)`. The client gets a 500 with no payload, so **every number on the page is lost because one AI provider call failed.**

Line 148 is the near-certain culprit. `callAI` is invoked with `useNvidia: true`, which builds a provider chain of Groq → OpenRouter → NVIDIA → NVIDIA-tertiary → Gemini and returns `{ success: false, error: 'All coach providers failed' }` if every one fails or the 40s budget runs out. It also fails when `requireJSON: true` and the model returns unparseable JSON.

**The exact provider failure is printed in the terminal running `npm run dev`, not in the browser.** Look for the `[AI ✨] Coach engine trying …` lines and the `API error details:` line that follows. Fix whatever that reveals (bad key, no network, JSON parse) — but fix the architecture below regardless, because the page must never again depend on that call succeeding.

---

## §1. Split the endpoint — deterministic data must never depend on the AI

The page currently makes **one** request that computes stats *and* calls an LLM, then throws away the stats if the LLM fails. Split it.

### 1a. `GET /api/weekly-review/stats` — new, no AI, cannot fail

One route returning everything deterministic, computed purely from Postgres:

```ts
{
  weekStart, weekEnd,
  metrics: { plannedMinutes, completedMinutes, skippedMinutes, goalStats },
  profile: { … },   // exactly the shape from Prompt 16 §3
  chain:   { … }    // exactly the shape from Prompt 16 §5a
}
```

Requirements:

- **No `callAI`. No AI import. Ever.** This route is arithmetic only.
- Wrap the whole handler in try/catch. On a Supabase error, log it and return **zeroed, well-formed data** with `data_points: 0` — never a 500. A missing column must degrade to an empty dashboard, not a dead page.
- Accept optional `weekStart`/`weekEnd`, defaulting to the previous Mon–Sun exactly as `generate-report` does today.
- Reuse the completion rules from Prompt 16: `done`/`partial` count as complete; `skipped`/`cancelled` are excluded from denominators; `planned`/`in_progress` on a **past** date count as missed.

### 1b. `POST /api/weekly-review/generate-report` — AI only, never throws

Strip the metric computation out (it now lives in `/stats`) and make it return the AI narrative only:

```ts
{ summary: string, achievements: string[], struggles: string[], proposed_goal_changes: [...] }
```

Then:

- Wrap the entire handler in try/catch.
- **Replace the line-148 throw.** On `!aiRes.success`, return `apiSuccess({ available: false, reason: aiRes.error })` with **HTTP 200**. An unavailable AI summary is a normal outcome, not a server error.
- Same for any thrown exception: catch, log, return `{ available: false }` at 200.
- Keep `maxDuration = 60` and `timeout: 40000`.
- Add `available: true` to the success shape so the client can branch on one field.

**This route must be incapable of returning a non-2xx** except for genuine auth/rate-limit rejections.

---

## §2. Page render order and failure isolation

Rewrite the data flow in `src/app/app/weekly-review/page.tsx`:

### 2a. Two independent fetches

```
on mount:
  fetch /api/weekly-review/stats            → drives the whole page
  fetch /api/weekly-review/generate-report  → drives ONE optional card
```

Fire both in parallel. **They must not be chained, and neither may be awaited before the other renders.** The page's loading state is tied to `/stats` only. The AI card carries its own independent loading state.

### 2b. Render order, top to bottom

1. **Productivity Profile** — the dashboard from Prompt 16 §3: archetype, real 2-hour peak/low windows, `WEEK COMPLETION` header, all 7 day patterns, Mind/Body/Craft pillar performance, live `data_points`.
2. **Day Chain** — the visual from Prompt 16 §5, rendered from `chain` in the same payload: one link per day, only 100% days interlocked, partial days detached with tiered opacity, streak + longest + the three hour figures.
3. **AI summary card** — "Week in Review" with the summary text, Wins and Struggles.
4. **The three action buttons** — Automatic / Semi-Automated / Manual.

The user sees their real numbers and their chain **immediately**, while the AI is still thinking.

### 2c. The AI card's three states

- **loading** — a skeleton in place of the card. The rest of the page is fully interactive.
- **available** — summary, Wins, Struggles as today.
- **unavailable** (`available: false`, or the fetch failed) — an inline card reading *"Couldn't generate this week's summary"* with a **Retry** button. Quiet and neutral, matching `src/lib/celebration.ts` tone. **No red error styling, no error toast.**

Delete the `toast.error('Failed to generate weekly report')` call. A missing AI paragraph is not worth a toast when the whole dashboard rendered fine.

### 2d. Actions must not depend on the AI

Today, **Semi-Automated is disabled when `proposed_goal_changes.length === 0`**, and Automatic passes `report?.data?.proposed_goal_changes || []`. With no AI report, `report` is null and the buttons are meaningless.

- **Automatic** and **Semi-Automated** are disabled only while the AI card is loading or unavailable — with a tooltip explaining they need the summary. They act on goal changes, which only the AI produces.
- **Manual** must stay **enabled at all times.** It only routes to `/app/goals` and has no AI dependency.
- Per Prompt 16 §2c, all three still persist a `weekly_reviews` row. When the AI is unavailable, Manual writes `user_response: 'ignored'` with a null `lever_action`.

---

## §3. Empty-week state

The report defaults to the **previous** Mon–Sun. On a fresh local database that week is very likely empty, which is a large part of why this looks so broken.

When `/stats` returns `data_points === 0`:

- Do **not** render the Profile, the Chain, or the action buttons.
- Render a single centred empty state: *"No data for the week of {weekStart}"*, a line explaining the review covers last week, and a **"View this week instead"** button that refetches with the current Mon–Sun.
- Do not fire the `generate-report` request at all — there is nothing to summarise, and it will just fail.

Also add a discreet **week switcher** (‹ prev / next ›) in the page header that refetches both endpoints for the chosen week. Without it there is no way to look at a week that actually has data, which makes the whole feature untestable.

---

## §4. Diagnostics

While fixing, make the next failure diagnosable rather than a mystery 500:

- In `generate-report`'s catch, `console.error('[WeeklyReview] AI failed:', { provider: aiRes?.provider, model: aiRes?.model, error: aiRes?.error })`.
- In `/stats`'s catch, log the Supabase error `code`, `message` and `details`.
- Include `reason` in the `{ available: false }` payload and surface it in the Retry card **only in development** (`process.env.NODE_ENV !== 'production'`). Never leak provider errors to production users.

---

## §5. Do not touch

`src/lib/ai/unified-client.ts` — do not change the provider chain, the fallback order, or any key handling. If the terminal shows a provider misconfiguration, report it in your summary; do not "fix" it by editing the client.

Also unchanged: `src/lib/agents/**`, `src/lib/calendar/**`, `src/stores/**`, `src/middleware.ts`, `public/sw.js`, `public/manifest.json`.

Do not re-add any `isPreviewEnabled()` guard to weekly review.

---

## Verification (required)

1. `npm run build` passes.
2. **The killer test — simulate total AI failure.** Temporarily force `callAI` to return `{ success: false }` in `generate-report` (or unset the AI env vars) and load the page. **The Productivity Profile, the Day Chain, and the Manual button must all render normally**, with only the summary card showing the quiet Retry state. No 500, no red toast, no blank screen. Undo the stub afterwards.
3. `GET /api/weekly-review/stats` returns 200 with well-formed data for a user with **no blocks at all** — zeros, not a 500.
4. `POST /api/weekly-review/generate-report` returns **200 in every case**, with `available: false` when the AI fails. Confirm with the network tab.
5. On a week with real data: the Profile shows non-zero percentages (per Prompt 16 §3b — remember `'done'`, not `'completed'`), and the Chain's links match the underlying day completion — a 100% day interlocks, a 9/10 day is detached at 85% opacity.
6. The Chain and the Profile's Day Patterns report **identical** completion percentages for the same day. If they disagree, one of them is using the wrong formula.
7. The empty-week state appears for a user with no blocks last week, and "View this week instead" successfully loads the current week.
8. The week switcher moves both the Profile and the Chain together.
9. Report the **actual provider error** from the dev terminal in your summary, so the underlying AI issue can be fixed separately.

---

## Note for the human

All three of your screenshots are the same bug — every call stack terminates at `weekly-review/page.tsx:72:29`, which is `fetchReport`. There is only one failure here, not a separate localhost issue.

The underlying design fault is that one route computed the numbers *and* called an LLM, with no try/catch, so a provider timeout destroyed a page full of perfectly good Postgres data. After this change the dashboard and chain come from a route that cannot fail, and the AI paragraph is just a card that might say "couldn't generate."

I could not determine which provider actually failed — the browser only ever sees the sanitised 500. The real error is in your `npm run dev` terminal, on the `[AI ✨] Coach engine trying …` lines and the `API error details:` line right after. Worth a look even after this fix lands, because a summary that never generates is still a broken feature — just no longer a fatal one.
