# PlannrAI Deep Audit: Proposed Fixes and Builds

Date: 2026-06-24
Production domain tested: https://plannrai.in and https://www.plannrai.in
Local repo: /Users/advay/plannrai-web
Scope: frontend, backend/API, auth, security, testing, product readiness, and 20,000-user scale readiness.

This is an audit and proposal document only. No product code changes were made.

## Executive Summary

PlannrAI has the shape of a strong product: a clear landing page, authenticated app shell, Supabase-backed data model, AI coach, calendar planning, goals, tasks, settings, export/delete, PWA assets, and a shared `secureApiRoute` wrapper for many endpoints.

The app is not yet ready to sell confidently to 20,000 users. The biggest blockers are quality gates being bypassed, stale end-to-end tests, inconsistent API security/envelopes, unverified authenticated journey coverage, misleading trust copy, and production-level security hardening gaps. The production site is live and basic public/protected routing works, but a launch-readiness pass must make the app observable, testable, consistent, and honest about privacy/security.

## Audit Method

1. Used the code-review graph first, per project instructions.
2. Refreshed the graph index for the current checkout.
3. Inventoried app pages and API routes.
4. Ran build, lint, and TypeScript checks.
5. Ran existing Playwright e2e suite until it hung, then inspected why.
6. Probed production public routes, protected redirects, API auth responses, and headers.
7. Reviewed high-risk frontend/backend code paths: middleware, API wrapper, auth, onboarding, settings, delete/export, coach, rate limiting, encryption, diagnostics, service worker, and migrations.

## Confirmed Route Surface

Production build reports these primary user pages:

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/legal/privacy`
- `/legal/terms`
- `/onboarding`
- `/app`
- `/app/calendar`
- `/app/coach`
- `/app/goals`
- `/app/goals/[id]`
- `/app/history/[date]`
- `/app/pro`
- `/app/settings`
- `/app/tasks`
- `/app/weekly-review`

The repo contains 96 API route files under `src/app/api`.

Production unauthenticated route probes:

- Public pages returned `200`: `/`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/legal/privacy`, `/legal/terms`.
- Protected pages redirected to login with `307`: `/onboarding`, `/app`, `/app/calendar`, `/app/coach`, `/app/goals`, `/app/tasks`, `/app/settings`, `/app/weekly-review`, `/app/pro`.
- `plannrai.in` redirects to `www.plannrai.in`.

## Critical Blockers

### P0. Quality gates are bypassed

Evidence:

- `next.config.js` sets `typescript.ignoreBuildErrors: true`.
- `npm run build` passes only because TypeScript validation is skipped.
- `npx tsc --noEmit` fails with real app errors in coach-related code:
  - `src/components/coach/CoachChat.tsx`: missing `operations`, `ops`, `new_start`, `new_end`, `new_date` on declared types.
  - `src/hooks/use-coach.ts`: async `stopGeneration` does not match a sync type.
  - `src/hooks/use-coach.ts`: assistant message timestamp uses a string where `CoachMessage` expects a number.
  - `src/lib/coach/context-builder.ts`: `free_slots_today` is not in the typed state object.
  - `src/lib/coach/response-generator.ts`: `recommended` missing from `ProposedOption`.
- `npm run lint` fails with 1,222 errors and 512 warnings.

Why it matters:

The app can ship code that TypeScript already knows is broken. For a coach/calendar product, a broken type contract can become a wrong schedule mutation, failed user action, or invisible loss of trust.

Proposed fix:

- Remove `ignoreBuildErrors`.
- Make `tsc --noEmit` and lint required CI gates.
- Prioritize type fixes in the coach proposal/patch model because that is both user-facing and high-impact.
- Decide whether lint should include scripts/tests. If yes, fix them. If not, scope ESLint intentionally so launch CI is meaningful.

### P0. Existing e2e suite is stale and cannot be trusted

Evidence:

- `e2e/auth.setup.ts` posts to `/api/auth/session`, but no such route exists in the app route inventory.
- `e2e/regression.spec.ts` navigates to `/app/brain-dump`, but no such page exists in this checkout.
- The suite hung during auth setup/local server use.
- Local `localhost:3000` accepted connections but timed out without returning a response during probing.

Why it matters:

There is no reliable automated proof that signup, onboarding, dashboard, coach, goals, calendar, settings, export, and delete-account flows work end to end.

Proposed fix:

- Replace the stale auth setup with a supported Supabase session/cookie setup.
- Remove or rebuild `/app/brain-dump` tests based on product direction.
- Add a smoke suite that runs in less than 5 minutes and covers:
  - public page load
  - signup/login or seeded auth
  - onboarding completion
  - dashboard data load
  - create/update/delete goal
  - create/move/complete calendar block
  - coach message and apply/undo proposal
  - settings save
  - export data
  - logout
  - delete account in a disposable test tenant
- Add a production-safe synthetic monitor that checks public pages, protected redirects, and API health.

### P0. API security behavior is inconsistent

Evidence:

- Most APIs use `secureApiRoute`, but several routes implement auth manually:
  - `src/app/api/coach/history/route.ts`
  - `src/app/api/coach/conversations/route.ts`
  - `src/app/api/auth/delete-account/route.ts`
  - `src/app/api/auth/logout/route.ts`
  - `src/app/api/calendar/auto-place/route.ts`
  - `src/app/api/calendar/inbox/route.ts`
  - `src/app/api/settings/ai-usage/route.ts`
  - health routes
- Production unauthenticated API responses use multiple shapes:
  - `{ ok:false, error:{...}, request_id, timestamp }`
  - `{ success:false, error:"Unauthorized" }`
  - `{ error:"Unauthorized" }`
  - `{ status:"error", message:"Unauthorized" }`
- Middleware intentionally skips API route auth, so every route must be correct on its own.

Why it matters:

Frontend error handling becomes brittle. Security audit logging and headers become uneven. Manual endpoints drift from the central controls.

Proposed fix:

- Move every protected API route to `secureApiRoute` or a small set of explicitly documented variants.
- Standardize all API errors on the envelope in `src/lib/api/envelope.ts`.
- Give every response a request id.
- Add route tests that assert status, envelope shape, security headers, and auth behavior.

### P0. Trust and privacy claims are ahead of implementation

Evidence:

- Login screen says `End-to-end encrypted`.
- `src/lib/security/encryption.ts` exists, but `encryptFields` and `decryptFields` are not used anywhere else in `src`.
- Production app stores core user data in Supabase and calls AI providers.

Why it matters:

For a life-planning product, user data can include deeply personal schedules, goals, emotional state, and coach conversations. Overstating encryption creates legal, trust, and brand risk.

Proposed fix:

- Replace “End-to-end encrypted” with accurate copy until true E2EE exists.
- Define data classification:
  - account data
  - schedule data
  - goals/tasks
  - emotional state/check-ins
  - coach messages
  - AI prompts/responses
  - telemetry/security logs
- Implement field encryption where needed and verify it is actually used.
- Add a plain-language privacy and AI data-use page linked from signup.
- Add retention and deletion guarantees that match backend behavior.

## High-Priority Security Fixes

### P1. Production HTML responses lack app-wide hardening headers

Evidence:

Production `https://www.plannrai.in` and `/login` responses include HSTS but do not include app-wide:

- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy`

The helper in `src/lib/security/security-headers.ts` is applied by `secureApiRoute`, not globally to pages. Production also returns `Access-Control-Allow-Origin: *` on HTML pages.

Proposed fix:

- Add global headers in `next.config.js` or the new Next proxy layer.
- Add a strict but workable CSP:
  - `default-src 'self'`
  - allow Supabase/Auth domains
  - allow configured AI endpoints only from server-side routes, not browser
  - lock down `frame-ancestors 'none'`
  - avoid unsafe inline scripts where feasible
- Remove wildcard CORS from normal HTML responses unless there is a concrete reason.
- Add header checks to CI and production monitoring.

### P1. No explicit CSRF strategy for cookie-authenticated mutations

Evidence:

`secureApiRoute` authenticates with Supabase cookies and checks origin in production, but there is no explicit CSRF token or SameSite policy audit. Manual routes also vary.

Proposed fix:

- Confirm Supabase auth cookies are `HttpOnly`, `Secure`, and `SameSite=Lax` or stricter where possible.
- Require same-origin for all mutating requests.
- Add CSRF tokens for high-risk mutations:
  - delete account
  - export data
  - settings update
  - schedule patch/apply/undo
  - coach apply/undo
- Add tests that cross-origin POSTs are rejected.

### P1. Rate limiting is not production-safe by default

Evidence:

- `src/lib/security/rate-limiter.ts` falls back to an in-memory Map.
- In-memory fallback is per instance and resets on deploy/cold start.
- Endpoint-specific limits are keyed by IP and endpoint rather than user plus endpoint.
- Some manual endpoints do not use the centralized wrapper.

Proposed fix:

- Make Redis/Upstash required in production. Fail closed or degrade non-AI endpoints only with explicit alerts.
- Key AI limits by user id plus endpoint, with IP as a secondary abuse control.
- Add separate limits for:
  - login/signup/password reset
  - AI calls
  - schedule mutations
  - export/delete
  - telemetry
- Return one consistent 429 envelope with `Retry-After`.

### P1. Service-role use in user-facing routes needs tighter controls

Evidence:

- `src/app/api/home/energy-checkin/route.ts` uses `SUPABASE_SERVICE_ROLE_KEY` for user state writes.
- `src/app/api/onboarding/complete/route.ts` can use service role in development and contains broad `body as any` input handling.
- `src/app/api/auth/delete-account/route.ts` uses service role for auth deletion.

Proposed fix:

- Keep service-role only for operations impossible through RLS, such as auth user deletion.
- For service-role routes, require:
  - strict Zod schema validation
  - explicit user id from authenticated context only
  - audit log
  - rate limit
  - CSRF protection
  - no raw client-provided user id
- Move normal user data writes back to RLS-authenticated clients.

### P1. User input handling is too broad in high-risk routes

Evidence:

- Multiple endpoints use `body as any`.
- Some routes use `@ts-nocheck`.
- `GlobalInputSanitizer` blocks non-ASCII input globally, but server-side validation still must be authoritative.

Proposed fix:

- Define Zod schemas per endpoint.
- Reject unknown fields for sensitive mutations.
- Validate time ranges, date formats, UUIDs, enum values, string lengths, and array sizes.
- Add request body size limits for API routes, not only server actions.
- Replace global ASCII-only sanitizer with field-specific validation. The current behavior blocks many legitimate names, locations, languages, and accessibility input.

## Frontend User Experience Fixes

### P1. Landing page sells a vibe more than the product

Evidence:

- Landing page hero is visually strong, but the first screen does not show the actual app, calendar, coach, or dashboard.
- Feature copy claims “Chief of Staff,” “Reality Calendar,” “AI Coach,” and “Insights,” but users cannot inspect the real product before signing up.

Proposed build:

- Add product screenshots or live, non-auth demo panels:
  - today dashboard
  - calendar with reschedule suggestion
  - coach recommendation with before/after preview
  - goal progress
- Add trust proof:
  - what data is stored
  - how AI uses data
  - export/delete guarantee
  - beta limitations
- Add pricing/beta status clarity, especially because `/app/pro` exists.

### P1. App navigation exposes disabled or incomplete product areas

Evidence:

- App layout contains a Review nav item that links to `#` when preview is disabled.
- `/app/pro` exists and is promoted from the sidebar, but account settings says plan is `Beta (Free)`.
- Regression tests reference `/app/brain-dump`, but the actual nav uses `/app/tasks` as Mindspace.

Proposed fix:

- Decide the canonical IA:
  - Home
  - Mindspace/Tasks
  - Calendar
  - Goals
  - Coach
  - Review
  - Settings
  - Pro
- Remove dead `#` links. Use real disabled buttons with tooltips, or hide disabled features entirely.
- Align tests, copy, and navigation names.
- Make `/app/pro` either a real upgrade path or a beta waitlist/coming-soon page.

### P1. Auth and onboarding need trust polish

Evidence:

- Signup/login flow is simple, but copy says “End-to-end encrypted.”
- Onboarding completion triggers profile writes, commitment materialization, goal inserts, and AI schedule generation in one request.
- If initial schedule generation fails, onboarding can fail after partial writes.

Proposed fix:

- Make onboarding multi-step persistence idempotent.
- Save user profile/preferences first, then schedule generation as a resumable job.
- Show clear recovery if AI schedule generation fails:
  - continue to dashboard
  - retry schedule generation
  - manually start from blank calendar
- Add onboarding progress persistence so refresh does not lose work.
- Add email verification states that explain exactly what to do next.

### P2. Mobile and accessibility need real testing

Evidence:

- Browser visual testing was blocked in this environment, and the existing e2e suite is stale.
- `viewport.userScalable` is false in `src/app/layout.tsx`, which harms accessibility.
- Global input sanitizer blocks non-ASCII characters.

Proposed fix:

- Allow pinch zoom unless there is a narrow product reason not to.
- Add Playwright mobile viewport tests for:
  - landing
  - login
  - onboarding
  - dashboard
  - calendar
  - coach
  - settings
- Add keyboard navigation tests for modal flows.
- Run an automated accessibility scan and manual keyboard review.

## Backend and Data Integrity Fixes

### P1. Make schedule mutation atomic and observable

Risk areas:

- Calendar patch/apply/undo is a high-blast-radius flow.
- Graph flagged untested hotspots:
  - `PatchService.executeOp`
  - `PatchService.simulateAndValidatePatch`
  - `CalendarPageInner`
  - `buildCalendarContext`
  - AI plan generation

Proposed fix:

- Move multi-step schedule writes into database transactions or RPCs where possible.
- Store before/after patch summaries.
- Make undo token creation mandatory for destructive schedule changes.
- Add invariant tests:
  - no overlap unless explicitly allowed
  - immutable anchors cannot move/delete
  - user cannot mutate another user's block
  - generated plans respect sleep, meals, commitments, and goal limits
  - undo restores exact prior state

### P1. Delete-account flow needs verification beyond comments

Evidence:

- `delete-account` assumes auth user deletion cascades to all user data.
- Migrations contain multiple cascade-fix files, suggesting this has been painful.

Proposed fix:

- Add an automated data deletion test that creates a disposable user with every data type, deletes the account, and verifies no rows remain.
- Return a deletion receipt id.
- Add audit logging for delete request and completion.
- Consider a soft-delete grace period only if privacy policy supports it. If hard-delete is promised, verify hard-delete.

### P1. Export data should be structured, complete, and rate limited

Proposed fix:

- Document which tables are exported.
- Include metadata:
  - export timestamp
  - user id
  - app version/schema version
  - data categories
- Return a downloadable JSON file with consistent shape.
- Add rate limiting and audit logging.
- Add a frontend state that shows success/failure instead of only `window.open`.

### P2. Migrations need consolidation and schema drift checks

Evidence:

- Many migrations include “fix,” “hardening,” “cascade,” “reload,” and duplicate-looking schema evolutions.

Proposed fix:

- Generate a current canonical schema snapshot.
- Add migration drift checks to CI.
- Document RLS policies by table.
- Add a security test that verifies anonymous access is denied and user isolation holds for every user-owned table.

## AI and Cost Control Fixes

### P1. AI provider calls need stronger budget and failure controls

Evidence:

- Multiple AI endpoints exist: coach, plan day, plan week, weekly review, habits, goals, translate, briefings.
- Rate limits exist but depend on wrapper coverage and Redis availability.
- Logs can include raw AI responses and validation failures.

Proposed fix:

- Centralize AI request metering:
  - user id
  - endpoint/channel
  - provider/model
  - prompt size
  - latency
  - token estimate
  - success/failure class
  - cost estimate
- Add per-user daily and monthly budgets.
- Add graceful fallback when AI providers fail.
- Redact or avoid logging raw personal prompt/response data in production.
- Add prompt injection tests for coach and schedule patch generation.

### P1. Coach proposal schema needs stabilization

Evidence:

- TypeScript errors show frontend, hook, context, and generator disagree on proposal fields.

Proposed fix:

- Define one canonical coach proposal schema.
- Generate TypeScript types from that schema.
- Validate every LLM output against it before UI display.
- Keep a migration adapter for old saved messages.
- Add tests for:
  - info response
  - option selection
  - apply patch
  - undo
  - stale option
  - invalid AI output

## Observability and Operations

### P1. Production observability is not launch-ready

Proposed build:

- Structured server logs with request id, user id hash, route, duration, status, and error class.
- Dashboard for:
  - API error rate
  - auth failures
  - AI failures and cost
  - schedule mutation failures
  - onboarding completion
  - active users
  - p95/p99 latency
  - rate-limit hits
- Alerting for:
  - health check failure
  - AI provider outage
  - elevated 401/403/500
  - scheduler mutation failures
  - Supabase errors
  - excessive cost per user

### P2. Debug diagnostics should not be available to normal production users

Evidence:

- `ApiDiagnostics` is included in root layout and can be shown with `?debug=1`.
- It can display auth state and user id in the browser.

Proposed fix:

- Gate diagnostics by environment and admin role, or remove from production bundles.
- Never display raw user ids to non-admin UI.

## 20,000-User Scale Readiness

Before a 20,000-user push, complete these workstreams:

1. Reliability gates
   - CI requires build, `tsc --noEmit`, lint, unit tests, integration tests, and e2e smoke.
   - No ignored TypeScript errors in production.

2. Supabase readiness
   - Confirm connection pooling.
   - Review indexes for user-owned tables and date queries.
   - Load test calendar/home/coach endpoints.
   - Verify RLS and cascade-delete behavior.

3. AI cost controls
   - Per-user budgets.
   - Provider fallback.
   - Queue/background jobs for long planning tasks.
   - Circuit breakers.

4. Security program
   - App-wide headers and CSP.
   - CSRF strategy.
   - Centralized auth wrapper.
   - Security audit logs.
   - Abuse/rate-limit dashboard.
   - Secrets rotation and least privilege.

5. Product readiness
   - Product demo on landing page.
   - Clear beta limitations.
   - Accurate privacy/security copy.
   - Help/FAQ.
   - Onboarding recovery.
   - Feedback/support channel.

6. Support readiness
   - Admin/debug tooling that does not expose secrets.
   - User issue triage playbook.
   - Data export/delete support process.
   - Incident response checklist.

## Proposed Fix Roadmap

### Phase 1: Stop shipping unknown breakage

- Remove `ignoreBuildErrors`.
- Fix TypeScript errors in coach flow.
- Decide lint scope and make it pass.
- Replace stale Playwright auth setup.
- Add smoke tests for public/protected routing.
- Fix local dev-server hang.

### Phase 2: Security and API consistency

- Move manual protected endpoints into `secureApiRoute`.
- Standardize API envelope.
- Add global production headers and CSP.
- Add CSRF protection for high-risk mutations.
- Require Redis-backed rate limiting in production.
- Audit service-role usage.

### Phase 3: Complete core user experience

- Harden onboarding as resumable and failure-tolerant.
- Stabilize coach proposal schema and apply/undo flows.
- Add calendar mutation invariant tests.
- Align navigation, feature flags, `/app/pro`, weekly review, and Mindspace naming.
- Fix accessibility blockers.

### Phase 4: Trust and scale

- Replace or implement encryption claims.
- Add complete data map, retention policy, and AI data-use disclosure.
- Add observability dashboards and alerting.
- Load test with realistic AI/calendar usage.
- Add production synthetic monitoring.

## Open Questions

1. Is `/app/brain-dump` supposed to exist, or has Mindspace/Tasks replaced it?
2. Is Weekly Review intended to be production-visible or preview-only?
3. Is `/app/pro` meant to sell paid plans now, collect beta interest, or stay hidden?
4. What exact privacy promise do you want to make: encrypted at rest, field-level encrypted, or true end-to-end encrypted?
5. Should AI prompts/responses be retained for memory, or should users be able to opt out?
6. What are the expected free/beta/pro AI usage limits?
7. Do you want to support international names and non-English input now? The current global input sanitizer blocks that.

## Verification Performed

Commands/checks run:

- Code graph context, architecture, flows, and gaps.
- `npm run lint`: failed with 1,222 errors and 512 warnings.
- `npm run build`: passed with network available, but TypeScript errors are skipped by config.
- `npx tsc --noEmit --pretty false`: failed with coach/context type errors.
- `npm run test:e2e -- --reporter=list`: hung; inspected tests and found stale route dependencies.
- Production route probes against `https://www.plannrai.in`.
- Production API unauthenticated probes against selected endpoints.
- Production header checks for root, login, and health.

Limitations:

- Authenticated browser journey testing could not be completed because the existing e2e auth setup is stale and local dev server access hung.
- Headless Chromium launch was blocked by the local desktop sandbox permission boundary.
- No destructive account/delete tests were run against production.

