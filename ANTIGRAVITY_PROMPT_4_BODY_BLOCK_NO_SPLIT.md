# Antigravity Prompt 4 — Body Pillar Blocks Must Never Split

## Context

PlannrAI's week scheduler (`src/lib/calendar/ai/plan-week.ts`, `generateVariant` function) currently places goal blocks using a splitting algorithm: if the daily target exceeds what fits in a single window, it places chunks across multiple windows on the same day. This is correct and intentional for **mind** and **craft** pillar goals (study sessions, coding, reading — users can take breaks between them).

However, **body pillar goals** (gym, running, sports, cycling, yoga, etc.) **must never be split**. Going to the gym for 30 minutes, leaving, doing other things, and returning for another 30 minutes is physically impractical for any user. The entire body session must be placed as a single contiguous block. If no single window is large enough to hold the full session, the scheduler must skip that day and try the next available day instead.

Additionally, enforce a **hard 30-minute minimum** per placed chunk for mind/craft splits. The logic exists but is not a guaranteed hard guard — add it.

Make changes **only in `src/lib/calendar/ai/plan-week.ts`**. There are 4 precise changes, all inside the `generateVariant` function. Do not touch any other file or any other function.

---

## Change 1 — `blocksThisDayForGoal` early-exit check: body goals skip the day if any block already placed

**Find this exact block** (inside the `for (const isoDay of preferredDays)` loop):

```typescript
            const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
            if (blocksThisDayForGoal.length > 0) {
                if (blocksThisDayForGoal.length >= 2) continue; // Max 2 blocks per day for any specific goal
                if (goal.pillar !== 'body' && (goal.days_per_week || 5) * (goal.minutes_per_day || 60) <= 120) continue;
            }
```

**Replace with:**

```typescript
            const blocksThisDayForGoal = blocks.filter(b => b.date === dateStr && b.goal_id === goal.id);
            if (blocksThisDayForGoal.length > 0) {
                // Body blocks cannot be split — skip this day if ANY block already placed for this goal
                if (goal.pillar === 'body') continue;
                if (blocksThisDayForGoal.length >= 2) continue; // Max 2 blocks per day for mind/craft goals
                if ((goal.days_per_week || 5) * (goal.minutes_per_day || 60) <= 120) continue;
            }
```

---

## Change 2 — Before the window loop: handle body goals with no-split placement

This change inserts body-pillar-specific logic **immediately before** the `for (const win of windows)` loop. Body goals must find a single window large enough to hold the full session; if none exists, skip the day entirely. This bypasses the splitting `while` loop entirely for body goals.

**Find this exact block** (the `windows.sort(...)` call followed immediately by `for (const win of windows)`):

```typescript
            windows.sort((a, b) => {
                if (timeFocus === 'morning') return a.start - b.start;
                if (timeFocus === 'afternoon') return Math.abs(a.start - 780) - Math.abs(b.start - 780);
                if (timeFocus === 'evening') return b.start - a.start;
                
                if (goal.pillar === 'mind') return a.start - b.start;
                if (goal.pillar === 'body') {
                    if ((goal.importance || 5) >= 8) return a.start - b.start; // Eat the frog
                    const aIsAfternoon = a.start >= 720;
                    const bIsAfternoon = b.start >= 720;
                    if (aIsAfternoon && !bIsAfternoon) return -1;
                    if (!aIsAfternoon && bIsAfternoon) return 1;
                    return a.start - b.start;
                }
                return a.start - b.start;
            });

            for (const win of windows) {
```

**Replace with:**

```typescript
            windows.sort((a, b) => {
                if (timeFocus === 'morning') return a.start - b.start;
                if (timeFocus === 'afternoon') return Math.abs(a.start - 780) - Math.abs(b.start - 780);
                if (timeFocus === 'evening') return b.start - a.start;
                
                if (goal.pillar === 'mind') return a.start - b.start;
                if (goal.pillar === 'body') {
                    if ((goal.importance || 5) >= 8) return a.start - b.start; // Eat the frog
                    const aIsAfternoon = a.start >= 720;
                    const bIsAfternoon = b.start >= 720;
                    if (aIsAfternoon && !bIsAfternoon) return -1;
                    if (!aIsAfternoon && bIsAfternoon) return 1;
                    return a.start - b.start;
                }
                return a.start - b.start;
            });

            // ── BODY PILLAR: No splitting allowed ──────────────────────────────────
            // Body blocks (gym, running, sports, etc.) must be one contiguous session.
            // Find the first window (in preference order) that fits the full daily target.
            // If no such window exists, skip this day and try the next.
            if (goal.pillar === 'body') {
                const fitWindows = windows.filter(w => (w.end - w.start) >= remainingMinsForDay);
                if (fitWindows.length > 0) {
                    const win = fitWindows[0]; // already sorted by pillar/time preference above
                    let start = win.start;
                    // Small inset if the window is significantly larger than the block
                    if ((win.end - win.start) > remainingMinsForDay + 30) {
                        start += 15;
                    }
                    let buffer = protocolConfig?.bufferMinutes ?? 10;
                    if (!protocolConfig?.bufferMinutes) {
                        if (strategyId === 'momentum') buffer = 0;
                        else if (strategyId === 'balanced') buffer = (ctx.user as any).default_buffer_duration || 15;
                        else if (strategyId === 'recovery') buffer = Math.max(30, ((ctx.user as any).default_buffer_duration || 15) * 2);
                    }
                    if ((win.end - start) < remainingMinsForDay + buffer) {
                        buffer = Math.max(0, (win.end - start) - remainingMinsForDay);
                    }
                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + remainingMinsForDay),
                        title: goal.title, // never append "(Part)" for body goals
                        block_type: 'goal',
                        goal_id: goal.id,
                        pillar: goal.pillar,
                        checklist: goal.ai_strategy?.checklist || [{ text: 'Warm up' }, { text: 'Main session' }, { text: 'Cool down' }]
                    });
                    dayExclusions.push({
                        start,
                        end: start + remainingMinsForDay + buffer,
                        title: goal.title,
                        type: 'goal'
                    });
                    workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + remainingMinsForDay);
                    remainingWeeklyMins -= remainingMinsForDay;
                }
                // Whether placed or not, skip the splitting window loop for body goals
                continue;
            }
            // ── END BODY PILLAR ────────────────────────────────────────────────────

            for (const win of windows) {
```

---

## Change 3 — Hard 30-minute minimum guard inside the mind/craft placement block (Pass 1)

In the `while` loop that places mind/craft chunks, add a hard guard immediately before the `blocks.push(...)` call to ensure no chunk shorter than 30 minutes is ever placed.

**Find this exact block** (inside the `while (remainingMinsForDay > 0 && availableInWin >= 30)` loop in Pass 1):

```typescript
                    let start = winStart;
                    if (goal.pillar === 'body' && availableInWin > minsToPlace + 30) {
                        start += 15;
                    }
                    
                    let buffer = protocolConfig?.bufferMinutes ?? 10;
                    if (!protocolConfig?.bufferMinutes) {
                        if (strategyId === 'momentum') buffer = 0; 
                        else if (strategyId === 'balanced') buffer = (ctx.user as any).default_buffer_duration || 15;
                        else if (strategyId === 'recovery') buffer = Math.max(30, ((ctx.user as any).default_buffer_duration || 15) * 2);
                    }

                    if (availableInWin < minsToPlace + buffer) {
                        buffer = availableInWin - minsToPlace; 
                    }

                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + minsToPlace),
                        title: minsToPlace < targetMinsPerDay ? `${goal.title} (Part)` : goal.title,
```

**Replace with:**

```typescript
                    let start = winStart;
                    
                    let buffer = protocolConfig?.bufferMinutes ?? 10;
                    if (!protocolConfig?.bufferMinutes) {
                        if (strategyId === 'momentum') buffer = 0; 
                        else if (strategyId === 'balanced') buffer = (ctx.user as any).default_buffer_duration || 15;
                        else if (strategyId === 'recovery') buffer = Math.max(30, ((ctx.user as any).default_buffer_duration || 15) * 2);
                    }

                    if (availableInWin < minsToPlace + buffer) {
                        buffer = availableInWin - minsToPlace; 
                    }

                    // Hard minimum: never place a mind/craft chunk shorter than 30 minutes
                    if (minsToPlace < 30) break;

                    blocks.push({
                        date: dateStr,
                        start_time: minutesToTime(start),
                        end_time: minutesToTime(start + minsToPlace),
                        title: minsToPlace < targetMinsPerDay ? `${goal.title} (Part)` : goal.title,
```

Note: the `if (goal.pillar === 'body' && availableInWin > minsToPlace + 30) { start += 15; }` line is removed here because body goals no longer reach this code path (they are handled and `continue`d in Change 2 above).

---

## Change 4 — Pass 2 (Cram Pass): skip body goals if already placed, no splitting

The cram pass runs after Pass 1 to fill any remaining unscheduled goal minutes. It needs the same body-pillar protection: skip if already placed today, or find a full-fit window without splitting.

**Find this exact block** (inside the cram pass `for (const isoDay of allDays)` loop, right after `let remainingToPlace = ...`):

```typescript
                let remainingToPlace = Math.min(remainingMinsForDay, remainingWeeklyMins);
                if (remainingWeeklyMins - remainingToPlace > 0 && remainingWeeklyMins - remainingToPlace < 30) {
                    remainingToPlace = Math.ceil((remainingWeeklyMins / 2) / 15) * 15;
                }

                
                const dayExclusions = exclusions.get(isoDay)!;
                dayExclusions.sort((a, b) => a.start - b.start);
                let windows: Array<{ start: number; end: number }> = [];
                let cursor = 0;
                for (const ex of dayExclusions) {
                    if (cursor < ex.start) windows.push({ start: cursor, end: ex.start });
                    cursor = Math.max(cursor, ex.end);
                }
                if (cursor < 1440) windows.push({ start: cursor, end: 1440 });

                windows = windows.filter(w => w.end > w.start);

                for (const win of windows) {
```

**Replace with:**

```typescript
                let remainingToPlace = Math.min(remainingMinsForDay, remainingWeeklyMins);
                if (remainingWeeklyMins - remainingToPlace > 0 && remainingWeeklyMins - remainingToPlace < 30) {
                    remainingToPlace = Math.ceil((remainingWeeklyMins / 2) / 15) * 15;
                }

                // Body goals: skip this day in the cram pass if a block was already placed today
                if (goal.pillar === 'body' && blocksToday.length > 0) continue;

                const dayExclusions = exclusions.get(isoDay)!;
                dayExclusions.sort((a, b) => a.start - b.start);
                let windows: Array<{ start: number; end: number }> = [];
                let cursor = 0;
                for (const ex of dayExclusions) {
                    if (cursor < ex.start) windows.push({ start: cursor, end: ex.start });
                    cursor = Math.max(cursor, ex.end);
                }
                if (cursor < 1440) windows.push({ start: cursor, end: 1440 });

                windows = windows.filter(w => w.end > w.start);

                // Body pillar in cram pass: same no-split rule — find full-fit window or skip
                if (goal.pillar === 'body') {
                    const fitWindows = windows.filter(w => (w.end - w.start) >= remainingToPlace);
                    if (fitWindows.length > 0) {
                        const win = fitWindows[0];
                        const start = win.start;
                        blocks.push({
                            date: dateStr,
                            start_time: minutesToTime(start),
                            end_time: minutesToTime(start + remainingToPlace),
                            title: goal.title,
                            block_type: 'goal',
                            goal_id: goal.id,
                            pillar: goal.pillar,
                            checklist: goal.ai_strategy?.checklist || [{ text: 'Warm up' }, { text: 'Main session' }, { text: 'Cool down' }]
                        });
                        dayExclusions.push({ start, end: start + remainingToPlace, title: goal.title, type: 'goal' });
                        workloadPerDay.set(isoDay, (workloadPerDay.get(isoDay) || 0) + remainingToPlace);
                        remainingWeeklyMins -= remainingToPlace;
                    }
                    continue; // Skip the splitting window loop for body goals
                }

                for (const win of windows) {
```

---

## Summary

| Change | Location | What it does |
|--------|----------|-------------|
| 1 | `blocksThisDayForGoal` check | Body goals: skip day immediately if any block already placed (prevents second block from being created mid-loop) |
| 2 | Before `for (const win of windows)` in Pass 1 | Body goals: find largest fitting window → place full block → `continue` to next day. Never appends `(Part)`. If no window fits, skips day silently. |
| 3 | Inside `while` loop in Pass 1 | Hard guard: `if (minsToPlace < 30) break` before any block push (mind/craft only — body never reaches this point) |
| 4 | Pass 2 (Cram Pass) | Body goals: skip day if already placed; if not, use same no-split full-fit logic before the splitting `for (const win of windows)` loop |

Do not touch any other file. Do not change meal scheduling, anchor handling, buffer calculations, or the `otherBodyBlocks` 120-minute gap constraint (that is the existing rule preventing two DIFFERENT body goals on the same day, which must remain unchanged).
