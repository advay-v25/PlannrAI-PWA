# PROMPT 18: Weekly Review polish — decouple goal changes from the AI, fix the scroll background, the archetype icon, and the future-day bug

Weekly Review now works: real percentages, a real chain, graceful AI degradation. Four things to fix, in priority order.

---

## §1. THE BIG ONE — goal changes must not depend on the AI

Right now Automatic and Semi-Automated are dead whenever the AI summary fails, because `proposed_goal_changes` comes back inside the LLM response. **That dependency is unnecessary.** Deciding that a goal targeted 5h and got 1h, so it should drop to 20 min/day, is arithmetic — the LLM is only writing prose around it.

### 1a. Compute the proposals deterministically

Add `proposed_goal_changes` to the **`/api/weekly-review/stats`** response (the route that cannot fail). For each active, non-paused goal, using the `goalStats` already computed there:

```
weeklyTargetMins = minutes_per_day × days_per_week
actualMins       = completed minutes for that goal this week
ratio            = actualMins / weeklyTargetMins
```

Rules, evaluated in order — first match wins, one proposal per goal maximum:

| Condition | change_type | new value |
|---|---|---|
| `actualMins === 0` and the goal has existed ≥ 2 full weeks | `pause` | — |
| `ratio < 0.5` | `update_time` | `minutes_per_day` → `round(actual per active day)`, floored at 10 min |
| `ratio < 0.8` | `update_days` | `days_per_week` → number of days the goal was actually completed on, floored at 1 |
| `ratio > 1.2` and every scheduled block was completed | `update_time` | `minutes_per_day` → `+15%`, rounded to the nearest 5 |
| otherwise | **no proposal** | — |

Never propose `delete`. Per Prompt 16 §2d, `delete` is being removed as an option entirely.

Each proposal carries `goal_id`, `title`, `change_type`, `old_value` and `new_value` as display strings (e.g. `"60m/day × 5 days"`), `new_minutes_per_day` / `new_days_per_week`, and a plain-English `rationale` built from a template — **no LLM**:

> `"Targeted 5h, completed 1h. Dropping to 20 min/day to make it achievable."`

### 1b. The AI's role shrinks

`generate-report` keeps producing `summary`, `achievements` and `struggles` only. **Remove `proposed_goal_changes` from its schema and prompt entirely** — if the AI still returns it, ignore it. Two sources of truth for the same decision is worse than none.

Optionally pass the deterministic proposals *into* the AI prompt as context so the prose can reference them, but the proposals themselves never come back from the model.

### 1c. Re-enable the buttons

In `page.tsx`, all three actions now read `proposed_goal_changes` from the `/stats` payload:

- **Automatic** — enabled whenever `/stats` loaded and there is ≥1 proposal. **Never disabled because the AI failed.**
- **Semi-Automated** — same condition; the review screen lists the deterministic proposals with their rationales.
- **Manual** — always enabled.
- When there are genuinely zero proposals, disable Automatic and Semi-Auto with the tooltip *"No changes suggested — your goals matched your week."* That is a real state and should read as success, not as an error.

Remove every `report?.data?.proposed_goal_changes` reference. The AI card no longer feeds the action buttons at all.

---

## §2. Diagnose the AI failure

`All coach providers failed` comes from `unified-client.ts:470` — the loop tried every provider in the chain and none returned success. Two mechanisms make this far more likely than it looks, and both need addressing:

### 2a. The time budget cuts the chain short

`MAX_TOTAL_TIME = options.timeout ?? 55000`, and `generate-report` passes **`timeout: 40000`**. With `MAX_PROVIDER_TIME = 15000` and the loop breaking when `remaining < 3000`, the chain gets roughly: Groq 15s → OpenRouter 15s → NVIDIA ~10s → **break**. Gemini and NVIDIA-tertiary are never reached.

If Groq and OpenRouter are merely *slow* rather than broken, the whole budget is consumed by two timeouts and the healthy providers never get a turn.

**Fix:** raise `generate-report`'s `timeout` to `50000` (still inside `maxDuration = 60`) and lower `MAX_PROVIDER_TIME`'s effective slice **for this call only** by passing a per-call cap so more providers are attempted. Do **not** edit the constants in `unified-client.ts` — thread the value through from the caller.

### 2b. The circuit breaker is sticky

`circuitBreakers` is a **module-level `Map`** with `FAILURE_THRESHOLD = 3` and `COOLDOWN_MS = 60000`. Once a provider records 3 failures it goes `OPEN` and every subsequent call is skipped instantly for a minute. During all the earlier 500s and retries, several providers may have tripped — after which "all providers failed" returns in milliseconds without a single network request being made.

**Fix:** log the circuit state. In the `generate-report` catch, log each provider's breaker state so it's obvious when a failure is a real API error versus a skipped-because-OPEN. Add a dev-only `?resetCircuits=1` query param on Retry that clears the map before retrying.

### 2c. Report the real error

**You must run the dev server, open Weekly Review, and paste the actual `[AI ✨] Coach engine trying …` lines and any `API error details:` output into your summary.** Everything above is mechanism, not diagnosis. Do not guess — the terminal has the answer. Likely candidates in order: an expired or unauthorised key (401/403), rate limiting (429), the model name no longer being served, or `requireJSON` failing to parse the response.

Do not "fix" this by editing the provider chain or key handling in `unified-client.ts`. Report what you find.

---

## §3. Fix the future-day bug — Day Patterns and the Chain disagree

Today is mid-week, the review is showing **Aug 24–30**, and Friday/Saturday/Sunday have **not happened yet.** Day Patterns reports all three at **100%**, while the Chain renders them as small grey broken links. Both cannot be right, and in fact both are wrong.

**Root cause:** those days have zero *eligible* blocks (future blocks are still `planned` and are correctly excluded from the past-date-means-missed rule). Day Patterns is dividing 0 by 0 and rendering 100%; the Chain is treating "no eligible blocks" as a broken day.

**Fix:**

- Add `is_future: boolean` to each entry in both `day_patterns` and `chain.days`, true when the date is after today in the user's timezone.
- **Day Patterns** — a future day renders `—` in muted text with an empty track. Never 100%, never 0%.
- **The Chain** — a future day renders as a **dim outline placeholder**, visually distinct from both a completed link and a broken one. It neither extends nor breaks the chain; it simply hasn't happened.
- **Week completion** and **pillar performance** must exclude future days from both numerator and denominator.
- **The streak** stops at today. A future day never breaks it.

Also make Prompt 17's verification #6 real: **Day Patterns and the Chain must derive their per-day percentage from one shared function.** Extract it into `src/lib/chain/completion.ts` and have both call it. They are currently computing the same number two different ways, which is exactly how this bug got in.

---

## §4. The archetype icon

"Evening Operator" is showing a **crescent moon**. The window is 16:00–18:00 — late afternoon, not night. Map icons to the actual archetype (from Prompt 16 §3d):

| Archetype | lucide icon |
|---|---|
| Early Riser | `Sunrise` |
| Morning Sprinter | `Sun` |
| Afternoon Builder | `SunMedium` |
| **Evening Operator** | **`Sunset`** |
| Night Owl | `Moon` |
| Still Learning | `Target` (unchanged) |

`Moon` is reserved for Night Owl (peak at 20:00 or later) and must not appear for any other archetype.

While you're in there: the subtitle still reads **"AI-generated from 58 data points."** This panel is computed from Postgres, not generated by an AI. Change it to `From 58 blocks this week` — using the live count, never hardcoded.

---

## §5. Fix the scrolling background

The purple ribbon background **breaks and shifts as you scroll**, cutting across the cards with a hard edge partway down the page.

Cause: in `src/app/app/weekly-review/page.tsx` the decorative layer sits in an absolutely-positioned wrapper containing a child with `position: 'sticky', top: 0, height: '100vh'`. Sticky inside a scrolling ancestor detaches once the wrapper's own height is exceeded, so the SVG stops tracking and its bottom edge becomes visible.

**Fix:** make the background a true fixed layer that never scrolls:

- Change the wrapper to `position: fixed; inset: 0; z-index: -1; pointer-events: none;` and drop the inner `sticky` element entirely.
- The SVG fills that fixed layer at `width: 100%; height: 100%` with `preserveAspectRatio="xMidYMid slice"`.
- Ensure the page's scrolling content sits in a container with its own stacking context above it, so content scrolls over a completely stationary background.
- Verify the background covers the full viewport at every scroll position, including at the very bottom of a long page and on a short mobile viewport.

Keep the existing gradient, colours and ribbon artwork exactly as they are — this is a positioning fix only, not a redesign.

---

## §6. Do not touch

`src/lib/ai/unified-client.ts` (see §2 — thread values through from callers, never edit the client), `src/lib/agents/**`, `src/lib/calendar/**`, `src/stores/**`, `src/middleware.ts`, `public/sw.js`, `public/manifest.json`.

Do not re-add any `isPreviewEnabled()` guard. Do not add a Sunday gate.

---

## Verification (required)

1. `npm run build` passes.
2. **Kill the AI entirely** (stub `callAI` to return `{ success: false }`) and confirm **Automatic and Semi-Automated are still enabled and still work** — proposals render with rationales, applying them updates the goals, and a `weekly_reviews` row is written. This is the whole point of §1.
3. With the AI stubbed off, Semi-Automated's review screen lists the deterministic proposals with correct old → new values.
4. A goal that hit its target produces **no** proposal. A goal at 20% of target produces an `update_time` proposal with a floor of 10 minutes.
5. On a mid-week view: Friday/Saturday/Sunday show `—` in Day Patterns and dim placeholder links in the Chain. Week completion excludes them. The streak is unaffected by them.
6. Day Patterns and the Chain show **identical** percentages for every past day, and both import from `src/lib/chain/completion.ts`.
7. "Evening Operator" shows a `Sunset` icon. Force each archetype and confirm all five icons are correct and `Moon` appears only for Night Owl.
8. The subtitle reads "From N blocks this week" with the live count.
9. **Scroll the full page top to bottom** — the background is completely stationary, with no seam, no colour break and no gap at any scroll position. Repeat at mobile width.
10. **Paste the real AI provider errors from the dev terminal into your summary**, along with each provider's circuit-breaker state at the time of failure.

---

## Note for the human

§1 is the important one. Goal proposals were coupled to the AI purely because they happened to be generated in the same call — there was never a reason a language model had to decide that a 5h target which produced 1h should come down. Making them arithmetic means the recalibration half of Weekly Review keeps working when every provider is down, and it makes the proposals deterministic and testable, which they weren't before.

§3 is a genuine correctness bug that only appears mid-week, and it's exactly the disagreement Prompt 17's verification #6 was written to catch — so the shared-function fix matters more than the symptom.

I could not determine why the providers are failing without the server logs. §2 identifies two real mechanisms that make total failure much likelier than it should be — a 40s budget that only reaches three of five providers, and a sticky module-level circuit breaker that can skip them all instantly — but the actual error is in your terminal, and §2c requires it be reported.
