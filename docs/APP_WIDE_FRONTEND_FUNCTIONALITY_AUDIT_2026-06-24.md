# App-Wide Frontend Functionality Audit

Date: 2026-06-24  
Scope: landing page, sign in, password reset, onboarding, home, Mindspace, goals, calendar, Coach Hub, settings, route/link integrity, API connections, cross-feature reflection, UI consistency, and launch readiness.

Out of scope for this pass: weekly review and habit stacks as active product features. They are locked in production and should not drive stabilization work except where active links, API calls, or UI prompts still leak into the user experience.

## Verification Summary

Checks run:

1. `npx tsc --noEmit --pretty false`: passed.
2. `npm run build`: passed after network access was available for Google font fetching.
3. `npm run lint`: failed with 1219 errors and 510 warnings.
4. Production public route checks:
   - `https://plannrai.in` redirects to `https://www.plannrai.in/`.
   - Landing, login, forgot-password, reset-password, privacy, and protected `/app` redirect behaved at the HTTP level.
   - `https://www.plannrai.in/api/health` returned healthy.
5. Playwright smoke run did not produce a reliable result in this environment and had to be stopped after hanging.

Important note: local code and production are not perfectly aligned. The local code uses the new envelope helpers in many places, but the production unauthenticated `/api/auth/delete-account` response returned a plain `{"error":"Unauthorized"}`. Treat production verification as a separate deploy verification step after the current local branch is deployed.

## Executive Verdict

The app is much healthier than before at the TypeScript/build layer, but it is not yet app-wide stable from a frontend functionality perspective. The biggest user-facing risks are not isolated page bugs; they are connection and reflection gaps between surfaces:

1. Onboarding writes many pieces of user state, then generates calendar in the same request.
2. Calendar, coach, settings, and Mindspace still use mixed mutation paths.
3. Several frontend mutations use raw `fetch`, so they do not inherit the API client’s CSRF/header/error behavior.
4. Weekly review and habit-stack surfaces still appear in navigation, home prompts, API routes, and settings data even though they are locked.
5. The smoke E2E suite is stale and cannot yet prove the complete user journey.

The next stabilization push should focus on making every user action flow through consistent frontend API utilities and making every cross-feature update refresh the same shared state.

## Launch Blockers

### 1. E2E Smoke Suite Is Not A Reliable Signal

Observed:

1. `e2e/smoke.spec.ts` still expects old onboarding text such as `Sequence 8/8`, `START`, and `APPLY SCHEDULE`.
2. Current onboarding has six steps and uses labels such as `S_1/6`, `NEXT`, and `ACTIVATE OS`.
3. The targeted Playwright smoke run hung without producing useful assertion output.
4. `e2e/debug_login.spec.ts` is still present as a debugging spec and expects a Google button label that does not match the current login UI.
5. `npm run lint` now includes `e2e`, but the suite has lint failures.

Impact:

The team cannot trust the current E2E suite to confirm app-wide readiness. It may pass or fail for reasons unrelated to real product behavior.

Required fix:

Create a true smoke suite that covers only:

1. Public landing loads.
2. Login page loads.
3. Forgot-password page loads and accepts an email.
4. Authenticated app shell loads.
5. Main navigation links resolve.
6. Home summary loads without fatal UI errors.
7. Mindspace create/edit/delete works.
8. Goal create/edit/delete works.
9. Calendar summary loads and a manual block can be added/moved/deleted.
10. Settings load and save one harmless preference.

Keep deeper onboarding and AI tests separate from smoke so smoke stays fast.

### 2. Lint Is Not Stable Yet

Observed:

`npm run lint` failed with 1219 errors and 510 warnings. The first visible failures include the new delete-account E2E `prefer-const` issue, many `no-explicit-any` errors, remaining `@ts-nocheck` files, and legacy script/type errors.

Impact:

Adding `e2e` to lint scope is good, but CI should not claim lint stability until the lint command passes or the lint policy is intentionally scoped.

Required fix:

Choose one of two honest paths:

1. Fix all lint errors under `{src,e2e}`.
2. Temporarily scope launch lint to production app code only and create a tracked cleanup task for scripts/legacy AI routes.

Do not present lint as green while the current command fails.

### 3. Onboarding Completion Is Still Fragile

Observed:

1. `src/app/onboarding/page.tsx` uses raw `fetch('/api/onboarding/complete')` instead of `apiClient`.
2. `src/app/api/onboarding/complete/route.ts` still casts `body as any`.
3. The endpoint marks `onboarding_complete: true` before calendar generation is proven complete.
4. Preferences and goal/commitment insert failures can be logged without stopping the flow.
5. Initial calendar generation happens in the same request and can be slow or fail after partial writes.

Impact:

A new user can be redirected into the app with incomplete preferences, anchors, goals, or calendar state. This directly affects home, goals, calendar, coach context, and settings.

Required fix:

1. Use `apiClient.post` for onboarding completion.
2. Add a full Zod schema for onboarding payloads.
3. Persist onboarding in explicit states.
4. Only set `onboarding_complete` after required writes and initial schedule apply succeed.
5. Move initial calendar generation into a resumable job or make the route return a recoverable “schedule generation pending” state.
6. Show a user-safe recovery CTA if schedule generation fails.

### 4. Raw Fetch Mutations Bypass The Frontend API Standard

Observed raw mutation calls in active surfaces:

1. Onboarding completion.
2. Coach apply and coach undo in `src/hooks/use-coach.ts`.
3. Calendar generate-today and apply-schedule in `src/app/app/calendar/page.tsx`.
4. Patch preview/apply/undo in `src/hooks/use-patch-pipeline.tsx`.
5. Goal decomposition in `src/components/goal-interpret.tsx`.
6. Next Move actions in `src/components/next-move.tsx`.
7. Deviation classifier actions.
8. Energy check-in component.
9. Command menu coach message.

Impact:

These calls do not consistently inherit CSRF headers, auth headers, timeout handling, envelope unwrapping, retry behavior, or unified error messages. If CSRF is expanded to more routes, some active UI actions can break immediately.

Required fix:

Move all first-party app mutations to `apiClient`. Keep raw `fetch` only where there is a deliberate streaming/download/browser-native reason.

### 5. Security Standard Is Not Actually Applied To All Mutations

Observed:

`secureApiRoute` defaults `requireCsrf` to `false`. The newly hardened high-risk routes opt in, but many active mutation routes do not, including todos, goals, calendar plan/apply/update paths, coach message/apply, onboarding, settings update, and home energy check-in.

Impact:

The security posture is mixed. Some mutations are CSRF-protected; others are authenticated but not protected by the same standard.

Required fix:

Define route classes:

1. Public read.
2. Authenticated read.
3. Authenticated mutation with CSRF required.
4. Webhook/internal job.

Then make CSRF default-on for authenticated browser mutations, with explicit documented exceptions.

## Route And Link Audit

### Landing Page

Status: mostly healthy.

Verified:

1. Public production landing route returns `200`.
2. Apex redirects to `www`.
3. Primary CTA points to `/login`.
4. Legal links exist.

Fixes:

1. Confirm landing typography and fonts after self-hosting or stabilizing font delivery.
2. Add a production screenshot check for desktop and mobile so hero text, CTA, and legal links remain visible.

### Login, Signup, Forgot Password, Reset Password

Status: generally good, with verification gaps.

Observed:

1. Email/password login and signup are implemented through Supabase.
2. Signup redirects to onboarding when a session exists, otherwise verify-email.
3. Forgot password redirects through `/auth/callback?next=/reset-password`.
4. Reset password requires a Supabase session, then signs the user out after update.
5. Production public login, forgot-password, and reset-password routes return `200`.

Fixes:

1. Add E2E coverage for forgot-password request without relying on actual email inbox.
2. Add a reset-password callback test using Supabase test helpers.
3. Make the Google OAuth E2E selector match the actual button label.
4. Consider redirecting successful login to onboarding explicitly when profile is incomplete instead of relying only on middleware.

### Onboarding

Status: not ready as a reliable many-user first-run flow.

Observed:

1. UI has six current steps: identity, rhythm, anchors, goals, failure modes, generation.
2. Only identity and goals are required by frontend validation.
3. Anchors, sleep, meals, goals, failure modes, permissions, and generation mode are sent together.
4. The backend writes profile, preferences, commitments, goals, materialized anchors, and initial schedule.
5. On success, the frontend sends users to `/app/calendar?setup=complete`.

Fixes:

1. Require practical minimum data before generating calendar: name, sleep/wake, meal pattern, at least one goal, and selected generation mode.
2. Validate anchor time ranges and prevent end-before-start unless explicitly overnight.
3. Deduplicate anchors before insert.
4. Show calendar generation progress as a recoverable step, not a single long request.
5. Make onboarding-created data immediately visible in Settings, Goals, Calendar, Home, and Coach context.
6. Add a “retry initial schedule generation” recovery path.

### Home

Status: usable, but cross-feature refresh is uneven.

Observed:

1. Home fetches `/api/home/summary`, `/api/home/state`, and proactive coach suggestion.
2. Energy check-in saves to `/api/home/energy-checkin`.
3. Home can route users to Calendar, Coach, Settings, Goals, and Weekly Review.
4. Weekly Review prompt is preview-gated in the home page, but related state is still present.
5. Home uses custom refresh events to update goals/calendar state.

Fixes:

1. Remove or fully gate weekly review UI and local storage handling for production.
2. Replace scattered custom events with one app-wide invalidation model for goals, calendar, todos, and coach context.
3. Make home action buttons reflect route query support. For example, `/app/calendar?action=optimize_day` should be consumed by calendar consistently.
4. Ensure no home card points to locked features in production.

### Mindspace

Status: useful UI, but needs safety and cross-feature polish.

Observed:

1. Mindspace is implemented on top of the todos API.
2. Create, update, delete, reorder, archive, pin, search, labels, due date, and priority are present.
3. Rich text HTML is stored in `description`.
4. Saved rich text is rendered with `dangerouslySetInnerHTML`.
5. The todos route has Zod validation but does not sanitize HTML server-side and is not CSRF-protected.
6. Label customization is local-only, not synced across devices.

Fixes:

1. Sanitize rich text server-side before storing or before rendering.
2. Restrict allowed HTML tags/attributes to the Tiptap schema.
3. Move todos mutations under CSRF-required mutation policy.
4. Make label names server-backed if they are intended to be user preferences.
5. Add E2E for create, edit, archive, restore, delete, and reload persistence.
6. Rename any “Task” quick-capture action that routes to Calendar, or route it to Mindspace if the user expects a task/note.

### Goals

Status: core flow exists and cross-feature refresh is partially wired.

Observed:

1. Goals fetch through `useGoalsManager`.
2. Create, update, delete, pause/resume, and strategy wizard paths exist.
3. Goal changes dispatch calendar refresh and coach context refresh.
4. Capacity load is shown.
5. Preview-only plan generation button is feature-gated.

Fixes:

1. Add a reliable “goal change reflected in calendar/home/coach” integration test.
2. Ensure body goals carry practical intensity metadata so the calendar can enforce no two intense body goals per day.
3. Ensure goal create/edit modals validate `days_per_week`, `minutes_per_day`, and pillar-specific constraints.
4. Make delete behavior clear: whether deleting a goal deletes, detaches, or preserves existing calendar blocks.

### Calendar

Status: feature-rich but still the highest cross-feature risk.

Observed:

1. Calendar loads via `/api/calendar/summary`.
2. Manual create/update/delete mostly uses `/api/patch/apply`.
3. Manual move uses `/api/calendar/move-block`.
4. Plan Week and Optimize Day return options, but applying options converts patches into `/api/calendar/apply-schedule`.
5. Empty-day planning uses raw fetch to generate and raw fetch to apply.
6. Undo uses a token from apply-schedule in some flows and patch undo in others.
7. ICS export opens directly.

Fixes:

1. Use one apply/undo pipeline for all calendar mutations.
2. Convert calendar page raw fetch calls to `apiClient`.
3. Make query actions like `?action=optimize_day` actually trigger or pre-open the intended modal.
4. Enforce practical planning rules: anchors are hard boundaries, no two intense body goals in one day, decompression around long anchors, and daily load caps.
5. Add loading and timeout-safe states for AI generation.
6. Add E2E for plan preview, apply, refresh, and undo.

### Coach Hub

Status: promising, but apply/undo must be made safer and more consistent.

Observed:

1. Coach messages use `apiClient.post('/api/coach/message')`.
2. Coach apply and undo use raw `fetch`.
3. Coach apply can send selected option text and allow server-side AI regeneration of operations.
4. Coach state is persisted locally.
5. Coach refreshes calendar via browser events after apply.

Fixes:

1. Move apply and undo to `apiClient`.
2. Do not regenerate selected operations at apply time. Apply the exact canonical patch the user accepted.
3. Add stale option detection and ask for a fresh option when calendar state changed.
4. Make coach history loading match the API client’s unwrapped response shape. The current code checks `res?.success`, while the envelope unwrapping may return `conversation_id` and `messages` directly.
5. Add E2E for ask, receive option, apply, calendar refresh, and undo.

### Settings

Status: good surface area, but some updates bypass backend rules.

Observed:

1. Settings load profile/preferences through `/api/profile/me`.
2. Schedule preferences save through `/api/settings/update`.
3. Sign out and delete account use CSRF-enabled API routes through `apiClient`.
4. Data export opens a direct route.
5. Commitments manager uses the Supabase browser client directly for create/update/delete.
6. Settings update flags schedule regeneration for some fields, but not all fields in the UI are included in `SCHEDULE_AFFECTING_FIELDS`.

Fixes:

1. Move commitment create/update/delete to the anchors API.
2. Ensure anchor edits materialize or update future calendar anchor blocks consistently.
3. Add `buffer_min`, `meals_per_day`, `meal_windows`, `wind_down_min`, `morning_routine_min`, `allow_weekend_work`, and body-related fields to schedule-affecting logic where appropriate.
4. After saving schedule-affecting settings, show a clear calendar regeneration prompt.
5. Add tests that settings changes reflect in calendar generation and home state.

## Cross-Feature Reflection Requirements

The app should guarantee these data reflections:

1. Onboarding goals appear in Goals, Home progress, Calendar planning, and Coach context.
2. Onboarding anchors appear in Calendar, Settings commitments, Home timeline, and Coach context.
3. Settings sleep/meals/buffers update future calendar generation and visible schedule constraints.
4. Goal edits update Calendar load, Home metrics, and Coach context.
5. Mindspace high-priority due-today items can suggest calendar blocks without creating hidden schedule mutations.
6. Calendar block status changes update Home metrics and Goal progress.
7. Coach-applied calendar changes refresh Calendar and Home immediately.
8. Account deletion signs the user out and prevents stale local state from rendering protected data.

Implementation recommendation:

Replace scattered `window.dispatchEvent` calls with a small shared invalidation layer:

1. `invalidateCalendar()`
2. `invalidateGoals()`
3. `invalidateHome()`
4. `invalidateCoachContext()`
5. `invalidateTodos()`

This can still be lightweight, but it should be centralized and tested.

## UI And Design Consistency

Observed strengths:

1. The app has a recognizable visual language: dark shell, glass panels, orange primary, pillar colors, and icon-based navigation.
2. The main app layout is consistent across Home, Mindspace, Goals, Calendar, Coach, and Settings.
3. Mobile bottom navigation exists.
4. Login/forgot/reset share a consistent card pattern.

Issues:

1. Some surfaces use dense glass UI, others use custom SVG/ribbon backgrounds, and Calendar uses a different horizon treatment. This can work, but the app needs a design token pass to keep contrast, spacing, and panel radii consistent.
2. The app still uses external Google font fetching through `next/font/google`; builds depend on network access to Google Fonts.
3. Some UI text still references locked features such as weekly review.
4. There are several visible emojis in production UI. If the product wants a polished executive-assistant feel, replace these with lucide icons or restrained text.
5. Global input sanitizer blocks non-ASCII characters across the app. This can frustrate users with non-English names, accents, symbols, or pasted text. It is also not a substitute for server-side sanitization.

Recommendations:

1. Self-host Inter or switch to local fallback fonts.
2. Remove production-visible locked-feature references.
3. Standardize page backgrounds and panel treatment by route family.
4. Keep icons from lucide for actions instead of emojis.
5. Replace global ASCII-only input blocking with field-specific validation plus server-side sanitization.

## Timeout And API Error Risks

High-risk slow actions:

1. Onboarding complete plus initial calendar generation.
2. Calendar generate today.
3. Calendar plan week.
4. Coach message.
5. Coach apply when operation regeneration is enabled.
6. Settings schedule reset if many blocks exist.

Recommendations:

1. Anything AI-generated should return a preview or job state, not leave the user in a long blocking request.
2. Use clear timeout states with retry.
3. Store generation records so retries do not duplicate blocks.
4. Keep frontend timeouts slightly above backend max duration, but avoid retrying non-idempotent writes.

## Recommended Priority Order

1. Replace raw first-party mutation `fetch` calls with `apiClient`.
2. Fix or rescope lint so the command reflects a real quality gate.
3. Rewrite the E2E smoke suite to match the current UI.
4. Stabilize onboarding completion and initial calendar generation.
5. Remove or fully gate weekly-review and habit-stack UI/API leaks in production.
6. Move settings commitments to secured anchors API.
7. Add server-side rich text sanitization for Mindspace.
8. Unify calendar apply/undo and coach apply behavior.
9. Add cross-feature invalidation helpers.
10. Add production deploy verification for public pages, auth pages, health, and protected redirects.

## Final Recommendation

Do not start a broad feature build yet. The app has the shape of a complete product, and the TypeScript/build progress is real, but app-wide stability still depends on making user actions consistent across surfaces. The best next milestone is a frontend reliability pass: one API client path, current smoke tests, stable onboarding, locked-feature cleanup, and verified cross-feature refresh.

