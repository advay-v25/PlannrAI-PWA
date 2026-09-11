# PROMPT 20: Fix the Groq model ID and reorder the chain so a slow provider can't starve a fast one

Small, surgical, high value. Prompt 19's NVIDIA fix worked but exposed two latency problems. Both are in `src/lib/ai/unified-client.ts`.

---

## §0. Context — why this is needed

Prompt 19 told you to leave Groq's model ID alone, on the basis that Groq's public docs still list `llama-3.3-70b-versatile` as a production model. **That instruction was wrong for this account.** You verified against the live key: its catalogue has 14 models and `llama-3.3-70b-versatile` is not among them. You followed the instruction and flagged the disagreement, which was correct — this prompt is the correction.

Two consequences are live right now:

1. **Groq — the first hop in almost every chain — 404s on every call.** `groq/openai/gpt-oss-120b` answers in **0.58s** on this key.
2. **`generate-today` got slower after the NVIDIA fix.** NVIDIA used to 410 in 40ms, leaving Gemini the full budget. Now it's valid-but-slow, so 2×15s of NVIDIA timeouts starve Gemini and the route falls through to the deterministic planner. `/api/coach/message` takes 18s.

Fixing §1 largely resolves §2 on its own, because Groq answers before NVIDIA is ever reached. §2 is defence in depth.

---

## §1. Replace the dead Groq model ID

`llama-3.3-70b-versatile` appears in **five** places in `src/lib/ai/unified-client.ts`. Replace **all** of them with `openai/gpt-oss-120b`:

| Line | Context |
|---|---|
| ~165 | `chain.push(getGroqConfig('llama-3.3-70b-versatile'))` — default chain, smart tier |
| ~466 | `model: 'llama-3.3-70b-versatile'` in the `GROQ_API_KEY not configured` error payload |
| ~468 | `const provider = getGroqConfig('llama-3.3-70b-versatile')` — `groqOnly` mode |
| ~487 | `batchChain.push(getGroqConfig('llama-3.3-70b-versatile'))` — the batchReview chain |
| ~528 | `getGroqConfig(tier === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile')` — coach engine |

Also update the **comment on line ~30**, which documents `groqOnly` as using `llama-3.3-70b-versatile`. A stale comment about a model that 404s is how the next person loses an hour.

### Verify `llama-3.1-8b-instant` too

Lines ~176 and ~528 use `llama-3.1-8b-instant` for the `fast` tier. **Confirm it is in this key's 14-model catalogue** by listing the models on the live key, exactly as you did before. If it is absent, replace it with the fastest available small model and say which one you chose and why. Do not assume it survived just because a different model didn't.

### Make Groq configurable

Follow the pattern already established for NVIDIA in Prompt 19:

```ts
const GROQ_MODEL_LARGE = process.env.GROQ_MODEL_LARGE ?? 'openai/gpt-oss-120b';
const GROQ_MODEL_SMALL = process.env.GROQ_MODEL_SMALL ?? '<verified fast model>';
```

Use these constants at all five sites. The last two model retirements each cost a debugging session; the next one should be an env var.

---

## §2. A slow provider must not starve a fast one

The current coach chain places NVIDIA ahead of Gemini. With `MAX_PROVIDER_TIME = 15000`, two NVIDIA attempts consume 30s of a 40s budget before Gemini is tried. Your own benchmark on a realistic ~1.5k-token prompt:

```
nvidia/nemotron-3-super-120b-a12b   7.2s
gemini-2.5-flash                    ~1s   (7.4s end-to-end incl. overhead)
groq/openai/gpt-oss-120b            0.58s
```

**Reorder the coach/`useNvidia` chain so NVIDIA sits below Gemini**, keeping both in the chain:

```
Groq → OpenRouter (if key) → Gemini (if key) → NVIDIA primary → NVIDIA tertiary
```

Rules:

- Change **only the ordering** inside the `options.useNvidia` branch. Do not touch `getProviderChain`, the `groqOnly` branch, or the new `batchChain`.
- Keep every provider present — this is a reordering, not a removal. NVIDIA stays as a genuine fallback.
- Do not change `MAX_PROVIDER_TIME`, `MAX_TOTAL_TIME`, the circuit-breaker thresholds, or key handling.
- Leave the `strictNvidia` branch exactly as it is.

---

## §3. Do not touch

Everything outside `src/lib/ai/unified-client.ts`. No route changes, no UI changes, no schema changes.

Specifically leave alone: `patch-service.ts` (including the new `plan_next_week` op), `execute/route.ts`, `generate-report`, `page.tsx`, and the `batchReview` chain's ordering — Gemini-first is already correct there and it is working.

---

## Verification (required)

1. `npm run build` passes.
2. **Grep proves it's gone:** `grep -rn "llama-3.3-70b-versatile" src/` returns **zero** matches, comments included.
3. **Groq answers.** Hit any AI route and confirm from the log that Groq is tried **first** and **succeeds**, with the latency. Report the number.
4. **`generate-today` recovers.** Compare against the current ~30s-then-deterministic-fallback behaviour. Report the new latency and confirm it returns a real AI plan rather than the deterministic one.
5. **`/api/coach/message` recovers.** It currently takes 18s. Report the new figure.
6. **The weekly review summary still works** — it should be unaffected, since `batchChain` is Gemini-first. Confirm it still returns `available: true` and note which provider answered.
7. **Chain order.** Force Groq and OpenRouter to fail (temporarily bad keys) and confirm from the log that **Gemini is tried before NVIDIA**. Undo the stub afterwards.
8. Confirm the fast-tier model (`llama-3.1-8b-instant` or its replacement) is genuinely on this key, and say how you checked.
9. Report every line changed, and the before/after latency for the coach, `generate-today`, and weekly review.

---

## Note for the human

This is the correction to my own bad instruction in Prompt 19 §4a. I checked Groq's public documentation and concluded the model ID was fine; the account's actual catalogue disagreed. Checking the live key beats checking the docs — worth remembering for the next provider incident.

§2 is the more interesting fix. Nothing was broken by repairing NVIDIA — the model IDs became *correct* — but a fast failure had been doing useful work by leaving the budget to a healthy provider, and a slow success took that away. Ordering providers by observed latency rather than by intent is what actually prevents it.
