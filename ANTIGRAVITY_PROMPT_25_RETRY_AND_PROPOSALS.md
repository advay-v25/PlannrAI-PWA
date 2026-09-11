# PROMPT 25: Stop Retry burning the provider budget, surface the real error, and close the proposal dead zone

Two unrelated fixes. §1–2 are why the AI summary appears broken when it isn't. §3 is why Automatic and Semi-Automated are permanently greyed out.

---

## §1. Retry can exhaust every provider in seconds

Read from `.next/dev/logs/next-development.log`. Between `00:51:33` and `00:51:49` — **16 seconds** — the summary generated successfully **five times**, then:

```
groq API 429: Rate limit reached for model `openai/gpt-oss-120b` ...
tokens per minute (TPM): Limit 8000, Used 7629
```

Five summaries in fifteen seconds consumed Groq's entire free-tier per-minute budget. Gemini was already 429'd with its breaker OPEN, OpenRouter has no credit — so the sixth request had nothing left and the user was told the feature is broken. It wasn't.

Nothing throttles the Retry button, and nothing prevents concurrent in-flight requests.

### 1a. One request at a time

- Track an in-flight flag for the AI summary fetch. While a request is outstanding, **Retry is disabled and shows a spinner**.
- If a fetch is somehow triggered while one is in flight, **drop the new one** rather than queueing it. Two simultaneous summaries of the same week is never useful.

### 1b. Cooldown after any attempt

- After a request settles — success *or* failure — Retry is **disabled for 20 seconds**, with a live countdown in the label: `Retry in 14s`.
- The cooldown applies to failures too. Rapid retries against a rate-limited provider make the situation worse, not better.

### 1c. Longer backoff on a 429 specifically

- If the failure reason contains a **429 / rate limit** from any provider, set the cooldown to **60 seconds** instead of 20, and change the card's message to say so plainly — something like *"Rate limit reached. Try again in a minute."*
- A 429 is temporary and self-healing. The user should be told to wait, not invited to retry into the same wall.

### 1d. Don't refetch on every mount

Check whether navigating away and back, or the week switcher, refires `generate-report`. If it does, **cache the successful summary per `weekStart` for the session** so returning to a week already summarised costs nothing. Repeatedly re-summarising the same unchanged week is the other way this budget gets burned.

---

## §2. Show the real error, not the last one

The card currently displays only the **final** provider's error. OpenRouter is last in `batchChain` and has **zero credit**, so it 402s on every single call — which means its billing message masks the actual cause every time. The screenshot blamed OpenRouter credits when the real cause was a Groq rate limit.

- Have `generate-report` return **every** provider failure, not just the last: `[{ provider, model, status, message }]`.
- In the card's dev-only detail block, list them **in order**, so the first real failure is visible at a glance.
- If **any** provider returned 429, lead with that — it is almost always the actionable one.
- Keep the whole detail block dev-only (`NODE_ENV !== 'production'`), as established in Prompt 17 §4.

**Also: skip a provider that cannot possibly succeed.** If OpenRouter has previously returned 402 in this process, stop attempting it for the rest of the session — it costs a round trip and poisons the error message. Log the skip. Do not remove it from the chain; a credit top-up must revive it on the next server start.

---

## §3. Why Automatic and Semi-Automated never appear — the proposal dead zone

The buttons are correct. `page.tsx:664` and `:678` disable them on `!hasProposals`, and `proposals` comes from `stats.proposed_goal_changes`. The problem is that `buildProposals()` in `src/lib/chain/proposals.ts` returns an empty array for cases that clearly deserve a proposal.

### The two holes

**Hole 1 — the 0.8–1.2 dead zone.** Rule 3 fires only below `ratio < 0.8` and rule 4 only above `ratio > 1.2`. A goal targeting 20h that completed 18h — **two hours short** — matches nothing and is silently treated as a success.

**Hole 2 — the silent no-op fallthrough.** This is the worse one:

```ts
if (ratio < 0.8) {
    const newDays = Math.max(1, g.activeDays);
    if (newDays !== g.daysPerWeek) { proposals.push(...); continue; }
}
```

When `newDays === daysPerWeek`, the inner `if` fails — and because `continue` sits *inside* it, execution falls through to rule 4, fails that too, and the goal ends with **no proposal at all**. So a goal at **ratio 0.75 — 25% short** — produces nothing, purely because the user showed up on every planned day but did shorter sessions. The frequency rule cannot express that problem, and nothing else gets a turn.

### The fix

**Diagnose the shortfall, then pick the right lever — and never give up silently.**

Replace rules 2–4 with:

1. Compute `shortfall = weeklyTarget - completed`.
2. Propose whenever **`ratio < 0.95`** *or* **`shortfall >= 30` minutes** — whichever triggers first. Two hours short of twenty is worth surfacing; five minutes short is not.
3. Choose the lever by what actually went wrong:
   - **`activeDays < daysPerWeek`** → the user missed whole days → `update_days`, set to `activeDays`.
   - **`activeDays >= daysPerWeek`** → they showed up every day but sessions ran short → `update_time`, set to `round(completed / activeDays)`, floored at `FLOOR_MINUTES`.
4. **If the chosen lever is a no-op, try the other one before giving up.** This is the specific bug in Hole 2 — a no-op days-change must fall through to a time-change, not to nothing.
5. Only if **both** levers are no-ops does the goal get no proposal.

Keep rule 1 (pause after two untouched weeks) and rule 4's over-achievement case exactly as they are, including the `ratio > 1.2` threshold — raising a target is a different decision from fixing a shortfall and should stay conservative.

**Guard against trivia.** Suppress any proposal whose change is smaller than **5 minutes/day** or **1 day/week** — those are noise, and a list of them would train users to ignore the whole panel.

### While you're there

When there genuinely are no proposals, the disabled state should read as **success**, not as a broken button. The tooltip at `:665` and `:679` already says *"No changes suggested — your goals matched your week."* — surface that as **visible text near the buttons**, not only on hover. A greyed-out button with a hover-only explanation reads as a bug, and it's invisible on touch devices entirely.

---

## §4. Do not touch

`src/lib/ai/unified-client.ts` — do not change the provider chain, the model IDs, the circuit-breaker thresholds, or key handling. §1 and §2 are entirely caller-side.

Also unchanged: `chain-service.ts`, `completion.ts`, the chain visuals, `plan_next_week`, and the apply path.

---

## Verification (required)

1. `npm run build` passes.
2. **Retry is throttled.** Click it repeatedly: only one request goes out, the button disables with a visible countdown, and no second request fires before the cooldown ends. Confirm from the network tab.
3. **429 backs off longer.** Force a rate limit (or stub the reason) and confirm a 60s cooldown and the "try again in a minute" message.
4. **All provider errors are listed**, in order, dev-only. Reproduce the log's exact scenario and confirm the **Groq 429** is visible and leading — not buried behind OpenRouter's 402.
5. **OpenRouter is skipped** after its first 402 in a process, with a log line, and revives on restart.
6. **Revisiting a week doesn't refetch** an already-generated summary.
7. **The dead zone is closed.** A goal at 18h of a 20h target (ratio 0.9) now produces a proposal. State which lever it chose and why.
8. **Hole 2 is fixed.** A goal at ratio 0.75 where `activeDays === daysPerWeek` produces an `update_time` proposal instead of nothing.
9. **Automatic and Semi-Automated are enabled** on real data. Report how many proposals your actual week now generates, with each goal's ratio, chosen lever and old → new values.
10. **Trivia is suppressed** — a goal 3 minutes/day short produces nothing.
11. When there are genuinely zero proposals, the "your goals matched your week" message is **visible without hovering**.

---

## Note for the human

Hole 2 is the one that was actually biting you. A goal 25% short of target produced no proposal at all — not because the shortfall was too small, but because the only rule that could fire could only ever change the *number of days*, and the days were already right. The `continue` sitting inside the inner `if` meant that when the days-change turned out to be a no-op, the goal fell straight through every remaining rule and out the bottom.

That's why Antigravity's report said "this week yields 0, which is correct." It wasn't correct — it was a goal at 0.75 being silently dropped, and the summary read it as a success state.

Your framing is the right rule: two hours is two hours. The new threshold is a 30-minute absolute shortfall *or* 5% relative, whichever fires first, with a floor to keep genuinely trivial differences out.
