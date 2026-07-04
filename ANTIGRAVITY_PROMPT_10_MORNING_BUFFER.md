# FIX PROMPT: Morning Routine Buffer — failing to save, ignored by calendar generation, missing from onboarding

The Morning Routine Buffer setting is broken end-to-end. The root cause is already known — read this diagnosis before touching anything.

## Diagnosis (verified against the code)

1. **The DB migration was never applied to production.** `supabase/migrations/20260616000000_add_morning_routine.sql` exists in the repo (adds `profiles.morning_routine_mins` and `profile_preferences.morning_routine_min`), but the live database doesn't have the columns. The code is full of defensive workarounds proving this: `src/app/api/settings/update/route.ts` saves `morning_routine_min` "separately so a missing column never fails the main update", and `src/lib/calendar/context-builder.ts` (~line 260) fetches it in a try/catch "so a missing column never kills the main prefs query". Result: the value is silently dropped and generation always reads `0`.
2. **"Failed to save settings" toast:** in `src/app/api/settings/update/route.ts`, `morning_routine_min` is destructured out of the patch. When the user changes ONLY the morning buffer, the remaining `mainPatch` is `{}` and `supabase.from('profile_preferences').update({})` errors → 500 → toast. That's the exact reported symptom.
3. **Generation is half-wired:** `generate-today/route.ts` (~lines 32–40) already computes `effectiveWakeTime = wake + morningRoutineBufferMins`, and `plan-week.ts` (~line 186) has a `morning_routine` block type — but no protected block is created the way Wind Down gets one, and the value is always 0 anyway (see #1).
4. **Onboarding:** `components/onboarding/step-2-time.tsx` has sleep, wake, and wind-down controls but no morning buffer UI. The backend `api/onboarding/complete/route.ts` ALREADY accepts and persists `morning_routine_mins` (lines ~10–11, 75–76, 126–127) — only the UI input is missing.

## Scope guard

Minimal-diff functional fix. Only these files may change: `src/app/api/settings/update/route.ts`, `src/app/api/calendar/generate-today/route.ts`, `src/lib/calendar/ai/plan-week.ts`, `src/lib/calendar/ai/optimize-day.ts` (only if needed for §3), `src/components/onboarding/step-2-time.tsx`, `src/app/onboarding/page.tsx` (only state/payload wiring). No refactors, no schema changes beyond the existing migration file, no changes to auth, stores, or other API routes. Keep all existing defensive fallbacks (they make deploys order-independent). `npm run build` must pass.

## Fix 1 — Apply the migration (root cause; do this first)

Run the existing migration against the production database: `npx supabase db push` (or `npx supabase migration up` if linked). If the Supabase CLI is not authenticated in this environment, STOP and output this SQL prominently in your report for the human to paste into the Supabase SQL editor — and clearly state that fixes 2–4 ship code that works fully only after this runs:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS morning_routine_mins INTEGER DEFAULT 0;
ALTER TABLE profile_preferences ADD COLUMN IF NOT EXISTS morning_routine_min INTEGER DEFAULT 0;
```

## Fix 2 — Settings save (`src/app/api/settings/update/route.ts`)

1. Guard the empty-patch case: only call the main `update(mainPatch)` when `Object.keys(mainPatch).length > 0`; when it's empty, fetch the current row for the response instead of updating. This kills the "Failed to save settings" error when only the buffer changed.
2. Add `'morning_routine_min'` and `'wind_down_min'` to `SCHEDULE_AFFECTING_FIELDS` (top of file) so changing either flags the schedule for regeneration, same as sleep/wake changes.

## Fix 3 — Calendar generation parity with Wind Down

In `generate-today/route.ts`: Wind Down gets a protected block computed from `sleep_start − wind_down_mins`. Mirror that exactly for the morning: when `morningRoutineBufferMins > 0`, create a **"Morning Routine"** block from `wakeTime` to `effectiveWakeTime` with the same properties as the Wind Down block (same `block_type`/protected/anchor semantics — copy whatever the Wind Down block object uses). The existing `effectiveWakeTime` logic already prevents anything else being scheduled in that window — keep it. Then verify (and only patch if violated) that `plan-week.ts` and `optimize-day.ts` also (a) never place blocks between wake and effective wake, and (b) surface the same Morning Routine block; plan-week already emits a `morning_routine` type block at ~line 186–195.

The user-visible contract: the morning buffer behaves exactly like wind-down, but anchored to wake-up time — a protected block, first thing in the day, nothing schedulable inside it.

## Fix 4 — Onboarding UI (`components/onboarding/step-2-time.tsx`)

On the same step where the user sets sleep/wake times and wind-down, add a **Morning Buffer** control directly next to the Wind Down control, using the identical slider pattern (~lines 61–73: label + range input + minute readout). Label: "Morning Buffer" with a one-line hint like "Ease into your day". Wire it to `data.morning_routine_mins` (default 0, range 0–120, step 5) via the same `updateData` flow. Pass it through the onboarding page's submit payload — `api/onboarding/complete` already accepts `morning_routine_mins`, so no backend change. If `DayFrameVisualizer` (same file) renders the wind-down segment, add the symmetric morning segment after wake so users see the buffer in the day frame.

## Verification (required)

1. `npm run build` + `npm run lint` pass.
2. Settings: change ONLY Morning Routine Buffer → Save → "Settings saved" toast, no error; reload the page and the value persists (requires Fix 1 applied; otherwise state this is pending the SQL).
3. Trigger calendar generation (Plan My Day / generate-today) with buffer = e.g. 45: the schedule shows a protected "Morning Routine" block from wake to wake+45 and the first schedulable block starts no earlier than wake+45. Set buffer to 0: no morning block appears (no regression).
4. Wind Down behavior unchanged.
5. Onboarding step 2: Morning Buffer slider renders next to Wind Down, works on desktop AND at 393×852 (fits above the fold, matches existing styling), and completing onboarding persists the chosen value.
6. Confirm zero diffs outside the six allowed files + report the exact diff list.
