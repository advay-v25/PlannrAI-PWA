# PlannrAI — Deep Audit Report

**Date:** 2026-07-08 · **Scope:** Security, functional correctness, end-to-end behavior, UI/UX · **Method:** Graphify knowledge graph (1,750 nodes, 3,970 edges, 109 communities) + static analysis + typecheck/lint. **Read-only audit — no app files were modified.**

---

## 1. Architecture Overview (from the knowledge graph)

The codebase (373 TS files, ~67k lines, ~100 API routes) hinges on five god nodes:

| Node | Degree | Role |
|---|---|---|
| `secureApiRoute()` (lib/security/api-protection.ts) | 108 | Auth + rate-limit + CSRF + audit wrapper on ~98% of routes |
| `createClient()` (lib/supabase/server.ts) | 106 | Server Supabase client |
| `apiSuccess()` / `apiError()` (lib/api/envelope.ts) | 90 / 87 | Response envelope |
| `cn()` (lib/utils) | 75 | Styling utility |

This is a healthy shape: security and response formatting are centralized, so fixes there propagate everywhere. The main structural risks are **duplicate parallel subsystems** (two undo mechanisms, two day-optimizers, two toast systems, singular/plural habit-stack routes) and **drift between the client (`api-client.ts`) and the server envelope**.

**Verdict:** the foundation is solid; nothing below requires re-architecture. Items marked 🔴 actively produce wrong behavior for real users today.

---

## 2. Critical Issues (fix first)

### 🔴 C1. Conflict-resolution flow is unreachable — `ApiError` is never thrown
`src/lib/api-client.ts:129-147` throws plain `new Error(message)` on 4xx; the `ApiError` class (line 14) is instantiated **nowhere**. But `src/hooks/use-calendar.ts:139-150, 172-184` checks `e.status === 409 && e.data?.error?.details?.conflict` to intercept conflicts from `api/calendar/move-block/route.ts:43` (which correctly returns 409 + `resolution_options`). Since `e.status`/`e.data` are always `undefined`, every scheduling conflict degrades to a generic "Failed to move block" toast. The entire conflict-resolution UI path is dead.
**Fix:** in the 4xx branch, `throw new ApiError(status, statusText, parsedBody)`.

### 🔴 C2. Undo after applying an AI plan reverts the wrong thing
`use-calendar.ts:394` stores `version_id` from `/api/calendar/apply-schedule` (writes `schedule_versions`, never `patch_runs`), but `undoLastCalendarAction` (`:408`) posts to `/api/patch/undo`, which ignores that token and undoes the latest **`patch_runs`** entry (`lib/services/patch-service.ts:855`). Clicking Undo after applying an AI plan reverts the user's last *manual* edit and leaves the AI plan in place. Silent data corruption.
**Fix:** unify on one undo mechanism, or route calendar undo to `/api/calendar/undo` with the stored `version_id`.

### 🔴 C3. Timezone bugs corrupt "today" and week boundaries
- `use-calendar.ts:61`: `format(addDays(new Date(startStr), 6), 'yyyy-MM-dd')` — `new Date('YYYY-MM-DD')` parses as UTC midnight, then formats in local tz. In any UTC-negative timezone the week view drops Sunday entirely.
- **70 occurrences** of `toISOString().split('T')[0]` compute "today" in UTC. For an IST user between 00:00–05:30, morning briefing, home state, proactive coach, goals, and re-optimize all operate on *yesterday* (`api/home/state/route.ts:105,247`, `api/home/summary/route.ts:9`, `api/coach/proactive/route.ts:8`, `api/goals/route.ts:272,324`, `api/calendar/optimize-day/route.ts:13`, `api/ai/morning-briefing/route.ts:13-14`, `hooks/use-schedule-sync.ts:37`, +60 more).
- The correct tz-aware pattern already exists at `api/coach/message/route.ts:108-110` (`Intl.DateTimeFormat` with the user's timezone) — it just isn't propagated.
**Fix:** one shared `getUserToday(timezone)` helper; ban the UTC pattern via an eslint rule.

### 🔴 C4. Open redirect in OAuth callback
`src/app/auth/callback/route.ts:8,60`: `next` comes from the query string and is concatenated unvalidated: `NextResponse.redirect(\`${origin}${next}\`)`. A crafted link like `/auth/callback?code=...&next=@evil.com` redirects a freshly-authenticated user to `https://plannrai.in@evil.com` → **evil.com** (phishing-grade). Same class as `next=.evil.com`.
**Fix:** require `next.startsWith('/') && !next.startsWith('//')`, else fall back to `/app`.

### 🔴 C5. Weekly-review AI channel is misconfigured — repair path always fails
`lib/ai/registry.ts:519` sets `model: "anthropic/claude-3.5-sonnet"`, but `lib/ai/json-reliability.ts:45,79` sends repair requests to **Groq** with that model id → guaranteed 404 → any malformed weekly-review JSON drops to the canned "AI Review temporarily unavailable" fallback. Also `ai-service.ts:266-276` routes `anthropic/`-prefixed channels via NVIDIA, so Claude is never actually called — weekly review silently runs on Llama.

---

## 3. Security Audit

### What's already good
Centralized `secureApiRoute` (auth + rate limit + CSRF double-submit + audit log + security headers) on all but 2 routes (both justified); CSP + X-Frame-Options DENY in `next.config.js`; AES-256-GCM with random 12-byte IV and env-based key (`lib/security/encryption.ts`); `.env*` gitignored and not tracked in git history; no secrets hardcoded in `src/`; only safe `NEXT_PUBLIC_` vars exposed (URL, anon key, flags); service-role key confined to two server routes + dev scripts; IDOR checks present (`[id]` routes filter `.eq('user_id', ...)`); delete-account requires typed `confirm: 'delete'` (zod literal) behind auth; 45 tables have