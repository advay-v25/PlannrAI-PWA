# Antigravity Prompt 3 — Morning Routine Feature + Wind Down Bug Fix

## Overview

Two tasks in this prompt:

**Part A — Bug Fix**: Wind down time is not being enforced correctly. Users with sleep_start = "00:00" (midnight) have no wind down block generated at all, meaning the scheduler freely places goal blocks up to midnight. Additionally, the day scheduling cap (`dayWindDown`) is hardcoded to 1440 (24:00) instead of using the actual wind down start time, so even non-midnight users can have blocks bleed into their wind down window.

**Part B — New Feature**: Add a `morning_routine_mins` setting — a buffer after wake time (15/30/45/60 min) that blocks scheduling for the user's morning routine (shower, breakfast, getting ready). Like wind down, it is a pure scheduling constraint — it does NOT create a visible calendar block. It must appear in the onboarding UI alongside wind down time, and in settings.

Make ONLY the targeted changes described. Do not refactor unrelated code.

---

## PART A: Wind Down Bug Fixes

### Fix A1 — `src/lib/calendar/ai/plan-week.ts`

#### A1a: Fix wind down bio template for midnight-sleep users

**Find this exact block** (around line 93):

```typescript
    if (timeToMinutes(sleepStart) < timeToMinutes(sleepEnd)) {
        // Sleep happens entirely within the same calendar day (e.g., 01:00 to 08:00 or 00:00 to 08:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: sleepEnd });
        if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        }
    }
```

**Replace with:**

```typescript
    if (timeToMinutes(sleepStart) < timeToMinutes(sleepEnd)) {
        // Sleep happens entirely within the same calendar day (e.g., 01:00 to 08:00 or 00:00 to 08:00)
        bioTemplates.push({ title: 'Sleep', block_type: 'sleep', start: sleepStart, end: sleepEnd });
        if (sleepStart === '00:00') {
            // Sleep starts at midnight — wind down occupies the tail end of the active calendar day
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: '23:59' });
        } else if (timeToMinutes(windDown) < timeToMinutes(sleepStart)) {
            bioTemplates.push({ title: 'Wind Down', block_type: 'wind_down', start: windDown, end: sleepStart });
        }
    }
```

#### A1b: Fix the day scheduling cap to use windDownMins instead of hardcoded 1440

**Find this exact line** inside the `generateVariant` function (around line 262):

```typescript
    const dayWindDown = (isWeekend && weekendIntensity === 'light') ? LIGHT_WEEKEND_CUTOFF : 1440;
```

**Replace with:**

```typescript
    const dayWindDown = (isWeekend && weekendIntensity === 'light')
        ? Math.min(LIGHT_WEEKEND_CUTOFF, windDownMins)
        : windDownMins;
```

---

### Fix A2 — `src/app/api/calendar/generate-today/route.ts`

#### Fix windDownStart calculation — negative for midnight-sleep users

**Find this exact block** (around line 34):

```typescript
            const windDownStart = sleepMins - windDownMins;
            const windDownTime = `${Math.floor(windDownStart / 60).toString().padStart(2, '0')}:${(windDownStart % 60).toString().padStart(2, '0')}`;
```

**Replace with:**

```typescript
            const windDownStart = ((sleepMins - windDownMins) + 1440) % 1440;
            const windDownTime = `${Math.floor(windDownStart / 60).toString().padStart(2, '0')}:${(windDownStart % 60).toString().padStart(2, '0')}`;
```

---

### Fix A3 — `src/lib/scheduling/week-service.ts`

#### Fix wind-down block generation for midnight-sleep users

**Find this exact block** (around line 392 — the "6. Wind-down Block" section):

```typescript
    // 6. Wind-down Block (before sleep)
    periodMap.forEach(day => {
        const sleepMins = toMins(sleepTime);
        const wdStart = sleepMins - windDownMins;
        if (wdStart > 0 && isFree(dayState[day].occupied, wdStart, sleepMins)) {
            schedule[day].push({
                time: toTime(wdStart),
                end_time: sleepTime,
                title: 'Wind Down',
                goal_id: 'WIND_DOWN',
                type: 'wind_down'
            });
            dayState[day].occupied.push({ start: wdStart, end: sleepMins });
        }
    });
```

**Replace with:**

```typescript
    // 6. Wind-down Block (before sleep)
    periodMap.forEach(day => {
        const sleepMins = toMins(sleepTime);
        const rawWdStart = sleepMins - windDownMins;
        // Handle midnight sleep (sleepTime = '00:00' → sleepMins = 0): wind down wraps to end of previous day
        const wdStart = rawWdStart >= 0 ? rawWdStart : rawWdStart + 1440;
        const wdEnd = sleepMins === 0 ? 1439 : sleepMins;
        const wdEndStr = sleepMins === 0 ? '23:59' : sleepTime;
        if (wdStart > 0 && wdStart < wdEnd && isFree(dayState[day].occupied, wdStart, wdEnd)) {
            schedule[day].push({
                time: toTime(wdStart),
                end_time: wdEndStr,
                title: 'Wind Down',
                goal_id: 'WIND_DOWN',
                type: 'wind_down'
            });
            dayState[day].occupied.push({ start: wdStart, end: wdEnd });
        }
    });
```

---

### Fix A4 — `src/lib/calendar/context-builder.ts`

#### Fix wind_down_mins to read from profile_preferences (which is what onboarding writes to)

**Find this exact line** (around line 260):

```typescript
        wind_down_mins: profileRaw.wind_down_mins || profileRaw.wind_down_minutes || 30,
```

**Replace with:**

```typescript
        wind_down_mins: prefs.wind_down_min || profileRaw.wind_down_mins || profileRaw.wind_down_minutes || 30,
```

---

## PART B: Morning Routine Feature

Morning routine is a user-configurable buffer (15/30/45/60 min) after wake time. During this window, the scheduler must not place any goal blocks. It does NOT create a visible calendar block — it is a pure scheduling constraint. The user sets it in onboarding and settings.

---

### B1 — Database migration

Create a new file at `supabase/migrations/[timestamp]_add_morning_routine.sql` with the following content:

```sql
-- Add morning routine buffer to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS morning_routine_mins INTEGER DEFAULT 0;

-- Add morning routine buffer to profile_preferences table  
ALTER TABLE profile_preferences ADD COLUMN IF NOT EXISTS morning_routine_min INTEGER DEFAULT 0;
```

---

### B2 — `src/types/database.ts`

Add `morning_routine_mins` to the `profiles` table types. Find the `profiles` Row block (it has `wind_down_mins: number | null`) and add the field alongside it in Row, Insert, and Update:

```typescript
// In profiles Row:
morning_routine_mins: number | null
// (add next to wind_down_mins)

// In profiles Insert:
morning_routine_mins?: number | null

// In profiles Update:
morning_routine_mins?: number | null
```

Add `morning_routine_min` to the `profile_preferences` table types. Find the `profile_preferences` Row block (it has `wind_down_min: number`) and add the field in Row, Insert, and Update:

```typescript
// In profile_preferences Row:
morning_routine_min: number
// (add next to wind_down_min)

// In profile_preferences Insert:
morning_routine_min?: number

// In profile_preferences Update:
morning_routine_min?: number
```

---

### B3 — `src/lib/types/settings.ts`

**Find this line** (inside `ProfilePreferences` interface):

```typescript
    wind_down_min: number;
```

**Replace with:**

```typescript
    wind_down_min: number;
    morning_routine_min: number;
```

**Find this line** (inside `DEFAULT_PREFERENCES`):

```typescript
    wind_down_min: 30,
```

**Replace with:**

```typescript
    wind_down_min: 30,
    morning_routine_min: 0,
```

---

### B4 — `src/stores/index.ts`

**Find this line** (inside `OnboardingData` interface):

```typescript
    wind_down_mins: number;
```

**Replace with:**

```typescript
    wind_down_mins: number;
    morning_routine_mins: number;
```

**Find this line** (inside `defaultOnboardingData`):

```typescript
    wind_down_mins: 30,
```

**Replace with:**

```typescript
    wind_down_mins: 30,
    morning_routine_mins: 0,
```

---

### B5 — `src/lib/calendar/context-builder.ts`

#### B5a: Add morning_routine_mins to the CalendarContext user type

**Find this line** (inside the `CalendarContext` user interface):

```typescript
        wind_down_mins: number;
```

**Replace with:**

```typescript
        wind_down_mins: number;
        morning_routine_mins: number;
```

#### B5b: Add morning_routine_mins to the profile_preferences select query

**Find this line** (around line 172):

```typescript
            .select('wake_time, sleep_start, meal_windows, meals_per_day, buffer_min, preferred_windows, workout_preference, workout_min_per_day, wind_down_min, is_workout_protected, weekend_intensity')
```

**Replace with:**

```typescript
            .select('wake_time, sleep_start, meal_windows, meals_per_day, buffer_min, preferred_windows, workout_preference, workout_min_per_day, wind_down_min, morning_routine_min, is_workout_protected, weekend_intensity')
```

#### B5c: Add morning_routine_mins to the merged profile object

**Find this line** (inside the profile merge block, around line 260):

```typescript
        wind_down_mins: prefs.wind_down_min || profileRaw.wind_down_mins || profileRaw.wind_down_minutes || 30,
```

**Replace with:**

```typescript
        wind_down_mins: prefs.wind_down_min || profileRaw.wind_down_mins || profileRaw.wind_down_minutes || 30,
        morning_routine_mins: prefs.morning_routine_min || (profileRaw as any).morning_routine_mins || 0,
```

---

### B6 — `src/components/onboarding/steps/step-2-rhythm.tsx`

Add a morning routine picker directly inside the SLEEP & WAKE section card, immediately after the wind-down time picker. The wind-down picker ends just before the closing `</div>` of the SLEEP & WAKE card (before the MEALS section).

**Find this exact block** (the wind-down section at the bottom of the SLEEP & WAKE card):

```typescript
                    <div className="space-y-3 pt-2">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Wind-down time before sleep</label>
                        <div className="flex gap-2.5">
                            {[15, 30, 45, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ wind_down_mins: mins })}
                                    className={`py-3.5 rounded-2xl text-xs font-bold font-mono transition-all duration-300 flex-1 border ${
                                        data.wind_down_mins === mins 
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent' 
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins} MIN
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
```

**Replace with:**

```typescript
                    <div className="space-y-3 pt-2">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Wind-down time before sleep</label>
                        <div className="flex gap-2.5">
                            {[15, 30, 45, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ wind_down_mins: mins })}
                                    className={`py-3.5 rounded-2xl text-xs font-bold font-mono transition-all duration-300 flex-1 border ${
                                        data.wind_down_mins === mins 
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent' 
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins} MIN
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className="text-[10px] font-bold tracking-widest text-[var(--text-primary)]/50 uppercase ml-1">Morning routine buffer (after wake up)</label>
                        <p className="text-[10px] text-[var(--text-primary)]/40 ml-1 -mt-1">Shower, breakfast, getting ready — no blocks scheduled during this window</p>
                        <div className="flex gap-2.5">
                            {[0, 15, 30, 45, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => updateData({ morning_routine_mins: mins })}
                                    className={`py-3.5 rounded-2xl text-xs font-bold font-mono transition-all duration-300 flex-1 border ${
                                        data.morning_routine_mins === mins 
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-[1.03] border-transparent' 
                                            : 'bg-[var(--glass-bg-active)] text-[var(--text-primary)]/50 border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:scale-[1.02]'
                                    }`}
                                >
                                    {mins === 0 ? 'NONE' : `${mins} MIN`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
```

---

### B7 — `src/app/api/onboarding/complete/route.ts`

#### B7a: Extract morning_routine_mins from the request body

**Find this line:**

```typescript
            sleep_start, sleep_end, wind_down_mins,
```

**Replace with:**

```typescript
            sleep_start, sleep_end, wind_down_mins, morning_routine_mins,
```

#### B7b: Save morning_routine_mins to the profiles table

**Find this block** inside the `supabase.from('profiles').upsert(...)` call:

```typescript
                wind_down_mins,
```

**Replace with:**

```typescript
                wind_down_mins,
                morning_routine_mins: morning_routine_mins || 0,
```

#### B7c: Save morning_routine_min to profile_preferences

**Find this block** inside the `supabase.from('profile_preferences').upsert(...)` call:

```typescript
                wind_down_min: wind_down_mins,
```

**Replace with:**

```typescript
                wind_down_min: wind_down_mins,
                morning_routine_min: morning_routine_mins || 0,
```

---

### B8 — `src/app/api/settings/update/route.ts`

**Find this line** (inside the Zod schema):

```typescript
    wind_down_min: z.number().min(0).max(180).optional(),
```

**Replace with:**

```typescript
    wind_down_min: z.number().min(0).max(180).optional(),
    morning_routine_min: z.number().min(0).max(120).optional(),
```

---

### B9 — `src/app/app/settings/_components/core-constraints.tsx`

Add a morning routine picker directly after the wind down picker. Find the wind down Select block:

```typescript
                    <div className="space-y-2">
                        <Label>Wind Down (Minutes)</Label>
                        <Select
                            value={String(preferences.wind_down_min)}
                            onValueChange={(v: string) => onChange({ wind_down_min: parseInt(v) })}
                        >
```

After the closing `</div>` of that wind down section, insert:

```typescript
                    <div className="space-y-2">
                        <Label>Morning Routine Buffer (Minutes)</Label>
                        <Select
                            value={String(preferences.morning_routine_min ?? 0)}
                            onValueChange={(v: string) => onChange({ morning_routine_min: parseInt(v) })}
                        >
                            <SelectTrigger className="bg-transparent">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">None</SelectItem>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="45">45 min</SelectItem>
                                <SelectItem value="60">60 min</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
```

---

### B10 — `src/lib/calendar/ai/plan-week.ts` — Enforce morning routine as scheduling constraint

Add morning routine as a pure exclusion zone (no visible calendar block) in `generateWeekPlan`, right after the section that loads bio blocks into exclusion zones (`commitmentsByDay`). This is the block that starts with `// Load bio blocks into exclusion zones` (around line 170).

**Find this exact block:**

```typescript
    // Load bio blocks into exclusion zones
    for (let d = 1; d <= 7; d++) {
        for (const bio of bioTemplates) {
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(bio.start),
                end: timeToMinutes(bio.end) + (bio.block_type === 'meal' ? 15 : 0), // 15m after meals
                title: bio.title,
                type: bio.block_type
            });
        }
    }
```

**Replace with:**

```typescript
    // Load bio blocks into exclusion zones
    for (let d = 1; d <= 7; d++) {
        for (const bio of bioTemplates) {
            commitmentsByDay.get(d)!.push({
                start: timeToMinutes(bio.start),
                end: timeToMinutes(bio.end) + (bio.block_type === 'meal' ? 15 : 0), // 15m after meals
                title: bio.title,
                type: bio.block_type
            });
        }
    }

    // Morning routine: invisible scheduling constraint — no calendar block, just blocks the time after wake
    const morningRoutineMins = (context.user as any).morning_routine_mins || 0;
    if (morningRoutineMins > 0) {
        const wakeTimeMins = timeToMinutes(context.user.sleep_end || '07:00');
        const morningRoutineEnd = wakeTimeMins + morningRoutineMins;
        for (let d = 1; d <= 7; d++) {
            commitmentsByDay.get(d)!.push({
                start: wakeTimeMins,
                end: morningRoutineEnd,
                title: 'Morning Routine',
                type: 'morning_routine'
            });
        }
    }
```

---

### B11 — `src/app/api/calendar/generate-today/route.ts` — Enforce morning routine effective wake time

**Find this exact block** (around line 29):

```typescript
            const wakeTime = ctx.user.sleep_end || '07:00';
            const sleepTime = ctx.user.sleep_start || '23:00';
            const windDownMins = ctx.user.wind_down_mins || 30;
```

**Replace with:**

```typescript
            const wakeTime = ctx.user.sleep_end || '07:00';
            const sleepTime = ctx.user.sleep_start || '23:00';
            const windDownMins = ctx.user.wind_down_mins || 30;
            const morningRoutineBufferMins = (ctx.user as any).morning_routine_mins || 0;
            // effectiveWakeTime is when scheduling can actually begin (after morning routine)
            const effectiveWakeTime = morningRoutineBufferMins > 0
                ? (() => {
                    const [h, m] = wakeTime.split(':').map(Number);
                    const total = (h * 60 + m + morningRoutineBufferMins) % 1440;
                    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
                  })()
                : wakeTime;
```

Then find all references to `wakeTime` in the AI system prompt and fallback generator within this file that describe the scheduleable start of day, and replace them with `effectiveWakeTime`. Specifically:

**Find:**

```typescript
2. Cover the FULL day from ${wakeTime} to ${windDownTime}
```

**Replace with:**

```typescript
2. Cover the FULL day from ${effectiveWakeTime} to ${windDownTime}
```

And in the `generateFlowStateFallback` call:

**Find:**

```typescript
                const fb = generateFlowStateFallback(ctx, targetDate, wakeTime, windDownTime, phases);
```

**Replace with:**

```typescript
                const fb = generateFlowStateFallback(ctx, targetDate, effectiveWakeTime, windDownTime, phases);
```

---

### B12 — `src/lib/scheduling/week-service.ts` — Enforce morning routine in static week plan

In `generateStaticWeekPlan`, the function receives the `profile` object. Add morning routine as an occupied exclusion at the start of each day, right before placing goals.

**Find this exact comment and line** (around line 149):

```typescript
    const wakeTime = profile?.sleep_end || '07:00';
    const sleepTime = profile?.sleep_start || '23:00';
    const lowEnergy = profile?.low_energy_mode || false;
    const windDownMins = profile?.wind_down_mins || 30;
```

**Replace with:**

```typescript
    const wakeTime = profile?.sleep_end || '07:00';
    const sleepTime = profile?.sleep_start || '23:00';
    const lowEnergy = profile?.low_energy_mode || false;
    const windDownMins = profile?.wind_down_mins || 30;
    const morningRoutineMins = (profile as any)?.morning_routine_mins || 0;
```

Then, right after the block where `dayState` is initialized (the `periodMap.forEach(d => { dayState[d] = ... })` block), add the morning routine exclusions:

**Find this exact block:**

```typescript
    periodMap.forEach(d => {
        dayState[d] = { occupied: [], categories: new Set(), anchors: new Set() };
    });
```

**Replace with:**

```typescript
    periodMap.forEach(d => {
        dayState[d] = { occupied: [], categories: new Set(), anchors: new Set() };
    });

    // Block morning routine time at the start of every day (invisible constraint)
    if (morningRoutineMins > 0) {
        const wakeMinsNum = toMins(wakeTime);
        const mrEnd = wakeMinsNum + morningRoutineMins;
        periodMap.forEach(d => {
            dayState[d].occupied.push({ start: wakeMinsNum, end: mrEnd });
        });
    }
```

---

## Summary of all changes

| # | File | What changes | Why |
|---|------|-------------|-----|
| A1a | `plan-week.ts` | Wind down bio template added for midnight-sleep users (`sleepStart === '00:00'`) | No wind_down block was generated for midnight sleepers → no exclusion zone |
| A1b | `plan-week.ts` | `dayWindDown` uses `windDownMins` param instead of hardcoded `1440` | Scheduler cap was always midnight, ignoring actual wind down start time |
| A2 | `generate-today/route.ts` | `windDownStart` uses `(+1440) % 1440` wrap | Negative result for midnight sleepers produced malformed time strings |
| A3 | `week-service.ts` | Wind down start uses wrap arithmetic; `wdStart > 0` check replaced with correct bounds | Midnight sleepers: `wdStart = -45`, check failed, no wind down block |
| A4 | `context-builder.ts` | `wind_down_mins` reads `prefs.wind_down_min` first | Onboarding writes to `profile_preferences.wind_down_min` but context builder wasn't reading it |
| B1 | DB migration | Add `morning_routine_mins` to `profiles`, `morning_routine_min` to `profile_preferences` | New setting columns |
| B2 | `database.ts` | Add new columns to TypeScript types | Type safety |
| B3 | `settings.ts` | Add `morning_routine_min` to interface + default | Type safety |
| B4 | `stores/index.ts` | Add `morning_routine_mins` to onboarding store | Captures user selection during onboarding |
| B5 | `context-builder.ts` | Read + expose `morning_routine_mins` in CalendarContext | All schedulers need this value |
| B6 | `step-2-rhythm.tsx` | Add morning routine picker (NONE/15/30/45/60 MIN) in SLEEP & WAKE section | Onboarding UI |
| B7 | `onboarding/complete/route.ts` | Save `morning_routine_mins` to both DB tables | Persistence |
| B8 | `settings/update/route.ts` | Add `morning_routine_min` to Zod schema | Settings API |
| B9 | `core-constraints.tsx` | Add morning routine select in settings UI | Settings UI |
| B10 | `plan-week.ts` | Add morning routine to `commitmentsByDay` exclusions (NOT bioTemplates — no visible block) | Core scheduling constraint for week planner |
| B11 | `generate-today/route.ts` | Compute `effectiveWakeTime`; use it as schedule start | Core scheduling constraint for today generator |
| B12 | `week-service.ts` | Add morning routine to occupied slots in static week plan | Core scheduling constraint for fallback/onboarding planner |

Do not create a `morning_routine` block type or add it to any block_type enums. Morning routine is a pure scheduling constraint — no calendar block is created, no block_type is needed. Only the time window is blocked in all three schedulers.
