# Antigravity Prompt 5 — Coach Hub Complete Rewrite

## Overview

PlannrAI's Coach Hub (`/app/coach`) uses an AI coach named Donna. The hub is broken in three ways and needs to be rebuilt around a new, precise UX. This prompt targets **4 files** with surgical changes — it does not touch anything outside these files.

**Problems being fixed:**
1. **504 timeout** — `buildCalendarContext` (heavy calendar builder, ~15s) runs for every message before the AI call. Combined with `model: 'smart'` + `useNvidia: true`, Vercel's 60s limit is blown for "Reduce today's load".
2. **"I'd like to help with that" fallback** — when the AI call fails/times out, `generateFallbackResponse` is reached with `MOVE_BLOCK` intent, which has no real handler and returns a generic clarification string instead of doing anything useful.
3. **Wrong UI** — 4 center bubbles instead of 2, plus a bottom quick-chip strip that must be removed entirely.

**New UX spec:**
- Center empty state: **2 bubbles only** — "Reduce today's load" and "Fix today's schedule"
- **No bottom chip strip** (remove the row with "Plan my day", "What should I do next?", etc.)
- The two center bubbles call a **dedicated quick-action endpoint** (pure TypeScript, no AI, no 504 possible)
- Manual messages are still routed through `/api/coach/message` — fix it to stop timing out and stop asking for clarification when the user provides a block name + time

---

## File 1 (CREATE): `src/app/api/coach/quick-action/route.ts`

This is a brand-new file. It handles two quick actions with **pure TypeScript scheduling logic** — no AI calls, no timeout risk.

```
POST /api/coach/quick-action
Body: { action: 'reduce_today_load' | 'fix_today_schedule' }
```

**Import the same auth helper used across the codebase:**
```typescript
import { secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';
```

**Full implementation to write:**

```typescript
import { NextResponse } from 'next/server';
import { secureApiRoute, SecureApiContext } from '@/lib/security/api-protection';

export const maxDuration = 30; // Well within Vercel's limit — pure TS, no AI

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(mins: number): string {
    const safe = ((mins % 1440) + 1440) % 1440;
    return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

function getDayName(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

function fmt24(t: string): string { return t.substring(0, 5); }

interface Block {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    context?: string;
    block_type: string;
    status: string;
    goal_id?: string | null;
}

interface Goal {
    id: string;
    title: string;
    pillar: string;
    priority: number | string;
}

/**
 * Find a free slot on `date` that fits `durationMins` (minimum 30).
 * Respects wake, morning_routine, sleep, wind_down, and all occupied blocks.
 * Returns { start, end, actualDuration } or null if none found.
 */
function findFreeSlot(
    allBlocks: Block[],
    date: string,
    durationMins: number,
    wakeTime: string,       // e.g. "07:00"
    sleepTime: string,      // e.g. "23:00"
    windDownMins: number,   // e.g. 45
    morningRoutineMins: number, // e.g. 30
    notBeforeTime?: string  // for today: current time
): { start: string; end: string; actualDuration: number } | null {

    const wakeMins = timeToMinutes(wakeTime);
    const sleepMins = timeToMinutes(sleepTime) === 0 ? 1440 : timeToMinutes(sleepTime);

    // Wind down starts windDownMins before sleep
    const windDownStart = ((sleepMins - windDownMins) + 1440) % 1440;
    // Scheduling window: after wake+routine, before wind-down start
    const scheduleStart = wakeMins + morningRoutineMins;
    const scheduleEnd = windDownStart === 0 ? 1440 : windDownStart; // treat 00:00 as 24:00

    // Earliest we can place a block
    let cursor = scheduleStart;
    if (notBeforeTime) {
        cursor = Math.max(cursor, timeToMinutes(notBeforeTime));
    }

    // Collect all occupied windows on this date (include all block types)
    const dayBlocks = allBlocks
        .filter(b => b.date === date && b.status !== 'missed')
        .map(b => ({ start: timeToMinutes(b.start_time), end: timeToMinutes(b.end_time) }))
        .sort((a, b) => a.start - b.start);

    // Sweep through gaps
    for (const block of dayBlocks) {
        if (block.end <= cursor) continue;
        const gapStart = cursor;
        const gapEnd = Math.min(block.start, scheduleEnd);
        const gap = gapEnd - gapStart;
        if (gap >= 30) {
            const actual = Math.min(durationMins, gap);
            if (actual >= 30) {
                return {
                    start: minutesToTime(gapStart),
                    end: minutesToTime(gapStart + actual),
                    actualDuration: actual,
                };
            }
        }
        cursor = Math.max(cursor, block.end);
    }

    // Final gap before wind-down
    const finalGap = scheduleEnd - cursor;
    if (finalGap >= 30) {
        const actual = Math.min(durationMins, finalGap);
        return {
            start: minutesToTime(cursor),
            end: minutesToTime(cursor + actual),
            actualDuration: actual,
        };
    }

    return null;
}

function isHighPriority(goal: Goal): boolean {
    const p = goal.priority;
    // Priority stored as 1-10 number or 'low'/'medium'/'high' string
    if (typeof p === 'number') return p >= 7;
    if (typeof p === 'string') return p === 'high';
    return false;
}

function hasBodyBlockOnDay(allBlocks: Block[], goals: Goal[], date: string): boolean {
    return allBlocks.some(b => {
        if (b.date !== date || b.status === 'missed') return false;
        const goal = goals.find(g => g.id === b.goal_id);
        return goal?.pillar === 'body' && b.block_type === 'goal';
    });
}

export const POST = secureApiRoute(
    async (context: SecureApiContext, body: any) => {
        const { user, supabase } = context;
        const { action } = body as { action: string };

        if (!action || !['reduce_today_load', 'fix_today_schedule'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        // ── Fetch profile for timezone + sleep/routine settings ──────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('timezone, sleep_start, sleep_end, wind_down_mins, morning_routine_mins, first_name')
            .eq('id', user.id)
            .single();

        const timezone = profile?.timezone || 'UTC';
        const wakeTime = profile?.sleep_end || '07:00';
        const sleepTime = profile?.sleep_start || '23:00';
        const windDownMins = profile?.wind_down_mins || 30;
        const morningRoutineMins = profile?.morning_routine_mins || 0;

        // Get today's date in user timezone
        const now = new Date();
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const today = dateFormatter.format(now);
        const currentTime = timeFormatter.format(now);

        // Get this week's remaining days (today through Sunday)
        const remainingDates: string[] = [];
        let d = today;
        for (let i = 0; i < 7; i++) {
            remainingDates.push(d);
            if (new Date(d + 'T12:00:00').getDay() === 0) break; // Sunday
            d = addDays(d, 1);
        }
        const futureDates = remainingDates.slice(1); // exclude today

        // ── Fetch all data in parallel ────────────────────────────────────────
        const weekStart = remainingDates[0];
        const weekEnd = remainingDates[remainingDates.length - 1];

        const [goalsRes, weekBlocksRes] = await Promise.all([
            supabase.from('goals')
                .select('id, title, pillar, priority')
                .eq('user_id', user.id)
                .eq('status', 'active'),
            supabase.from('schedule_blocks')
                .select('id, date, start_time, end_time, title, context, block_type, status, goal_id')
                .eq('user_id', user.id)
                .gte('date', weekStart)
                .lte('date', weekEnd)
                .order('date').order('start_time'),
        ]);

        const goals: Goal[] = goalsRes.data || [];
        const allBlocks: Block[] = weekBlocksRes.data || [];
        const todayBlocks = allBlocks.filter(b => b.date === today);

        // ── BRANCH: reduce_today_load ─────────────────────────────────────────
        if (action === 'reduce_today_load') {
            // Goal blocks on today that are NOT completed
            const actionableToday = todayBlocks.filter(b =>
                b.block_type === 'goal' &&
                b.status !== 'done' &&
                b.goal_id
            );

            const highPriorityKept: Block[] = [];
            const candidates: Block[] = []; // low/medium priority → reschedule

            for (const block of actionableToday) {
                const goal = goals.find(g => g.id === block.goal_id);
                if (!goal) continue;
                if (isHighPriority(goal)) {
                    highPriorityKept.push(block);
                } else {
                    candidates.push(block);
                }
            }

            // Build ops by finding space for each candidate in the rest of the week
            const ops: any[] = [];
            const movedResults: Array<{ block: Block; toDate: string; toStart: string; toEnd: string; dayName: string }> = [];
            const droppedResults: Block[] = [];

            // Track blocks tentatively added per day so we don't double-book
            const tentativeByDate = new Map<string, Array<{ start: number; end: number }>>();
            for (const date of futureDates) {
                tentativeByDate.set(date, []);
            }

            for (const candidate of candidates) {
                const durationMins = timeToMinutes(candidate.end_time) - timeToMinutes(candidate.start_time);
                const effectiveDuration = Math.max(durationMins, 30);
                const candidateGoal = goals.find(g => g.id === candidate.goal_id);

                let placed = false;
                for (const futureDate of futureDates) {
                    // Body rule: skip days that already have any body goal block
                    if (candidateGoal?.pillar === 'body' && hasBodyBlockOnDay(allBlocks, goals, futureDate)) {
                        continue;
                    }
                    // Also check if we're tentatively placing a body block on this day
                    if (candidateGoal?.pillar === 'body') {
                        const tentative = tentativeByDate.get(futureDate) || [];
                        if (tentative.length > 0 && ops.some(op =>
                            op.new_date === futureDate &&
                            goals.find(g => g.id === candidates.find(c => c.id === op.block_id)?.goal_id)?.pillar === 'body'
                        )) {
                            continue;
                        }
                    }

                    // Combine real blocks + tentative for this date
                    const realBlocks = allBlocks.filter(b => b.date === futureDate);
                    const tentative = tentativeByDate.get(futureDate) || [];
                    const combinedBlocks = [
                        ...realBlocks.map(b => b),
                        ...tentative.map(t => ({
                            id: 'tentative',
                            date: futureDate,
                            start_time: minutesToTime(t.start),
                            end_time: minutesToTime(t.end),
                            title: 'tentative',
                            block_type: 'goal',
                            status: 'planned',
                        } as Block)),
                    ];

                    const slot = findFreeSlot(
                        combinedBlocks,
                        futureDate,
                        effectiveDuration,
                        wakeTime,
                        sleepTime,
                        windDownMins,
                        morningRoutineMins
                    );

                    if (slot) {
                        ops.push({
                            type: 'move_block',
                            block_id: candidate.id,
                            title: candidate.title || candidate.context,
                            new_start: slot.start,
                            new_end: slot.end,
                            new_date: futureDate,
                        });
                        movedResults.push({
                            block: candidate,
                            toDate: futureDate,
                            toStart: slot.start,
                            toEnd: slot.end,
                            dayName: getDayName(futureDate),
                        });
                        // Register tentative slot
                        const tent = tentativeByDate.get(futureDate) || [];
                        tent.push({ start: timeToMinutes(slot.start), end: timeToMinutes(slot.end) });
                        tentativeByDate.set(futureDate, tent);
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    // No space found — delete from today, note it's dropped from the week
                    ops.push({
                        type: 'delete_block',
                        block_id: candidate.id,
                        title: candidate.title || candidate.context,
                    });
                    droppedResults.push(candidate);
                }
            }

            // Build human-readable summary
            const keptNames = highPriorityKept
                .map(b => `"${b.title || b.context}"`)
                .join(', ');
            const movedLines = movedResults.map(r =>
                `• "${r.block.title || r.block.context}" → ${r.dayName} at ${fmt24(r.toStart)}–${fmt24(r.toEnd)}`
            ).join('\n');
            const droppedLines = droppedResults.map(b =>
                `• "${b.title || b.context}" — no space found this week, removed from schedule`
            ).join('\n');

            let summary = '';
            if (candidates.length === 0) {
                summary = `Your schedule only has high-priority blocks today — there's nothing low-priority to move. Your day stays as-is.`;
            } else {
                if (keptNames) summary += `Keeping today: ${keptNames}.\n\n`;
                if (movedLines) summary += `Moving to later this week:\n${movedLines}`;
                if (droppedLines) summary += (movedLines ? '\n\n' : '') + `Removed (no space this week):\n${droppedLines}`;
            }

            return NextResponse.json({
                success: true,
                summary: summary.trim(),
                ops,
                meta: {
                    kept: highPriorityKept.length,
                    moved: movedResults.length,
                    dropped: droppedResults.length,
                }
            });
        }

        // ── BRANCH: fix_today_schedule ────────────────────────────────────────
        if (action === 'fix_today_schedule') {
            const currentMins = timeToMinutes(currentTime);

            // Blocks that started before now and aren't completed
            const overdue = todayBlocks.filter(b =>
                b.block_type === 'goal' &&
                b.status !== 'done' &&
                timeToMinutes(b.start_time) < currentMins
            );

            if (overdue.length === 0) {
                return NextResponse.json({
                    success: true,
                    summary: `No overdue blocks found before ${fmt24(currentTime)}. Your remaining schedule looks good.`,
                    ops: [],
                    meta: { moved: 0, dropped: 0 },
                });
            }

            const ops: any[] = [];
            const movedResults: Array<{ block: Block; toDate: string; toStart: string; toEnd: string; dayName: string; sameDay: boolean }> = [];
            const droppedResults: Block[] = [];

            // Track tentative slots
            const tentativeByDate = new Map<string, Array<{ start: number; end: number }>>();
            for (const date of [today, ...futureDates]) {
                tentativeByDate.set(date, []);
            }

            for (const block of overdue) {
                const durationMins = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
                const effectiveDuration = Math.max(durationMins, 30);
                const blockGoal = goals.find(g => g.id === block.goal_id);

                let placed = false;

                // 1. Try later today first
                if (!placed) {
                    const tentToday = tentativeByDate.get(today) || [];
                    const combined = [
                        ...allBlocks.filter(b => b.date === today),
                        ...tentToday.map(t => ({ id: 'tentative', date: today, start_time: minutesToTime(t.start), end_time: minutesToTime(t.end), title: 'tentative', block_type: 'goal', status: 'planned' } as Block)),
                    ];
                    const slot = findFreeSlot(combined, today, effectiveDuration, wakeTime, sleepTime, windDownMins, morningRoutineMins, currentTime);
                    if (slot) {
                        ops.push({ type: 'move_block', block_id: block.id, title: block.title || block.context, new_start: slot.start, new_end: slot.end, new_date: today });
                        movedResults.push({ block, toDate: today, toStart: slot.start, toEnd: slot.end, dayName: 'today', sameDay: true });
                        const tent = tentativeByDate.get(today) || [];
                        tent.push({ start: timeToMinutes(slot.start), end: timeToMinutes(slot.end) });
                        tentativeByDate.set(today, tent);
                        placed = true;
                    }
                }

                // 2. Try later in the week
                if (!placed) {
                    for (const futureDate of futureDates) {
                        if (blockGoal?.pillar === 'body' && hasBodyBlockOnDay(allBlocks, goals, futureDate)) continue;
                        const tent = tentativeByDate.get(futureDate) || [];
                        const combined = [
                            ...allBlocks.filter(b => b.date === futureDate),
                            ...tent.map(t => ({ id: 'tentative', date: futureDate, start_time: minutesToTime(t.start), end_time: minutesToTime(t.end), title: 'tentative', block_type: 'goal', status: 'planned' } as Block)),
                        ];
                        const slot = findFreeSlot(combined, futureDate, effectiveDuration, wakeTime, sleepTime, windDownMins, morningRoutineMins);
                        if (slot) {
                            ops.push({ type: 'move_block', block_id: block.id, title: block.title || block.context, new_start: slot.start, new_end: slot.end, new_date: futureDate });
                            movedResults.push({ block, toDate: futureDate, toStart: slot.start, toEnd: slot.end, dayName: getDayName(futureDate), sameDay: false });
                            const t2 = tentativeByDate.get(futureDate) || [];
                            t2.push({ start: timeToMinutes(slot.start), end: timeToMinutes(slot.end) });
                            tentativeByDate.set(futureDate, t2);
                            placed = true;
                            break;
                        }
                    }
                }

                if (!placed) {
                    droppedResults.push(block);
                }
            }

            const movedLines = movedResults.map(r =>
                `• "${r.block.title || r.block.context}" → ${r.sameDay ? 'later today' : r.dayName} at ${fmt24(r.toStart)}–${fmt24(r.toEnd)}`
            ).join('\n');
            const droppedLines = droppedResults.map(b =>
                `• "${b.title || b.context}" — no space found this week, left as-is`
            ).join('\n');

            let summary = `Found ${overdue.length} overdue block${overdue.length > 1 ? 's' : ''} before ${fmt24(currentTime)}.\n\n`;
            if (movedLines) summary += `Rescheduling:\n${movedLines}`;
            if (droppedLines) summary += (movedLines ? '\n\n' : '') + `Could not reschedule:\n${droppedLines}`;

            return NextResponse.json({
                success: true,
                summary: summary.trim(),
                ops,
                meta: { moved: movedResults.length, dropped: droppedResults.length },
            });
        }

        return NextResponse.json({ success: false, error: 'Unhandled action' }, { status: 400 });
    },
    { requireAuth: true, rateLimit: 'aiCoach', auditAction: 'coach_quick_action' }
);
```

---

## File 2 (REWRITE): `src/components/coach/CoachChat.tsx`

Keep the file at the same path. Rewrite its contents completely. The `CoachDashboard.tsx` wrapper, the `use-coach.ts` hook, and the `apply/route.ts` are unchanged — only `CoachChat.tsx` changes.

**Imports to keep (same as current):**
```typescript
'use client';
import { useState, FormEvent, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { useCoach, CoachMessage } from '@/hooks/use-coach';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CoachOption } from '@/types/coach-v4';
import { CoachMessageBubble } from './CoachMessageBubble';
import { ConfirmationModal } from './ConfirmationModal';
import { usePremiumCalendar } from '@/components/calendar/premium-calendar-styles';
import { motion, AnimatePresence } from 'framer-motion';
```

**Key behavioral changes from current:**

### A. Empty state — 2 bubbles only, centered

Replace the current 4-bubble grid with exactly 2 bubbles. These bubbles do NOT call `sendMessage` (which goes to the message route). They call a new handler `handleQuickAction`:

```typescript
const quickBubbles = [
    {
        label: "Reduce today's load",
        emoji: "😵‍💫",
        action: 'reduce_today_load' as const,
        description: "Move low-priority blocks to later in the week",
    },
    {
        label: "Fix today's schedule",
        emoji: "🔄",
        action: 'fix_today_schedule' as const,
        description: "Reschedule overdue blocks to open slots",
    },
];
```

Render them as large, centered cards (not pill buttons), each ~280px wide, side by side on desktop, stacked on mobile. Style consistent with the existing dark glass aesthetic (`bg-white/[0.03]`, `border-white/[0.07]`, `rounded-2xl`, hover: `hover:border-orange-500/25 hover:bg-orange-500/10`).

### B. `handleQuickAction` — calls the new quick-action endpoint

```typescript
const [isQuickActionLoading, setIsQuickActionLoading] = useState(false);

const handleQuickAction = async (action: 'reduce_today_load' | 'fix_today_schedule') => {
    if (isQuickActionLoading || isLoading) return;
    setIsQuickActionLoading(true);

    // Add user-side message to chat to show what was requested
    const labelMap = {
        reduce_today_load: "Reduce today's load",
        fix_today_schedule: "Fix today's schedule",
    };

    // Synthesize a user message in the chat thread (display only, not sent to AI)
    const userMsg: CoachMessage = {
        id: `local_${Date.now()}`,
        role: 'user',
        content: labelMap[action],
        timestamp: Date.now(),
    };
    // Append to messages via the hook's internal setter — or just use sendMessage
    // SIMPLEST: call sendMessage with a special prefix that routes to quick-action
    // BETTER: call the quick-action endpoint directly and append synthetic messages

    try {
        const raw = await apiClient.post('/api/coach/quick-action', { action }) as any;

        if (!raw.success) {
            showToast(raw.error || 'Something went wrong', 'error');
            return;
        }

        const { summary, ops } = raw;

        // Build a synthetic assistant message with option card(s)
        // The ops are wrapped in a single "Apply Changes" option
        const option: CoachOption = {
            id: `quick_${action}_${Date.now()}`,
            title: labelMap[action],
            description: summary,
            impact: `${raw.meta?.moved || 0} block${(raw.meta?.moved || 0) !== 1 ? 's' : ''} rescheduled${raw.meta?.dropped ? `, ${raw.meta.dropped} dropped` : ''}`,
            patch: {
                ops: ops.map((op: any) => {
                    if (op.type === 'move_block') {
                        return { op: 'move_event', event_id: op.block_id, title: op.title, to_start: op.new_start, to_end: op.new_end, date: op.new_date };
                    }
                    if (op.type === 'delete_block') {
                        return { op: 'delete_event', event_id: op.block_id, title: op.title };
                    }
                    return op;
                }),
                undoable: true,
                scope: 'week' as const,
                reason: labelMap[action],
                // The apply route expects operations[] (internal format), not ops[]
                // Pass operations[] in the shape apply/route.ts normalizes from
                operations: ops,
                requires_confirmation: true,
            },
            recommended: true,
        };

        // Append two synthetic messages: user request + assistant response
        // Use sendMessage with a trick: send empty message that displays these
        // ACTUAL APPROACH: Directly push to messages using the hook's API
        // The use-coach hook exposes sendMessage which returns and sets messages.
        // For quick actions, we bypass sendMessage and push directly.
        // Since we can't push to Zustand from here easily without exposing a setter,
        // call sendMessage with the action label so it appears in chat,
        // then the API will route it through the standard message handler.
        // 
        // HOWEVER — to avoid the 504, we need the quick-action endpoint result.
        // SOLUTION: use sendMessage but pass the ops as metadata so the response
        // returns immediately with the pre-computed ops.
        //
        // SIMPLEST reliable solution: append messages to the messages array via
        // a new hook method appendMessages, OR use the existing hook's 
        // sendMessage-like pattern.

        // For now: use sendMessage with a synthetic user prompt that includes
        // the precomputed plan as a special system hint injected server-side.
        // This keeps the message thread intact.
        //
        // FINAL DECISION: The cleanest approach given the existing hook is:
        // 1. Display a user bubble manually by pushing to a local "extraMessages" array
        // 2. Display assistant response as a local message with the option card
        // 3. Apply happens via the existing applyOption flow once the user confirms

        // Push synthetic messages to local display state
        setSyntheticMessages(prev => [
            ...prev,
            { id: `user_${Date.now()}`, role: 'user' as const, content: labelMap[action], timestamp: Date.now() },
            {
                id: `assistant_${Date.now()}`,
                role: 'assistant' as const,
                content: summary,
                options: ops.length > 0 ? [option] : undefined,
                timestamp: Date.now() + 1,
            },
        ]);

    } catch (err: any) {
        showToast('Failed to process request', 'error');
        console.error('[QuickAction]', err);
    } finally {
        setIsQuickActionLoading(false);
    }
};
```

Add this state alongside the existing states:
```typescript
const [syntheticMessages, setSyntheticMessages] = useState<CoachMessage[]>([]);
```

Combine `messages` from the hook and `syntheticMessages` into a single display array:
```typescript
const allMessages = [...messages, ...syntheticMessages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
```

Render `allMessages` in the messages loop instead of `messages`. All existing message rendering logic stays the same.

### C. Option card — "Review & Execute" flow

**Change the `InlineOptionCard` component:**

Replace the "Apply" button with "Review & Execute". When clicked, expand an inline review panel (not a full modal) within the same card. The review panel shows the description text and an "Apply Changes" button:

```typescript
function InlineOptionCard({ option, onSelect, disabled }: {
    option: CoachOption;
    onSelect: () => void;
    disabled: boolean;
}) {
    const [reviewOpen, setReviewOpen] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className={`group relative p-4 rounded-2xl border transition-all duration-200 ${
                option.recommended
                    ? 'border-orange-500/30 bg-orange-500/5'
                    : 'border-white/[0.07] bg-white/[0.03]'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {option.recommended && (
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500 mb-1.5 block">
                    ✦ Recommended
                </span>
            )}

            <p className="font-bold text-white/90 text-[14px] leading-snug mb-1">{option.title}</p>

            {option.description && (
                <p className="text-sm text-white/55 leading-relaxed whitespace-pre-line">{option.description}</p>
            )}

            {option.impact && (
                <p className="text-xs text-orange-400/80 mt-2 whitespace-pre-line leading-relaxed">{option.impact}</p>
            )}

            {option.tradeoff && (
                <div className={`mt-2 text-xs p-2.5 rounded-xl border ${
                    option.tradeoff.severity === 'warning' ? 'bg-red-500/5 text-red-300/80 border-red-500/15'
                    : option.tradeoff.severity === 'caution' ? 'bg-yellow-500/5 text-yellow-300/80 border-yellow-500/15'
                    : 'bg-white/[0.03] text-white/40 border-white/[0.06]'
                }`}>
                    <span className="font-bold">Note: </span>{option.tradeoff.warning}
                </div>
            )}

            <div className="mt-3 flex items-center gap-2">
                <button
                    onClick={e => { e.stopPropagation(); setReviewOpen(!reviewOpen); }}
                    disabled={disabled}
                    className={`px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-colors ${
                        option.recommended
                            ? 'bg-orange-500 text-white hover:bg-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                            : 'bg-white/10 text-white/80 hover:bg-white/[0.16]'
                    }`}
                >
                    {reviewOpen ? 'Hide Review' : 'Review & Execute'}
                </button>
            </div>

            {/* Inline review panel */}
            <AnimatePresence>
                {reviewOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-3 overflow-hidden"
                    >
                        <div className="p-3 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
                            <p className="text-[11px] font-bold text-white/60 uppercase tracking-widest">
                                Changes Preview
                            </p>
                            <p className="text-sm text-white/75 whitespace-pre-line leading-relaxed">
                                {option.description}
                            </p>
                            <button
                                onClick={e => { e.stopPropagation(); if (!disabled) { setReviewOpen(false); onSelect(); } }}
                                disabled={disabled}
                                className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-widest bg-orange-500 text-white hover:bg-orange-400 transition-colors shadow-[0_0_20px_rgba(249,115,22,0.3)] disabled:opacity-50"
                            >
                                Apply Changes
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
```

### D. `handleOptionSelect` — when "Apply Changes" is clicked

For the quick-action synthetic options, `applyOption(parentMessage.id, option.id)` won't work because there's no real server-side message. For synthetic messages, bypass `applyOption` and call `/api/coach/apply` directly with the option's patch:

```typescript
const handleOptionSelect = async (option: CoachOption, parentMessageId: string) => {
    // Check if this is a synthetic quick-action option (no real conversation_id needed)
    const isSynthetic = parentMessageId.startsWith('assistant_') || parentMessageId.startsWith('local_');
    
    setIsApplyingChanges(true);
    
    if (isSynthetic) {
        // Direct apply — no conversation needed
        try {
            const result = await apiClient.post('/api/coach/apply', {
                conversation_id: null,
                option_id: option.id,
                patch: option.patch,
            }) as any;

            if (result.success) {
                // Mark the synthetic message as applied
                setSyntheticMessages(prev => prev.map(m =>
                    m.id === parentMessageId
                        ? { ...m, selected_option_id: option.id, undoToken: result.undo_token }
                        : m
                ));
                onCalendarUpdate?.();
                // Animate moved blocks
                const moveOps = (option.patch as any).operations || [];
                moveOps.forEach((op: any) => {
                    if (op.type === 'move_block' && op.block_id) {
                        usePremiumCalendar.getState().addAnimatingBlock(op.block_id, 1000);
                    }
                });
            } else {
                showToast(result.error || 'Failed to apply changes', 'error');
            }
        } catch (e) {
            showToast('Failed to apply changes', 'error');
        } finally {
            setIsApplyingChanges(false);
        }
        return;
    }

    // Original flow for AI-generated options from the message route
    const parentMessage = [...messages, ...syntheticMessages].find(m => m.id === parentMessageId);
    if (!parentMessage) { setIsApplyingChanges(false); return; }

    try {
        const result = await applyOption(parentMessage.id, option.id);
        if (result) {
            const appliedOption = typeof result === 'object' ? result : option;
            const ops = (appliedOption.patch as any)?.operations || [];
            let isReplan = false;
            const blockIdsToAnimate: string[] = [];
            ops.forEach((op: any) => {
                if (op.type === 'replan_week') isReplan = true;
                else if ((op.type === 'move_block' || op.type === 'update_block') && op.payload?.id) {
                    blockIdsToAnimate.push(op.payload.id);
                }
            });
            if (isReplan) {
                usePremiumCalendar.getState().setIsAnimating(true);
                setTimeout(() => usePremiumCalendar.getState().setIsAnimating(false), 2500);
            } else {
                blockIdsToAnimate.forEach(id => usePremiumCalendar.getState().addAnimatingBlock(id, 1000));
            }
            onCalendarUpdate?.();
        }
    } finally {
        setIsApplyingChanges(false);
    }
};
```

Update the `InlineOptionCard`'s `onSelect` call sites to pass the `parentMessageId`.

### E. No bottom chip strip

Remove the entire bottom chip section (the `px-5 pt-3 pb-2 overflow-x-auto` div containing "Plan my day", "What should I do next?", "Replan my week", "Show my progress"). Keep the input bar `<form>` unchanged.

### F. Loading state

For quick actions, show the same existing loading animation (the spinning rings + italic stages) but set `isQuickActionLoading` instead of `isLoading`. Show this indicator while the quick-action request is in flight:

```typescript
const showLoadingIndicator = isLoading || isQuickActionLoading;
```

Use `showLoadingIndicator` anywhere the old `isLoading` was used to gate the spinner.

---

## File 3 (FIX): `src/lib/coach/response-generator.ts`

Two targeted changes. Do not touch anything else in this file.

### Change A — Remove `buildCalendarContext` for rescheduling intents (lines ~1855–1861)

**Find:**
```typescript
    if (!calCtx && supabase && intent !== CoachIntent.GENERAL_CHAT && intent !== CoachIntent.OUT_OF_SCOPE) {
        try {
            calCtx = await buildCalendarContext(context.user_id || context.user?.id, supabase);
        } catch (e) {
            console.warn('[CoachAI] Failed to build calendar context:', e);
        }
    }
```

**Replace with:**
```typescript
    // Skip buildCalendarContext for rescheduling/scheduling intents — it takes 5-15s and
    // the CoachContext (already fetched above) has all schedule data needed.
    // buildCalendarContext is only needed for energy/flow bio-context (chronotype, etc.)
    // which is non-essential for block moves. This prevents Vercel 504 timeouts.
    const needsBioContext = intent === CoachIntent.DEEP_WORK_OPTIMIZE || 
                            intent === CoachIntent.ENERGY_OFFSET ||
                            intent === CoachIntent.PROGRESS_CHECK ||
                            intent === CoachIntent.EXPLAIN_SCHEDULE;
    if (!calCtx && supabase && needsBioContext) {
        try {
            calCtx = await buildCalendarContext(context.user_id || context.user?.id, supabase);
        } catch (e) {
            console.warn('[CoachAI] Failed to build calendar context:', e);
        }
    }
```

### Change B — Fix `generateFallbackResponse` for MOVE_BLOCK intent (line ~1566)

**Find** this exact line inside `generateFallbackResponse`:
```typescript
    } else {
        summary = `I'd like to help with that. Let me know more specifics — for example, what time or which block you'd like to change.`;
    }
```

**Replace with:**
```typescript
    } else if (intent === CoachIntent.MOVE_BLOCK) {
        // For rescheduling, try to generate real options from what we have in context
        // Find blocks the user might be referring to
        const allBlocks = [...(coachCtx.schedule?.today || []), ...(coachCtx.schedule?.this_week || [])];
        const missedOrRecentBlocks = allBlocks.filter((b: any) => 
            b.status === 'missed' || b.status === 'planned'
        ).slice(0, 3);
        
        if (missedOrRecentBlocks.length > 0) {
            const blockList = missedOrRecentBlocks.map((b: any) => 
                `"${(b as any).title || b.context}" at ${b.start_time}`
            ).join(', ');
            summary = `I can see blocks in your schedule: ${blockList}. Which one would you like to reschedule, and what time should it move to?`;
        } else {
            summary = `Tell me the block name and time you'd like to move — I'll find the best slot for it.`;
        }
    } else {
        summary = `Let me know what you'd like to adjust — mention a block name or time and I'll take it from there.`;
    }
```

---

## File 4 (FIX): `src/app/api/coach/message/route.ts`

One targeted change. When the intent is `MOVE_BLOCK`, do a server-side lookup to find the specific block the user is referring to, then inject it into the `lightContext` before calling `generateCoachResponse`. This prevents the AI from needing to figure out which block the user means.

**Find** this block (after `intentClassification` is set, before `generateCoachResponse` is called):

```typescript
        const response = await generateCoachResponse(
            message,
            conversationHistory,
            lightContext as any, // We pass lightContext, and generateCoachResponse will upgrade it if needed
            supabase,
            null,
            intentClassification
        );
```

**Replace with:**
```typescript
        // ── Pre-flight block lookup for MOVE_BLOCK intents ───────────────────
        // When the user says "I missed my [BlockName] at [time] today/on [day]",
        // find the block server-side so the AI gets the exact ID and doesn't hallucinate.
        let preResolvedBlock: any = null;
        if (intentClassification.primary_intent === 'move_block') {
            const msgLower = message.toLowerCase();
            // Build date range to search (today ± 7 days)
            const searchDates: string[] = [];
            for (let i = -1; i <= 7; i++) {
                const dt = new Date(new Date().toLocaleDateString('en-CA', { timeZone: timezone }) + 'T12:00:00');
                dt.setDate(dt.getDate() + i);
                searchDates.push(dt.toISOString().split('T')[0]);
            }
            // If user mentions "yesterday", bias toward yesterday; "tomorrow" → tomorrow; day names → that day
            let targetDate = today;
            if (/yesterday/i.test(message)) targetDate = dateFormatter.format(new Date(new Date().getTime() - 86400000));
            else if (/tomorrow/i.test(message)) targetDate = dateFormatter.format(new Date(new Date().getTime() + 86400000));
            else {
                const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
                for (let di = 0; di < days.length; di++) {
                    if (new RegExp(`\\b${days[di]}\\b`, 'i').test(message)) {
                        // Find the most recent occurrence of that day within searchDates
                        const match = searchDates.find(d => new Date(d + 'T12:00:00').getDay() === di);
                        if (match) targetDate = match;
                        break;
                    }
                }
            }

            // Search for the block in schedule_blocks within ± 3 days of targetDate
            const nearbyDates = searchDates.filter(d => Math.abs(new Date(d).getTime() - new Date(targetDate).getTime()) <= 3 * 86400000);
            const { data: candidates } = await supabase
                .from('schedule_blocks')
                .select('id, title, context, date, start_time, end_time, status, block_type, goal_id')
                .eq('user_id', user.id)
                .in('date', nearbyDates);

            if (candidates && candidates.length > 0) {
                // Score candidates by how well they match the message
                const scored = candidates.map((b: any) => {
                    let score = 0;
                    const bTitle = (b.title || b.context || '').toLowerCase();
                    const bWords = bTitle.split(/\s+/);
                    // Title word overlap with user message
                    for (const word of bWords) {
                        if (word.length > 3 && msgLower.includes(word)) score += 2;
                    }
                    // Time match: if user says "10:30" and block is at 10:30
                    const timeMatches = message.match(/\b(\d{1,2}):(\d{2})\b/g) || [];
                    for (const t of timeMatches) {
                        if (b.start_time?.startsWith(t.padStart(5, '0'))) score += 5;
                    }
                    // 12h time match: "10:30am" → "10:30", "2pm" → "14:00"
                    const ampmMatches = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi) || [];
                    for (const t of ampmMatches) {
                        const parts = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
                        if (parts) {
                            let h = parseInt(parts[1]);
                            const m = parseInt(parts[2] || '0');
                            if (parts[3].toLowerCase() === 'pm' && h < 12) h += 12;
                            if (parts[3].toLowerCase() === 'am' && h === 12) h = 0;
                            const t24 = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                            if (b.start_time?.startsWith(t24)) score += 5;
                        }
                    }
                    // Missed/planned status boost
                    if (b.status === 'missed') score += 3;
                    if (b.date === today) score += 1;
                    return { block: b, score };
                });
                scored.sort((a: any, b: any) => b.score - a.score);
                if (scored[0].score > 0) {
                    preResolvedBlock = scored[0].block;
                }
            }
        }

        const enhancedLightContext = {
            ...lightContext,
            pre_resolved_block: preResolvedBlock, // Passed to response-generator for use in findMissedBlock
        };

        const response = await generateCoachResponse(
            message,
            conversationHistory,
            enhancedLightContext as any,
            supabase,
            null,
            intentClassification
        );
```

---

## Summary

| File | Type | What changes |
|------|------|-------------|
| `src/app/api/coach/quick-action/route.ts` | **CREATE** | New endpoint for Reduce Load + Fix Today. Pure TS, no AI, no timeout risk. Uses `findFreeSlot` algorithm respecting wake/sleep/wind-down/morning-routine/body-day rules. Returns ops + human-readable summary. |
| `src/components/coach/CoachChat.tsx` | **REWRITE** | 2 center bubbles (not 4), no bottom chip strip, `handleQuickAction` calls new endpoint, synthetic message display, "Review & Execute" inline option cards, `handleOptionSelect` handles both synthetic and real message options. |
| `src/lib/coach/response-generator.ts` | **FIX (2 lines)** | Skip `buildCalendarContext` for rescheduling intents (fixes 504). Fix `generateFallbackResponse` MOVE_BLOCK case (fixes "I'd like to help" dead-end). |
| `src/app/api/coach/message/route.ts` | **FIX (1 block)** | Pre-flight block lookup for MOVE_BLOCK intent — finds the exact block server-side and passes it to the response generator via `enhancedLightContext.pre_resolved_block`. |

**Do not touch** any other files: `CoachDashboard.tsx`, `use-coach.ts`, `apply/route.ts`, `undo/route.ts`, `context-builder.ts`, `intent-classifier.ts`, `CoachMessageBubble.tsx`, `ConfirmationModal.tsx`.

**Scheduling rules that must hold** in the quick-action route (enforced by `findFreeSlot`):
- No blocks before `wake_time + morning_routine_mins`
- No blocks after `sleep_time - wind_down_mins`
- No overlapping with any existing blocks on that date (regardless of type)
- Body pillar goal blocks: never scheduled on a day that already has a body goal block
- Mind/craft: two blocks of the same goal on the same day are allowed if needed
- Minimum block duration: 30 minutes
- Weekend days are valid targets for rescheduling
