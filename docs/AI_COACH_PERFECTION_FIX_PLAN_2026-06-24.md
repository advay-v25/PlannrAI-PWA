# AI Coach Perfection Fix Plan

Date: 2026-06-24

Scope:
- Coach Hub generation and execution
- Three-option calendar changes
- Calendar-safe apply and undo
- Localhost `3000` observation
- `FEATURES.md` contract and code-review-graph flows

Excluded for now:
- Weekly Review
- Habit Stacks

## Product Contract

From `FEATURES.md`, Donna should behave like a lived-in intelligence layer:

- Understand schedule, goals, energy, recent history, timezone, and sleep-cycle logic.
- Auto-execute only genuinely simple mutations.
- Propose distinct choices for complex calendar changes.
- Prevent impossible schedules before the user sees or applies them.
- Use validation/retry when generated patches collide with real calendar constraints.

The target experience should be:

1. User asks for a calendar change.
2. Coach identifies the relevant block/task/goal from the real user calendar.
3. Coach returns exactly three practical options when the request involves rescheduling, moving, adding, or changing calendar work.
4. Each option is based on verified free time or a safe lower-priority trade-off.
5. User reviews the option.
6. Apply mutates the calendar transactionally.
7. Calendar, Home, Coach, and stores refresh consistently.
8. Undo restores the previous state.

## Localhost Observation

Atlas still showed only the dark background layer at `http://localhost:3000`, and shell requests to both `/` and `/app/coach` could not connect, while a Node process was still listening on port `3000`.

This means I could not trust the localhost visual result during this pass. The Coach audit below is based on the code graph, `FEATURES.md`, and targeted code inspection.

Before final QA, restart the local server cleanly and confirm:

- `curl http://localhost:3000` responds.
- `/app/coach` loads the authenticated Coach Hub.
- Browser is not showing a stale cached page.

## Current Architecture

Graph-critical flows:

- `CoachPage` -> `CoachDashboard` -> `CoachChat`
- `CoachChat.executeApply` -> `/api/coach/apply`
- `/api/coach/message` -> `generateCoachResponse`
- `generateCoachResponse` -> `generateAIScheduleResponse`
- `generateAIScheduleResponse` -> deterministic reschedule path or LLM path
- `/api/coach/apply` -> `normalizePatchForService` -> `validateCoachOps` -> `PatchService.applyPatch`
- `PatchService.applyPatch` -> `simulateAndValidatePatch` -> DB writes -> undo token

Relevant files:

- `/Users/advay/plannrai-web/src/app/api/coach/message/route.ts`
- `/Users/advay/plannrai-web/src/app/api/coach/apply/route.ts`
- `/Users/advay/plannrai-web/src/app/api/coach/quick-action/route.ts`
- `/Users/advay/plannrai-web/src/lib/coach/response-generator.ts`
- `/Users/advay/plannrai-web/src/lib/coach/context-builder.ts`
- `/Users/advay/plannrai-web/src/lib/coach/intent-classifier.ts`
- `/Users/advay/plannrai-web/src/lib/services/patch-service.ts`
- `/Users/advay/plannrai-web/src/hooks/use-coach.ts`
- `/Users/advay/plannrai-web/src/components/coach/CoachChat.tsx`

## Highest Priority Fixes

### 1. Pass client-local time into the full Coach context

Problem:

`/api/coach/message` computes client-local `today` and `currentTime` for the light context, then calls:

`buildCoachContext(user.id, supabase)`

without passing the client timestamp or timezone. It later patches `exact_iso_timestamp` and `exact_timezone`, but the core fields used by option generation, `current.date` and `current.time`, were already computed.

Risk:

- Options can be generated against server time or profile timezone fallback instead of the browser's real time.
- “Later today,” “past time,” and “missed block” logic can become wrong.
- Late-night behavioral-day logic can drift.

Fix:

Call:

`buildCoachContext(user.id, supabase, clientDate, timezone)`

and remove the partial metadata-only patch.

Acceptance criteria:

- The same request at 23:30 local time never proposes an option in the past.
- “Today,” “tomorrow,” and late-night active wake-cycle behavior match the browser.

### 2. Inject commitments/anchors into week-wide Coach scheduling context

Problem:

`buildCoachContext` fetches active commitments and marks today/tomorrow blocks as locked only when matching schedule blocks exist. It does not inject commitments as occupied virtual blocks across `schedule.this_week`.

`response-generator.ts` uses `schedule.this_week` to find free slots, so deterministic options can treat recurring commitments as free time. `PatchService` later injects commitments during validation and may reject the apply.

Risk:

- Coach shows options that look valid but fail on apply.
- User loses trust because “Apply” rejects a visible option.

Fix:

Create one shared function that expands commitments into virtual anchor blocks for every relevant date, then use it in:

- Coach context builder
- Quick action route
- Patch simulation
- Any calendar preview route

Acceptance criteria:

- Free-slot generation excludes all active commitments for today and the rest of the week.
- An option shown to the user should not later fail because of a commitment overlap.

### 3. Remove unsafe replacement fallback from deterministic rescheduling

Problem:

`findReplaceableBlock` has a final “absolute failsafe” that can choose any pillar, any goal/title, any priority.

Risk:

- Option 3 can replace a same-goal block.
- Option 3 can replace equal or higher priority work.
- This violates the practical rule: replace only a lower-priority block when it is genuinely safe.

Fix:

Option 3 must only pick a block when all are true:

- Not immutable: no sleep, meal, wind-down, anchor, buffer, routine.
- Not the same goal.
- Not same title/context.
- Lower priority than the missed block when priority is known.
- Same pillar preferred; cross-pillar only if product explicitly allows it.
- Future or later-today only.
- Does not create a second body block on that day.

If no block qualifies, return disabled option 3: “No safe block to replace.”

Acceptance criteria:

- The engine never deletes same-goal work to make room for itself.
- The engine never replaces higher-priority work.
- Option 3 is disabled instead of unsafe when no lower-priority block exists.

### 4. Enforce one-body-block-per-day at apply time

Problem:

The prompt and some quick-action logic know “one body block per day,” but `/api/coach/apply` and `PatchService.simulateAndValidatePatch` do not fully enforce it as a hard invariant.

Risk:

- LLM output or malformed client payload can schedule two body goal blocks in one day.
- Deterministic reschedule can move a body missed block to a day that already has body work unless every path checks it.

Fix:

Add a final simulated-state validation:

- Join affected blocks to goals.
- Count planned body goal blocks per date after the patch.
- Reject if any date has more than one body goal block, unless one is deleted in the same patch and not replaced by another body block.

Acceptance criteria:

- Apply returns a clear validation error for two body blocks in one day.
- Tests cover moving body to today, moving body to a future body day, and replacing non-body with body.

### 5. Convert deterministic rescheduling to explicit `enabled` options

Problem:

When no slot exists, `buildCoachOption` returns options with empty `ledger.ops`. The UI can still show them similarly to actionable cards.

Risk:

- User clicks an option that cannot apply.
- Empty operation options are treated as failed apply rather than as a clear “not available” choice.

Fix:

Extend `ProposedOption` with:

- `enabled: boolean`
- `unavailable_reason?: string`
- `changes_preview: Array<{ label, detail, risk? }>`

Disabled options should still appear to preserve the three-option mental model, but must not show “Apply Changes.”

Acceptance criteria:

- Three cards always render for reschedule flows.
- Cards with no valid operations are disabled and explain why.
- Only enabled options call `/api/coach/apply`.

### 6. Make deterministic generation the default for calendar options

Problem:

Only `MOVE_BLOCK` gets the deterministic reschedule intercept. Other modification intents still depend heavily on the LLM:

- Add task/block
- Delete block
- Busy at time
- Energy low
- Overwhelmed
- Minimal OS
- Replan day/week
- Adjust goal
- Pause goal

Since AI keys are locked for preview/production, many of these fall into clarification or generic fallback.

Fix:

Create a deterministic Coach planner layer:

`intent -> candidate options -> validation -> display options`

Start with these deterministic planners:

- `planMoveBlockOptions`
- `planAddBlockOptions`
- `planBusyAtTimeOptions`
- `planReduceLoadOptions`
- `planFixTodayOptions`
- `planDeleteBlockOptions`
- `planGoalAdjustmentOptions`

The LLM should be used for wording, explanation, and edge interpretation, not as the sole planner.

Acceptance criteria:

- With AI disabled, Coach still handles the core calendar changes.
- AI enhances the experience but does not determine safety.

### 7. Expand the non-AI intent classifier

Problem:

`quickIntentMatch` catches only a small set. If AI classification is unavailable, most useful prompts become `CLARIFICATION_NEEDED`.

Fix:

Add deterministic patterns for:

- Add task/block: “add,” “schedule,” “put,” “remind me,” “I need to”
- Delete/cancel block
- Replan today/week
- Reduce load / overwhelmed
- Goal adjustment
- Pause goal
- Busy/unavailable interval
- Body-related move
- Time expressions with `today`, `tomorrow`, weekday, AM/PM, duration

Acceptance criteria:

- The top 30 common user prompts classify without AI.
- Classifier tests cover every CoachIntent used by the planner.

### 8. Unify option apply paths

Problem:

Normal chat options apply through `useCoach.applyOption`; quick-action synthetic options apply directly inside `CoachChat.executeApply`.

Risk:

- Different success criteria.
- Different refresh behavior.
- Different animation behavior.
- Different error display.
- Future fixes land in one path but not the other.

Fix:

Create one client function:

`applyCoachOption(option, context)`

It should:

- Normalize patch payload.
- Call `/api/coach/apply`.
- Handle success, partial success, and validation errors.
- Dispatch calendar refresh.
- Increment sync graph version.
- Set undo token.
- Animate changed blocks.

Acceptance criteria:

- Chat options and quick actions apply through the same code.
- Undo works after both.
- Calendar refresh is identical after both.

### 9. Move `/api/coach/apply` fully onto the secure API wrapper

Problem:

`/api/coach/apply` still has custom auth/rate limiting. It should use the same mutation wrapper standard as the rest of the app.

Fix:

Wrap it with `secureApiRoute`, preserving:

- Auth
- CSRF
- Origin checks
- Rate limiting
- Zod body validation
- Unified success/error response shape

Acceptance criteria:

- Invalid CSRF is rejected.
- Frontend applies still work.
- Errors are consistent with other secure mutations.

### 10. Make patch validation source-independent

Problem:

`PatchService` skips some validation for `source === 'coach'` and allows Coach to modify/delete immutable blocks more freely.

Risk:

- A bad Coach payload has elevated authority.
- Prompt says “you have power,” but product trust requires explicit user consent.

Fix:

Split permissions:

- `source: coach_proposal`
- `source: coach_confirmed`
- `allow_immutable_mutation: true` only when the user explicitly selected an option that clearly declares the tradeoff.

Acceptance criteria:

- Coach cannot silently move/delete anchors, meals, sleep, or wind-down.
- Immutable changes require explicit visible tradeoff metadata.

## UX Fixes For Coach Hub

### Option cards

Each option should show:

- Title: “Move Gym to Thursday 25/06 at 18:00”
- Why this option exists
- Exact changes
- What gets protected
- What gets sacrificed
- Risk level
- Apply disabled state if unavailable

Avoid making users open raw review text to understand whether a block is being moved, shortened, deleted, or replaced.

### Empty state quick actions

Current quick actions:

- Reduce today's load
- Fix today's schedule

Recommended behavior:

- Keep two or three context-aware quick actions.
- If missed blocks exist: “Fix missed blocks”
- If body already exists today: do not offer another body-heavy option.
- If no calendar data exists: show non-mutating examples.
- If schedule is healthy: offer “What should I protect today?” instead of mutation-first actions.

### Error states

Replace generic “Failed to apply changes” with:

- “That option is no longer safe because your calendar changed. Generate fresh options.”
- “This would overlap your Work anchor.”
- “This would create two body blocks on Thursday.”
- “No lower-priority block is available to replace.”

## Test Plan

The graph found no tests for:

- `response-generator.ts`
- `/api/coach/apply`

Add tests before trusting Coach for many users.

### Unit tests

1. Deterministic reschedule returns three display options.
2. Today option uses only verified free slots.
3. Week option avoids commitments.
4. Replace option only replaces lower-priority different-goal work.
5. Same-goal replacement is disabled.
6. Higher-priority replacement is disabled.
7. Body block cannot move to a day with another body block.
8. No slots returns three disabled/explanatory options, not fake applyable patches.
9. Intent classifier works with AI disabled.
10. Client-local timezone is preserved through full context.

### API tests

1. `/api/coach/message` returns safe options for a seeded calendar.
2. `/api/coach/apply` rejects anchor overlap.
3. `/api/coach/apply` rejects meal overlap.
4. `/api/coach/apply` rejects two body blocks in one day.
5. `/api/coach/apply` rejects same-goal swap.
6. `/api/coach/apply` rejects higher-priority replacement.
7. Apply success returns undo token.
8. Undo restores the previous calendar state.

### E2E tests

1. Open Coach Hub.
2. Ask to reschedule a missed block.
3. Confirm three cards appear.
4. Apply option 1.
5. Calendar updates.
6. Undo restores original calendar.
7. Regenerate after calendar changed.
8. Disabled option cannot be applied.

## Recommended Build Order

1. Fix client-local full context.
2. Add virtual commitment expansion to Coach context.
3. Remove unsafe replacement fallback.
4. Add body-day and priority validation in apply/simulation.
5. Add `enabled` and `unavailable_reason` to options and UI.
6. Unify frontend apply path.
7. Expand deterministic intent classifier.
8. Build deterministic planners for non-move intents.
9. Migrate `/api/coach/apply` to `secureApiRoute`.
10. Add unit, API, and E2E regression tests.

## Product Questions

1. Should Option 3 be allowed to replace a block from a different pillar, or must it stay within the same pillar?
2. When no safe lower-priority replacement exists, should Coach show a disabled third option or switch to a manual-only card?
3. Should quick actions continue to produce one strong recommendation, or should they also return three options for consistency?
4. Can Coach ever move/delete anchors, meals, wind-down, or sleep if the user explicitly chooses an aggressive option, or should those be completely locked?
5. For low-energy mode, should Coach reduce to two options as `FEATURES.md` says, or should calendar-change requests always preserve the three-option model?

## Definition Of Perfect Enough For Launch

Coach is ready when:

- The most common calendar changes work without AI keys.
- AI never directly writes unvalidated operations.
- Every visible option has already passed deterministic validation.
- Apply and undo are transactional.
- Calendar/Home/Coach refresh after changes.
- Practical constraints are hard rules, not prompt suggestions.
- Tests prove anchors, body-goal exhaustion, same-goal replacement, priority replacement, commitments, and timezone behavior.
