# PROMPT 39: A generic rate limit is locking the whole app and calling itself an AI limit

The goals page failing to load and next week failing to generate are **the same 429**. Nothing about AI is involved.

---

## §1. The message is wrong

`src/lib/security/api-protection.ts:130-142`:

```ts
const retryAfter = rateLimitResult.retryAfter || 0;
let errorMsg = 'Too many requests. Please slow down.';
if (retryAfter > 0) {
    ...
    errorMsg = `AI limit reached. Refreshes in ${timeStr.join(' ')}.`;
}
```

**Any** rate limit with a `retryAfter` reports itself as an AI limit. `/api/goals` has no AI limiter — it uses `secureApiRoute`'s default `rateLimit = 'user'` (`:64`). The message sent this diagnosis in the wrong direction entirely.

Report the limiter that actually tripped: which one, its window, its ceiling, and the true reason. Keep "AI limit reached" for the `ai*` limiters only.

## §2. The IP limiter blocks the entire app from one key

`checkMultipleRateLimits` (`rate-limiter.ts:192-197`) checks the IP limit **first**, before the user or endpoint limits, and returns immediately on failure:

```ts
const ipResult = await checkRateLimit(createRateLimitKey('ip', ip), 'ip');
if (!ipResult.allowed) return ipResult;
```

`ip: { windowMs: 60_000, maxRequests: 200 }` — **200 requests per minute across every endpoint, keyed on one IP.**

In local development every request comes from `::1`, so the whole app shares that single budget. Your own dev log shows one page load costing eight or more requests, including **four `/api/goals` calls in 800ms**:

```
00:00:39.571  GET /api/goals
00:00:39.991  GET /api/goals
00:00:40.198  GET /api/goals
00:00:40.327  GET /api/goals
```

Twenty page loads in a minute exhausts it, and then *every* endpoint 429s — goals, the weekly review, everything. That is exactly what you are seeing.

### The fix

- **Skip the IP limit for authenticated requests.** The IP ceiling exists to stop unauthenticated abuse; once a user is identified, the per-user limit (500/min) is the meaningful one. Check user first, and only fall back to IP when there is no user.
- **Exempt localhost in development** (`::1`, `127.0.0.1`, when `NODE_ENV !== 'production'`), or raise it by an order of magnitude there. HMR and React StrictMode double-mounting make the production ceiling meaningless locally.
- **Namespace the Upstash keys by environment.** `UPSTASH_REDIS_REST_URL` is set in `.env.local`, so local dev is sharing counters with whatever else uses that instance — possibly production. Confirm and prefix the keys with the environment.

## §3. Four goals fetches per page load

Find why `/api/goals` is called four times in under a second and make it once. Check `use-goals-manager.ts` callers for an effect without a stable dependency array, a parent re-render cascade, or several components each calling `fetchGoals` independently.

`fetchGoals` itself (`use-goals-manager.ts:106`) is fine — no retry loop. The duplication is in the callers.

While there: `/api/home/state`, `/api/home/summary` and `/api/coach/proactive` also appear twice each in the same load. Same investigation, same fix.

## §4. "Refreshes in 1m" that never refreshes

The window does drain — `EXPIRE` is correctly guarded by `if (count === 1)` (`rate-limiter.ts:95`), so there is no sliding-TTL bug. It never *appears* to clear because the client keeps firing while blocked, and `INCR` runs on rejected requests too, so the moment the key expires a fresh burst exhausts it again.

- **Honour `retryAfter`.** `apiClient` (`src/lib/api-client.ts:145`) throws on 429 like any other error. Handle 429 specifically: stop, wait the advertised interval, then retry **once**. Never retry immediately.
- **Make the countdown real.** If the UI says "refreshes in 1m", it must actually retry when the minute is up, or say nothing about timing.
- **Show the right message.** "Failed to load goals" with an empty state reading *"No goals set yet — add your first goal"* is actively misleading; the user has goals and might create duplicates. A load failure must be visibly distinct from an empty account.

## §5. Confirm the weekly review failure is downstream

Once §§1–4 are in, re-test next-week generation. It is almost certainly the same 429 and needs no separate fix — but **verify** rather than assume. If it still fails, capture the actual error and report it; do not conflate it with this.

Also confirm nothing in the review path is gated by `aiPlanWeek` (`{ 7 days, 10 requests }`). Ten attempts would lock it out for a week, and the symptom would look identical.

---

## §6. Do not touch

- The limits for the genuinely AI-backed endpoints, beyond §1's message change.
- Prompts 33–38.
- Auth, CSRF, and the rest of `secureApiRoute`.

---

## Verification (required)

1. `npm run build` passes.
2. **Goals load.** Report which limiter was tripping and its numbers.
3. **One `/api/goals` call per page load**, not four. Post before/after from the dev log.
4. **`/api/home/state`, `/api/home/summary`, `/api/coach/proactive` are called once each** per load.
5. **An authenticated user is not subject to the IP limit** — hammer from one IP as a logged-in user and confirm the per-user ceiling governs.
6. **Localhost is exempt or raised in development**, and untouched in production.
7. **The 429 message names the real limiter** — no "AI limit reached" for `user` or `ip`.
8. **A 429 backs off and retries once** after `retryAfter`, and the countdown actually fires.
9. **A load failure is visually distinct from an empty account** — no "No goals set yet" when the fetch failed. Screenshot both.
10. **Upstash keys are environment-namespaced.** State whether local and production were sharing counters.
11. **Next week generates.** Confirm it was the same 429; if not, report the real cause separately.
12. Reload the app twenty times in a minute and confirm nothing 429s.

---

## Note for the human

Both symptoms are one 429, and the message pointed everyone in the wrong direction. `api-protection.ts:142` applies the string *"AI limit reached"* to **any** rate limit that carries a `retryAfter`. The goals endpoint has no AI limiter at all — it runs on the default `'user'` tier. So an ordinary throughput limit announced itself as an AI quota.

What actually tripped is the IP limiter: 200 requests per minute, checked before everything else, keyed on a single IP. In local development that is one key for the entire application, and a single page load costs eight or more requests — four of them redundant calls to `/api/goals`. A couple of dozen reloads and every endpoint in the app starts refusing, which is why goals went blank and the weekly review stopped generating at the same moment.

The empty state made it worse. "No goals set yet — add your first goal" after a failed fetch is the one message that must never appear, because the obvious response is to start recreating goals that already exist.

