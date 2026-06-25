# PlannrAI PWA + Coach Hub Stabilization Audit

Date: 2026-06-24

Scope:
- Local PWA at `http://localhost:3000`
- Live Coach Hub reference at `https://plannrai.in/app/coach`
- Code paths for landing page, Coach Hub UI, Coach message generation, Coach apply/undo, and calendar reflection
- Weekly Review and Habit Stacks intentionally excluded

## Executive Summary

The local app appeared broken because the visible page was reduced to the background layer and the dev server on port 3000 was stale/unreachable from the shell even though Atlas still had a page loaded. The build itself is now stable after switching the default build path to webpack, removing build-time Google font fetching, fixing the COBE globe type issue, and correcting Coach apply/undo response handling.

The live Coach Hub loads and shows the expected shell: app navigation, Coach Hub sidebar, empty state, two quick actions, and bottom input. The key remaining product risk is not the shell UI; it is the reliability of Coach option generation and execution. The prompt asks for exactly three options and includes strong rules for anchors, immutable windows, no overlaps, and one body goal per day, but the server must consistently validate and retry bad AI patches before users see or apply them.

## Fixes Already Applied In This Pass

1. Stabilized production/local verification
   - Changed `npm run dev` to use `next dev --webpack`.
   - Changed `npm run build` to use `next build --webpack`.
   - Reason: Turbopack failed in this local environment while trying to bind an internal port during CSS processing. Webpack build succeeds and gives a dependable baseline.

2. Removed external font build dependency
   - Removed `next/font/google` usage from the root layout.
   - Reason: builds should not fail because Google Fonts cannot be fetched during local/CI/Vercel build steps. The app already defines a strong system font stack in CSS.

3. Fixed landing background stacking
   - Restored the full-screen sci-fi background to a negative z-index so it cannot sit above landing page content.
   - Reason: Atlas showed only the visual background and no landing content, matching a layering regression.

4. Fixed COBE globe TypeScript break
   - Replaced unsupported `onRender` config with a typed `requestAnimationFrame` loop using `globe.update(...)`.
   - Reason: the installed `cobe` package type definition does not include `onRender`, so the default build failed.

5. Fixed Coach option apply/undo response handling
   - `useCoach.applyOption` now treats `/api/coach/apply` as returning the result object directly instead of reading `response.data`.
   - `useCoach.undo` no longer expects a fetch-style `ok` property from `apiClient`.
   - Reason: the old client logic could show failure even when the server returned `{ success: true, undo_token, applied_operations }`.

6. Re-enabled Coach conflict retry
   - `/api/coach/message` now retries up to two times when generated operations conflict with existing schedule rules.
   - Reason: the previous loop condition prevented retries entirely, leaving prompt quality as the only defense.

## Verification Performed

- `npm run build` now passes.
- TypeScript validation passes as part of the build.
- Next.js successfully builds all app pages and API routes, including:
  - `/`
  - `/login`
  - `/forgot-password`
  - `/reset-password`
  - `/onboarding`
  - `/app`
  - `/app/calendar`
  - `/app/coach`
  - `/app/goals`
  - `/app/settings`
  - all Coach API routes
- Atlas observation:
  - Local `http://localhost:3000` remained stuck on the stale background-only page.
  - Shell could not reach `localhost:3000` even though a Node process was listening, so the server process should be restarted outside this restricted environment.
  - Live `https://plannrai.in/app/coach` loads the Coach Hub UI and resolves Recents from loading to empty state.

## Remaining High-Priority Fixes

### 1. Restart and verify local server cleanly

Problem:
- Port 3000 is occupied by a stale Node process.
- Shell requests to `localhost:3000` fail immediately.
- Atlas still has an old page loaded, which makes frontend debugging misleading.

Required fix:
- Stop the stale local server.
- Start the app with the updated `npm run dev`.
- Re-test `/`, `/login`, `/onboarding`, `/app`, `/app/calendar`, and `/app/coach`.

Acceptance criteria:
- `http://localhost:3000` renders full landing content, not only the background.
- No console errors on first load.
- Navigation from landing to login works.
- Authenticated app shell renders with nav and page content.

### 2. Standardize Coach apply paths

Problem:
- There are two apply paths:
  - Shared hook: `useCoach.applyOption`
  - Synthetic/quick-action path inside `CoachChat`
- Split apply logic increases the chance that one path works while the other silently fails.

Required fix:
- Route all option application through one shared function.
- Normalize patch shape before calling `/api/coach/apply`.
- Treat `applied_operations`, `undo_token`, and `success` consistently.

Acceptance criteria:
- AI-generated option cards and synthetic quick-action cards behave identically.
- Applying a Coach option refreshes Calendar, Home, and relevant stores.
- Undo works immediately after apply.
- Empty-operation options, such as “No free time today,” are not shown as successful calendar changes.

### 3. Harden `/api/coach/apply` with the secure API wrapper

Problem:
- `/api/coach/apply` performs authenticated calendar mutation but still has custom security handling instead of the shared `secureApiRoute` wrapper.
- It has rate limiting, auth, and validation, but should also inherit the standardized CSRF, origin, envelope, and audit behavior.

Required fix:
- Migrate `/api/coach/apply` to `secureApiRoute`.
- Preserve existing server-side calendar validation.
- Keep the response shape compatible with the frontend.

Acceptance criteria:
- Mutation is blocked without valid CSRF.
- Valid frontend apply still works.
- Error shape is predictable across Coach, Calendar, and Settings mutations.

### 4. Make “three options” deterministic before display

Problem:
- The prompt requests exactly three options, but final enforcement is still partly AI-dependent.
- Fallbacks can return fewer options or generic options.
- The UI can display options with no meaningful operations unless explicitly marked as informational.

Required fix:
- Add a final server-side option normalizer:
  - For reschedule/missed-block flows, return exactly three display slots.
  - Mark unavailable options clearly with `disabled: true` and `reason`.
  - Do not make empty options look applyable.
  - Ensure every actionable option has valid operations.

Acceptance criteria:
- User always sees three relevant choices for rescheduling:
  - Today if possible
  - Later this week if possible
  - Replace lower-priority block if safe
- Unavailable choices are visible but disabled, with plain explanation.
- No option applies an empty patch unless it is explicitly a manual/no-op choice.

### 5. Keep practical constraints as server rules, not only prompt rules

Already present in the prompt:
- Never overlap anchors, sleep, meals, or wind-down.
- Never create two body goal blocks in one day.
- Do not replace the same goal with itself.
- Do not place work in the past.
- Do not use unverified free slots.

Required fix:
- Confirm these are all enforced in `validateCoachOps`, not only in the AI prompt.
- Add tests for each rule:
  - Anchor overlap rejected.
  - Meal overlap rejected.
  - Two body blocks in one day rejected.
  - Same-goal replacement rejected.
  - Past-time move rejected.
  - Option 3 cannot replace higher-priority or immutable work.

Acceptance criteria:
- Invalid AI output is rejected server-side even if prompt instructions fail.
- The Coach retries or returns a safe unavailable option instead of exposing invalid operations.

### 6. Improve Coach Hub empty state and quick actions

Problem:
- Live Coach Hub has only two quick actions:
  - Reduce today’s load
  - Fix today’s schedule
- This is functional but narrow. It does not teach users the full value of Donna without looking like a feature tour.

Required fix:
- Keep two or three quick actions, but make them context-aware:
  - If today has overdue/missed blocks: “Fix today’s schedule”
  - If workload is high: “Reduce today’s load”
  - If goals lack calendar blocks: “Protect goal time”
  - If no context exists: show generic examples without causing mutation

Acceptance criteria:
- Quick actions are relevant to the current user state.
- Actions do not mutate calendar without showing options first.
- Empty state feels alive but not noisy.

### 7. Improve Coach option cards

Problem:
- Option cards currently compress impact into uppercase text and can become hard to scan.
- A user deciding whether to let an AI change their calendar needs very concrete before/after information.

Required fix:
- Each option card should show:
  - What changes
  - When it happens
  - What gets protected
  - What gets sacrificed, if anything
  - Whether it is recommended
- Use preview rows from the operation list instead of only prose.

Acceptance criteria:
- Users can understand an option without reading raw AI-style text.
- Option 3 clearly names the block being replaced.
- Risk/tradeoff language is visible before apply.

### 8. Add end-to-end Coach regression tests

Problem:
- The current build verifies pages compile, but not that Coach can generate, display, apply, refresh, and undo options.

Required fix:
- Add seeded test scenarios:
  - Missed body block with another body block already scheduled today.
  - Missed craft block with a valid free slot today.
  - Full day with lower-priority replacement available.
  - Full week with no safe replacement.
  - Anchor-heavy day where options must avoid protected time.

Acceptance criteria:
- Coach returns valid three-option structures where expected.
- Apply changes calendar state.
- Calendar refresh event reaches visible UI.
- Undo restores previous state.
- Invalid options are not shown as applyable.

## Recommended Next Build Order

1. Restart local server and confirm the landing page is visible with the updated build.
2. Merge the current stability fixes.
3. Refactor Coach apply to a single shared frontend path.
4. Migrate `/api/coach/apply` to the secure wrapper.
5. Add the server-side option normalizer and disabled-option support.
6. Add regression tests for the practical constraints.
7. Polish Coach option card UX and context-aware quick actions.

## Current Status

The code now builds successfully and the most obvious local breakage sources are fixed. The remaining work is mostly about making Coach Hub dependable under real user conditions: deterministic option handling, one apply path, server-side practical constraints, and regression tests that prove the Coach cannot compromise a user's calendar.
