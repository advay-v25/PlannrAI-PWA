# Calendar System Engineering Audit

Date: 2026-06-24  
Scope: calendar planning, onboarding schedule generation, AI coach schedule actions, calendar UI apply flows, patch/undo behavior, anchors, realistic daily capacity rules, and supporting APIs.

Out of scope for this audit pass: weekly review and habit stacks. Those areas are currently locked in production and should not drive calendar stabilization decisions until they are intentionally reopened.

## Executive Verdict

The calendar system has a strong foundation, but it is not yet stable enough for a large multi-user launch without hardening. The best engineering choice already present is the deterministic week planner in `src/lib/calendar/ai/plan-week.ts`, which avoids relying on an LLM for the most important scheduling decisions. The main risk is that the app does not have one authoritative calendar mutation path. Calendar blocks can be created, cleared, moved, regenerated, undone, and coach-applied through several different services and routes, each with slightly different rules.

The priority should be stability before new feature work:

1. Consolidate all schedule mutations behind one canonical patch service.
2. Make onboarding schedule generation resumable and non-destructive.
3. Remove broad `coach` bypass behavior and replace it with explicit policy modes.
4. Make plan/apply/undo transactional or database-atomic.
5. Add practical planner constraints around anchors, body-goal exhaustion, buffers, and daily load.
6. Add tests around planner invariants, API contracts, multi-user isolation, and stale patch behavior.

## End-To-End Calendar Map

### Onboarding To Initial Schedule

Flow:

1. `src/app/api/onboarding/complete/route.ts` saves profile data.
2. It saves profile preferences, commitments, and goals.
3. It materializes anchor commitments.
4. It builds a calendar context through `buildCalendarContext`.
5. It generates an initial weekly plan with `generateWeekPlan`.
6. It applies generated events through `PatchService.applyPatch` with source `coach`.

Key concern: onboarding marks profile completion before the full schedule pipeline is guaranteed to succeed. Some write errors are logged but not treated as hard failures, and the final calendar apply uses the broad coach bypass path.

### Calendar UI To Schedule Mutation

Flow:

1. `src/hooks/use-calendar.ts` loads the week from `/api/calendar/summary`.
2. Manual create/update/delete generally uses `/api/patch/apply`.
3. Manual drag uses `/api/calendar/move-block`.
4. Plan Week uses `/api/calendar/plan-week`, then the UI converts the returned patch into an `/api/calendar/apply-schedule` request.
5. Empty-day planning calls `/api/calendar/generate-today`, then applies through `/api/calendar/apply-schedule`.
6. Optimize Day calls `/api/calendar/optimize-day`, then applies through `/api/calendar/apply-schedule`.
7. Undo from the calendar UI calls `/api/patch/undo` with the returned version token.

Key concern: the UI calls multiple backend mutation systems for the same user-facing object: schedule blocks. This creates drift between preview, apply, undo, and refresh behavior.

### AI Coach To Calendar

Flow:

1. Coach responses can include schedule patches/options.
2. `src/app/api/coach/apply/route.ts` can optionally ask the model to regenerate precise operations from the selected option text.
3. The route normalizes coach operations into PatchService operations.
4. It applies the result through `PatchService.applyPatch` with source `coach`.
5. The UI refreshes the calendar through global refresh events.

Key concern: allowing the model to regenerate execution operations at apply time increases unpredictability. The selected option and the applied operation can diverge. Coach applies also use the broad `coach` source path, which bypasses some goal constraints.

## What Is Good

1. The week planner is deterministic and explainable rather than pure LLM scheduling.
2. `buildCalendarContext` centralizes a lot of profile, preferences, goals, commitments, performance, coach learning, and behavior data.
3. The main `src/lib/services/patch-service.ts` includes simulation, overlap checks, inverse patches, undo tokens, and user-scoped database operations.
4. The scheduling protocol in `src/lib/scheduling/protocol.ts` creates a shared language for energy and mood modes.
5. Several endpoints already use authenticated wrappers and Zod validation.
6. The calendar summary endpoint renders virtual commitment anchors, which helps avoid duplicate stored anchor blocks in the UI.

These are worth preserving. The goal should be consolidation and hardening, not a rewrite.

## Practical Scheduling Rules

The planner should optimize for a schedule a real person can actually live through, not just for mathematically available white space. The following constraints should be treated as product rules, not optional prompt guidance.

### Anchors Are Hard Boundaries

Anchors represent fixed commitments such as classes, work, meetings, calls, appointments, or recurring life obligations. The planner should treat anchors as immovable blocks with protected transition time.

Required behavior:

1. Never overlap a generated block with an anchor.
2. Add a default buffer before and after anchors.
3. Do not place deep work immediately after a long anchor unless the user has enough decompression time.
4. Do not delete or mutate anchors through normal AI planning.
5. If anchors make a day too full, reduce planned goals rather than compressing the day.

### Body Goals Need Exhaustion Protection

Body goals are not equivalent to desk work. Two intense body goals in one day can be physically unrealistic, especially for users who are also managing work, study, sleep, and recovery.

Required behavior:

1. At most one intense body goal per day.
2. At most two body-related blocks per day only when one is clearly light recovery, mobility, walking, stretching, or low-intensity movement.
3. Never schedule two high-intensity body blocks on the same day.
4. Add recovery spacing after body blocks before deep cognitive work.
5. Avoid scheduling intense body work late in the day if it conflicts with wind-down or sleep quality.

### Daily Load Must Be Capped

A good plan should leave the user feeling guided, not packed. Available time does not mean usable capacity.

Required behavior:

1. Respect mode-based limits: recovery days should feel light, balanced days should be sustainable, and momentum days should still preserve sleep and anchors.
2. Cap total deep work minutes per day.
3. Cap total goal blocks per day.
4. Limit context switching between pillars.
5. Prefer fewer complete blocks over many fragmented blocks.
6. Leave at least one meaningful open recovery window on normal days unless the user explicitly chooses an aggressive plan.

### Weekly Review And Habit Stacks Are Excluded For Now

Do not build calendar fixes that depend on weekly review or habit-stack behavior. If those modules appear in context builders or API responses, the calendar planner should treat them as inactive inputs for this stabilization phase.

## Critical Findings

### 1. There Are Multiple Calendar Mutation Engines

Observed paths:

1. `src/lib/services/patch-service.ts`
2. `src/lib/calendar/patch-service.ts`
3. `src/app/api/calendar/apply-schedule/route.ts`
4. `src/app/api/calendar/generate-today/route.ts` direct schedule insertion when forced
5. `src/app/api/calendar/move-block/route.ts`
6. `src/app/api/calendar/block-status/route.ts`

Impact:

Different routes enforce different constraints, produce different undo formats, and clear schedules differently. This is the highest-risk engineering issue because it can produce bugs that only happen through one entry point.

Recommendation:

Create one canonical schedule mutation pipeline and route every create, update, move, delete, replan, coach apply, onboarding apply, and status transition through it. Existing endpoints can remain for compatibility, but they should become thin adapters.

### 2. Onboarding Can Leave Users In A Partial State

Observed in `src/app/api/onboarding/complete/route.ts`:

1. Profile completion is persisted before the initial calendar is guaranteed to apply.
2. Preference and goal write errors can be logged without failing the onboarding operation.
3. Initial schedule generation happens after multiple writes, outside a transaction.
4. Initial calendar apply uses source `coach`, which bypasses some constraints.

Impact:

A user can be marked onboarded while goals, preferences, commitments, or initial schedule are incomplete. At scale, this creates support cases that are difficult to recover because the user appears valid but has an inconsistent data graph.

Recommendation:

Split onboarding into clear states:

1. `profile_saved`
2. `preferences_saved`
3. `commitments_saved`
4. `goals_saved`
5. `schedule_generation_ready`
6. `schedule_initialized`
7. `onboarding_complete`

Only set `onboarding_complete` after required writes and schedule initialization succeed, or after the user intentionally skips schedule generation. Store a resumable onboarding generation record so failed schedule creation can be retried safely.

### 3. Coach Source Bypasses Too Much

Observed in `src/lib/services/patch-service.ts`:

`validateGoalConstraints` returns early for source `coach`.

Impact:

Coach actions can exceed limits that manual or AI calendar actions must respect. Onboarding also uses source `coach`, so initial schedule generation inherits the bypass.

Recommendation:

Replace source-based bypasses with explicit policy modes:

1. `standard`: normal user edits and normal AI plans.
2. `coach_suggested`: coach may propose cascades, but hard invariants still apply.
3. `onboarding_initial`: can create first-plan blocks, but cannot break sleep, anchors, or daily/weekly goal limits.
4. `admin_repair`: internal-only, audited, and never exposed from normal user routes.

The policy should be validated server-side and stored with each patch run.

### 4. Plan Week Preview And Apply Can Drift

Observed in `src/hooks/use-calendar.ts`:

The Plan Week API returns option patches, but the UI extracts create operations and sends a transformed `patch.add` payload to `/api/calendar/apply-schedule`.

Impact:

The plan the user previews is not applied through the same object that was generated. Updates, deletes, metadata, reason, source, variant ID, and future patch semantics can be lost during transformation.

Recommendation:

Send the selected canonical patch directly to a single apply endpoint. The frontend should not reinterpret planner operations. If a legacy apply shape is required temporarily, the backend should perform the conversion in one shared adapter with tests.

### 5. Generate Today Is Destructive When Forced

Observed in `src/app/api/calendar/generate-today/route.ts` and calendar page empty-day flow:

The UI calls generate today with `force: true`. The backend can delete existing blocks for a date, and later writes generated blocks through a route that bypasses the main patch service.

Impact:

Users can lose blocks unexpectedly if the day is considered empty by one UI filter but not truly empty in the database, or if generated planning is retried. This is especially risky with imported, locked, completed, commitment-linked, or planner-owned blocks.

Recommendation:

Make regeneration scope explicit:

1. `preview_only`: generate candidate plan, no writes.
2. `replace_generated_only`: replace blocks created by the same planner generation source.
3. `replace_unlocked_future`: replace only unlocked future blocks after user confirmation.

Never delete all blocks for a date as an implicit side effect of AI generation.

### 6. Patch Application And Undo Are Not Atomic Enough

Observed in patch services and apply routes:

1. Operations are applied sequentially.
2. Snapshots are inserted separately from schedule writes.
3. Some paths return partial success if at least one operation applied.
4. Undo can apply inverse operations sequentially and then mark the patch as no longer applied.
5. `createSnapshot` contains a placeholder `week_start` based on the current date, not the affected patch range.

Impact:

Network failures, database errors, or concurrent edits can leave the schedule partially changed. Undo may not fully undo.

Recommendation:

Move apply and undo into a database RPC or transaction-backed service:

1. Validate patch.
2. Lock affected user/date range.
3. Simulate final state.
4. Write schedule changes.
5. Write patch run and inverse patch.
6. Commit all together.

If any step fails, no schedule changes should persist.

### 7. Context Builder Has Silent Fallbacks And Ambiguous Precedence

Observed in `src/lib/calendar/context-builder.ts`:

1. Many missing values silently fall back to defaults.
2. Some profile fields take precedence over profile preferences, while other preference fields take precedence over profile fields.
3. Query errors are often treated as empty data.
4. Fetch limits such as 20 goals, 30 commitments, and 200 schedule blocks can hide data for heavy users.
5. Dates are mostly server-date based unless a route passes explicit week/date context.

Impact:

The planner can generate a plausible but wrong schedule if preferences, commitments, or goals fail to load. For many users, silent defaults create difficult trust issues because the app seems to ignore data without explaining why.

Recommendation:

Make context building explicit:

1. Accept `targetDate`, `weekStart`, and `timezone` as required inputs.
2. Return `data`, `warnings`, and `errors`.
3. Treat required source failures as blocking.
4. Mark inferred defaults as inferred.
5. Define one precedence rule: user preferences override profile defaults unless a field is intentionally locked.
6. Replace hard limits with pagination or clearly scoped date-range limits.

### 8. Week Planner Needs Stronger Invariants

Observed in `src/lib/calendar/ai/plan-week.ts`:

1. Existing done, fixed, and commitment blocks are exclusions, but flexible planned blocks are not always excluded.
2. Bio blocks are generated as actual blocks in variants, while some apply paths skip or clear bio blocks differently.
3. Goal `days_per_week` is mostly enforced indirectly through total minutes, not through an explicit active-days set.
4. Stats can count wind-down time as scheduled hours even when sleep and meals are excluded.
5. Same-day time arithmetic can be fragile for sleep/wind-down windows that cross midnight.

Impact:

The planner can appear smart but still produce duplicates, over-dense days, inconsistent totals, or plans that differ based on the apply path.

Recommendation:

Add explicit planner invariants:

1. No overlap with non-cancelled existing blocks unless replace scope says so.
2. No overlap with commitments plus configured buffer.
3. No goal scheduled on more than its allowed active days.
4. No block outside user awake window unless the block is sleep or wind-down.
5. No duplicate generated bio blocks for the same date/type/time.
6. No more than one intense body goal per day.
7. No more than two body blocks per day, and only if the second is light recovery.
8. No deep work immediately adjacent to a long anchor without decompression time.
9. No overloaded day where total goal minutes, anchor minutes, and bio blocks leave no recovery window.
10. Stats must separately report goal minutes, anchor minutes, bio minutes, body minutes, deep-work minutes, and total visible calendar minutes.

### 9. AI Coach Apply Can Change The Selected Option At Apply Time

Observed in `src/app/api/coach/apply/route.ts`:

When `option_text` is present, the route asks the model to translate the selected option into precise operations.

Impact:

The applied result can differ from the option the user accepted. This makes consent, reproducibility, support debugging, and auditing weaker.

Recommendation:

The coach should generate canonical patches before showing options. Apply should validate and execute the selected patch, not regenerate it. If the patch is stale, return a stale-patch response and ask the coach to produce a fresh option.

### 10. API Boundary Validation Is Inconsistent

Observed examples:

1. `z.any()` on patch payloads.
2. `body as any` on important routes.
3. `// @ts-nocheck` in calendar patch preview and undo routes.
4. Loose date validation in plan-week.

Impact:

Invalid or unexpected payloads can enter core scheduling paths. This is a security and stability issue because calendar operations affect user data directly.

Recommendation:

Create shared Zod schemas for:

1. `CalendarBlockDraft`
2. `CalendarPatchOperation`
3. `CalendarPatch`
4. `CalendarGenerationRequest`
5. `CalendarApplyRequest`
6. `CalendarUndoRequest`

Every route should parse and reject invalid payloads before calling domain logic.

## Security And Multi-User Concerns

### User Isolation

Most schedule queries include `user_id`, which is good. The next hardening step is test coverage proving no route can affect another user's blocks through guessed IDs, stale patches, coach operations, undo tokens, or legacy version IDs.

Required tests:

1. User A cannot move, delete, update, or undo User B's block.
2. User A cannot apply a patch containing User B's block ID.
3. User A cannot restore a schedule version owned by User B.
4. Coach block ID resolution cannot resolve to another user's block.

### Stale Patch Protection

The plan/apply split needs optimistic concurrency. A plan generated from one calendar state should not apply silently after the user changes the calendar.

Recommendation:

Include a `calendar_state_hash` or `context_version` in every generated option. Apply should reject or re-preview when the current state differs.

### Idempotency

AI and calendar apply endpoints should accept idempotency keys. Retries should not duplicate blocks.

Recommendation:

Persist `idempotency_key`, `user_id`, `operation_type`, and final result for write endpoints:

1. onboarding initial schedule apply
2. plan week apply
3. generate today apply
4. coach apply
5. undo

### Audit Trail

Every schedule mutation should record:

1. user ID
2. source
3. policy mode
4. request ID
5. generation ID when relevant
6. affected date range
7. patch summary
8. inverse patch
9. validation warnings

This is essential for support, rollback, and security review.

## Proposed Stable Architecture

### Canonical Pipeline

All routes should use the same sequence:

1. Authenticate user.
2. Validate request schema.
3. Build calendar context for explicit date range and timezone.
4. Generate or receive block drafts.
5. Apply practical capacity rules for anchors, body goals, deep work, buffers, and recovery windows.
6. Normalize drafts to canonical patch operations.
7. Simulate final schedule state.
8. Validate hard invariants.
9. Return preview or apply transactionally.
10. Store patch run, inverse patch, source, policy, and generation metadata.
11. Return applied result and refresh token.

### Canonical Types

Introduce shared domain types:

1. `CalendarContextSnapshot`
2. `CalendarPlanRequest`
3. `CalendarBlockDraft`
4. `CalendarPatchOperation`
5. `CalendarPatch`
6. `CalendarInvariantReport`
7. `CalendarApplyResult`
8. `CalendarGenerationRecord`

These should live in one domain module and be consumed by routes, coach, planner, and UI adapters.

### Route Ownership

Recommended route direction:

1. `/api/calendar/plan-week`: preview only, returns canonical options.
2. `/api/calendar/generate-today`: preview only, returns canonical options.
3. `/api/calendar/apply`: canonical apply for schedule mutations.
4. `/api/calendar/undo`: canonical undo by undo token.
5. `/api/coach/apply`: validates selected coach patch and forwards to canonical apply.
6. `/api/onboarding/complete`: writes onboarding data and enqueues or performs canonical initial schedule generation.

Existing legacy routes can remain temporarily, but they should call the canonical service internally.

## Safe Migration Plan

### Phase 1: Guardrails Without Behavior Change

1. Add shared schemas around existing patch shapes.
2. Fix the duplicate constant declaration in `generate-today`.
3. Remove `// @ts-nocheck` from calendar patch preview and undo routes.
4. Add tests for `generateWeekPlan`, `buildCalendarContext`, `PatchService.applyPatch`, coach apply, and onboarding initial schedule.
5. Add multi-user isolation tests.
6. Add stale patch detection in preview/apply metadata.

### Phase 2: Canonical Adapter Layer

1. Build one canonical patch adapter.
2. Change `/api/calendar/apply-schedule` to call the main patch service instead of writing directly.
3. Change generate-today apply behavior to return patches only.
4. Change Plan Week UI to send the selected canonical patch, not reconstructed add blocks.
5. Preserve existing response fields so the frontend does not break.

### Phase 3: Transactional Apply And Undo

1. Move schedule apply and undo into an atomic database operation or RPC.
2. Store patch runs with exact date range and inverse patch.
3. Stop returning partial success for schedule mutations unless no state was committed.
4. Make undo all-or-nothing.

### Phase 4: Policy And Coach Hardening

1. Replace `source === 'coach'` bypasses with explicit policy modes.
2. Require coach options to include validated canonical patches before display.
3. Remove apply-time LLM operation regeneration.
4. Add stale coach option rejection and regeneration flow.

### Phase 5: Remove Legacy Drift

1. Deprecate `src/lib/calendar/patch-service.ts` or merge it into the canonical service.
2. Deprecate direct schedule mutation routes.
3. Make the API client use one schedule apply endpoint.
4. Keep old routes as compatibility wrappers until all callers are migrated.

## Required Test Plan

### Planner Unit Tests

1. Does not overlap sleep, meals, wind-down, commitments, or existing protected blocks.
2. Honors `days_per_week`, `minutes_per_day`, and weekly target minutes.
3. Honors recovery, balanced, and momentum caps.
4. Handles weekends correctly.
5. Handles users with many goals and many commitments.
6. Handles overnight sleep windows.
7. Handles empty goals and empty preferences gracefully.
8. Never schedules two intense body goals in one day.
9. Allows a second body block only when it is light recovery or low-intensity movement.
10. Preserves decompression buffers around long anchors.
11. Reduces goal load when anchors consume most of the day.

### Context Builder Tests

1. Preferences override profile defaults consistently.
2. Missing optional fields return warnings, not silent surprises.
3. Required query failures block generation.
4. Timezone and target week are applied consistently.
5. Large users do not lose goals or commitments due to hard query limits.

### API Contract Tests

1. `/api/calendar/plan-week`
2. `/api/calendar/generate-today`
3. `/api/calendar/optimize-day`
4. `/api/calendar/apply-schedule`
5. `/api/patch/apply`
6. `/api/patch/undo`
7. `/api/coach/apply`
8. `/api/onboarding/complete`

Each route should reject invalid dates, invalid IDs, cross-user IDs, stale patch versions, and malformed operations.

### Integration Tests

1. New user completes onboarding and receives a valid initial calendar.
2. Plan Week preview applies exactly what was previewed.
3. Empty-day generation does not delete protected blocks.
4. Coach suggestion applies through the same invariant checks as calendar UI actions.
5. Undo restores exactly the previous schedule state.
6. Concurrent apply attempts do not create duplicate or overlapping blocks.

## Product-Side Stability Requirements

Before scaling the calendar system to many users, the app needs these user-visible guarantees:

1. A user can trust that AI preview equals applied result.
2. AI never silently deletes protected or completed calendar items.
3. Undo works reliably for every AI-generated schedule change.
4. If schedule generation fails, onboarding can resume without data loss.
5. Coach suggestions cannot break sleep, anchors, meals, or hard scheduling rules.
6. The planner does not schedule physically unrealistic body-goal combinations.
7. The planner reduces load when anchors make the day constrained.
8. Calendar refresh is immediate and consistent after mutations.
9. Errors explain what happened and what the user can safely do next.

## Recommended Priority Order

1. Canonicalize apply/undo.
2. Fix onboarding partial-state handling.
3. Remove coach bypasses.
4. Make generate-today preview-only and non-destructive.
5. Add practical planner rules for anchors, body-goal exhaustion, buffers, and recovery windows.
6. Add stale patch and idempotency protection.
7. Strengthen context builder correctness.
8. Add planner invariant tests.
9. Migrate frontend apply paths to send canonical patches.
10. Add observability and audit trail.
11. Remove legacy calendar mutation paths.

## Final Recommendation

Do not build new calendar features yet. The planner logic is promising, and the user experience can become excellent, but the engineering needs one authoritative mutation pipeline before the system is pushed to many users. The most valuable next build is not a new scheduling feature; it is a stable calendar core that every feature uses.
