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
 */
function findFreeSlot(
    allBlocks: Block[],
    date: string,
    durationMins: number,
    wakeTime: string,
    sleepTime: string,
    windDownMins: number,
    morningRoutineMins: number,
    notBeforeTime?: string
): { start: string; end: string; actualDuration: number } | null {
    const wakeMins = timeToMinutes(wakeTime);
    const sleepMins = timeToMinutes(sleepTime) === 0 ? 1440 : timeToMinutes(sleepTime);

    const windDownStart = ((sleepMins - windDownMins) + 1440) % 1440;
    const scheduleStart = wakeMins + morningRoutineMins;
    // Sleep after midnight puts wind-down numerically before wake — cap the
    // schedulable day at midnight instead of producing an empty window.
    let scheduleEnd = windDownStart === 0 ? 1440 : windDownStart;
    if (scheduleEnd <= scheduleStart) scheduleEnd = 1440;

    let cursor = scheduleStart;
    if (notBeforeTime) {
        cursor = Math.max(cursor, timeToMinutes(notBeforeTime));
    }

    const dayBlocks = allBlocks
        .filter(b => b.date === date && b.status !== 'missed')
        .map(b => ({ start: timeToMinutes(b.start_time), end: timeToMinutes(b.end_time) }))
        .sort((a, b) => a.start - b.start);

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
        const { action, clientDate, clientTime, clientTimezone } = body as {
            action: string;
            clientDate?: string;     // "YYYY-MM-DD" in user's local timezone — sent by browser
            clientTime?: string;     // "HH:MM" 24h in user's local timezone — sent by browser
            clientTimezone?: string; // IANA timezone string e.g. "Asia/Kolkata"
        };

        if (!action || !['reduce_today_load', 'fix_today_schedule', 'do_more_today'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        const QUICK_ACTION_LABELS: Record<string, string> = {
            reduce_today_load: "Reduce Today's Load",
            fix_today_schedule: "Fix Today's Schedule",
            do_more_today: "Do More Today",
        };
        const quickLabel = QUICK_ACTION_LABELS[action];

        // Persist the quick action as a coach conversation so it shows up in the
        // Coach Hub sidebar and reloads read-only — exactly like manual prompts.
        const persistQuickChat = async (summary: string, ops: any[], impact: string, customOptions?: any[]): Promise<{ conversationId: string | null; optionId: string }> => {
            const optionId = 'opt_quick_1';
            try {
                const nowIso = new Date().toISOString();
                const { data: conv, error: convError } = await supabase
                    .from('coach_conversations')
                    .insert({
                        user_id: user.id,
                        status: 'active',
                        started_at: nowIso,
                        last_message_at: nowIso,
                        primary_topic: quickLabel,
                        total_messages: 2,
                    })
                    .select('id')
                    .single();

                if (convError || !conv) {
                    console.warn('[QuickAction] Failed to create conversation:', convError);
                    return { conversationId: null, optionId };
                }

                await supabase.from('coach_messages').insert({
                    conversation_id: conv.id,
                    user_id: user.id,
                    role: 'user',
                    content: quickLabel,
                    created_at: nowIso,
                });

                let finalOptions = customOptions || null;
                if (!finalOptions && ops.length > 0) {
                    finalOptions = [{
                        id: optionId,
                        title: quickLabel,
                        description: summary,
                        impact,
                        recommended: true,
                        ledger: {
                            ops,
                            operations: ops,
                            undoable: true,
                            scope: 'week',
                            reason: quickLabel,
                            requires_confirmation: false,
                        },
                    }];
                }

                await supabase.from('coach_messages').insert({
                    conversation_id: conv.id,
                    user_id: user.id,
                    role: 'assistant',
                    content: summary,
                    mode: finalOptions ? 'propose' : 'normal',
                    options: finalOptions,
                    created_at: new Date(Date.now() + 1000).toISOString(),
                });

                return { conversationId: conv.id, optionId };
            } catch (e) {
                console.error('[QuickAction] Failed to persist conversation:', e);
                return { conversationId: null, optionId };
            }
        };

        // ── Profile: timezone + sleep/routine settings ────────────────────────
        const { data: profile } = await supabase
            .from('profiles')
            .select('timezone, sleep_start, sleep_end, wind_down_mins, morning_routine_mins, first_name')
            .eq('id', user.id)
            .single();

        const wakeTime = profile?.sleep_end || '07:00';
        const sleepTime = profile?.sleep_start || '23:00';
        const windDownMins = profile?.wind_down_mins || 30;
        const morningRoutineMins = profile?.morning_routine_mins || 0;

        const now = new Date();

        // Prefer client-supplied values — the browser knows the user's local time exactly.
        // Fall back to server-side calculation only if the client didn't send them.
        const resolvedTimezone = clientTimezone || profile?.timezone || 'UTC';
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: resolvedTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: resolvedTimezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const today = clientDate || dateFormatter.format(now);
        const currentTime = clientTime || timeFormatter.format(now);

        // Build remaining days this week (today through Sunday)
        const remainingDates: string[] = [];
        let d = today;
        for (let i = 0; i < 7; i++) {
            remainingDates.push(d);
            if (new Date(d + 'T12:00:00').getDay() === 0) break;
            d = addDays(d, 1);
        }
        const futureDates = remainingDates.slice(1);

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
            const actionableToday = todayBlocks.filter(b =>
                b.block_type === 'goal' && b.status !== 'done' && b.goal_id
            );

            const highPriorityKept: Block[] = [];
            const candidates: Block[] = [];

            for (const block of actionableToday) {
                const goal = goals.find(g => g.id === block.goal_id);
                if (!goal) continue;
                if (isHighPriority(goal)) {
                    highPriorityKept.push(block);
                } else {
                    candidates.push(block);
                }
            }

            const ops: any[] = [];
            const movedResults: Array<{ block: Block; toDate: string; toStart: string; toEnd: string; dayName: string }> = [];
            const droppedResults: Block[] = [];

            const tentativeByDate = new Map<string, Array<{ start: number; end: number }>>();
            for (const date of futureDates) tentativeByDate.set(date, []);

            for (const candidate of candidates) {
                const durationMins = timeToMinutes(candidate.end_time) - timeToMinutes(candidate.start_time);
                const effectiveDuration = Math.max(durationMins, 30);
                const candidateGoal = goals.find(g => g.id === candidate.goal_id);

                let placed = false;
                for (const futureDate of futureDates) {
                    if (candidateGoal?.pillar === 'body' && hasBodyBlockOnDay(allBlocks, goals, futureDate)) continue;

                    const tentative = tentativeByDate.get(futureDate) || [];
                    const combinedBlocks: Block[] = [
                        ...allBlocks.filter(b => b.date === futureDate),
                        ...tentative.map(t => ({
                            id: 'tentative',
                            date: futureDate,
                            start_time: minutesToTime(t.start),
                            end_time: minutesToTime(t.end),
                            title: 'tentative',
                            block_type: 'goal',
                            status: 'planned',
                        })),
                    ];

                    const slot = findFreeSlot(combinedBlocks, futureDate, effectiveDuration, wakeTime, sleepTime, windDownMins, morningRoutineMins);

                    if (slot) {
                        ops.push({
                            type: 'move_block',
                            block_id: candidate.id,
                            title: candidate.title || candidate.context,
                            new_start: slot.start,
                            new_end: slot.end,
                            new_date: futureDate,
                        });
                        movedResults.push({ block: candidate, toDate: futureDate, toStart: slot.start, toEnd: slot.end, dayName: getDayName(futureDate) });
                        const tent = tentativeByDate.get(futureDate) || [];
                        tent.push({ start: timeToMinutes(slot.start), end: timeToMinutes(slot.end) });
                        tentativeByDate.set(futureDate, tent);
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    ops.push({ type: 'delete_block', block_id: candidate.id, title: candidate.title || candidate.context });
                    droppedResults.push(candidate);
                }
            }

            const keptNames = highPriorityKept.map(b => `"${b.title || b.context}"`).join(', ');
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

            const impact = `${movedResults.length} block${movedResults.length !== 1 ? 's' : ''} rescheduled${droppedResults.length ? `, ${droppedResults.length} dropped` : ''}`;
            const { conversationId, optionId } = await persistQuickChat(summary.trim(), ops, impact);

            return NextResponse.json({
                success: true,
                summary: summary.trim(),
                ops,
                conversation_id: conversationId,
                option_id: optionId,
                meta: { kept: highPriorityKept.length, moved: movedResults.length, dropped: droppedResults.length },
            });
        }

        // ── BRANCH: fix_today_schedule ────────────────────────────────────────
        if (action === 'fix_today_schedule') {
            const currentMins = timeToMinutes(currentTime);

            const overdue = todayBlocks.filter(b =>
                b.block_type === 'goal' &&
                b.status !== 'done' &&
                timeToMinutes(b.start_time) < currentMins
            );

            if (overdue.length === 0) {
                const noOpSummary = `No overdue blocks found before ${fmt24(currentTime)}. Your remaining schedule looks good.`;
                const { conversationId, optionId } = await persistQuickChat(noOpSummary, [], 'No changes needed');
                return NextResponse.json({
                    success: true,
                    summary: noOpSummary,
                    ops: [],
                    conversation_id: conversationId,
                    option_id: optionId,
                    meta: { moved: 0, dropped: 0 },
                });
            }

            const ops: any[] = [];
            const movedResults: Array<{ block: Block; toDate: string; toStart: string; toEnd: string; dayName: string; sameDay: boolean }> = [];
            const droppedResults: Block[] = [];

            const tentativeByDate = new Map<string, Array<{ start: number; end: number }>>();
            for (const date of [today, ...futureDates]) tentativeByDate.set(date, []);

            for (const block of overdue) {
                const durationMins = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
                const effectiveDuration = Math.max(durationMins, 30);
                const blockGoal = goals.find(g => g.id === block.goal_id);
                let placed = false;

                // 1. Try later today
                if (!placed) {
                    const tentToday = tentativeByDate.get(today) || [];
                    const combined: Block[] = [
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
                        const combined: Block[] = [
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

                if (!placed) droppedResults.push(block);
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

            const impact = `${movedResults.length} block${movedResults.length !== 1 ? 's' : ''} rescheduled${droppedResults.length ? `, ${droppedResults.length} dropped` : ''}`;
            const { conversationId, optionId } = await persistQuickChat(summary.trim(), ops, impact);

            return NextResponse.json({
                success: true,
                summary: summary.trim(),
                ops,
                conversation_id: conversationId,
                option_id: optionId,
                meta: { moved: movedResults.length, dropped: droppedResults.length },
            });
        }


        // ── BRANCH: do_more_today ────────────────────────────────────────
        if (action === 'do_more_today') {
            const todayStr = clientDate;
            const currentTime = clientTime;

            // 1. Filter candidates: from all blocks from tomorrow onwards, take the `type === 'goal'` blocks whose `status` is not done (empty or null).
            let candidates = allBlocks.filter(b => b.date > todayStr && b.block_type === 'goal' && (b.status === '' || b.status === null || b.status === undefined));

            // 2. Never move Body-pillar blocks; if a candidate would result in two body blocks today, skip it.
            // (The prompt says: "skip any block with pillar === 'body'")
            candidates = candidates.filter(b => {
                const goal = goals.find(g => g.id === b.goal_id);
                return !(goal && goal.pillar === 'body');
            });

            // 3. Sort them chronologically. (already chronologically sorted by date/time since sortedBlocks is)
            
            // 4. Calculate free time today (`findFreeSlot(todayDate, ...)` without needing a specific duration, just see total free minutes).
            // Actually, we don't need to manually sum free time, we can just use tentative placement for Option 1, 2, and 3.

            const options: any[] = [];
            
            // We want exactly 3 options: move 1 block, move 2 blocks, move 3 blocks.
            for (let numToMove = 1; numToMove <= 3; numToMove++) {
                const blocksToMove = candidates.slice(0, numToMove);
                const ops: any[] = [];
                let tentativeDayBlocks = [...allBlocks];
                let allPlaced = true;
                
                for (const b of blocksToMove) {
                    const blockDuration = timeToMinutes(b.end_time) - timeToMinutes(b.start_time);
                    const slot = findFreeSlot(tentativeDayBlocks, todayStr, blockDuration, profile?.wake_time || '07:00', profile?.sleep_time || '23:00', 60, 30, currentTime);
                    
                    if (slot) {
                        ops.push({
                            op: 'update_block',
                            block_id: b.id,
                            changes: {
                                date: todayStr,
                                start_time: slot.start,
                                end_time: slot.end
                            }
                        });
                        // Add tentative block for subsequent placements
                        tentativeDayBlocks.push({
                            ...b,
                            date: todayStr,
                            start_time: slot.start,
                            end_time: slot.end
                        });
                    } else {
                        allPlaced = false;
                        break;
                    }
                }
                
                if (blocksToMove.length === 0) {
                    // No candidates at all
                    allPlaced = false;
                }

                // If all placed successfully and we found the exact number requested
                const success = allPlaced && ops.length === numToMove;
                
                // Construct the description
                let title = `Move ${numToMove} block${numToMove > 1 ? 's' : ''}`;
                let description = success ? `Move ${ops.map(op => {
                    const block = candidates.find(b => b.id === op.block_id);
                    return `"${block?.title}"`;
                }).join(', ')} to today.` : `Not enough free time to move ${numToMove} block${numToMove > 1 ? 's' : ''}.`;
                
                options.push({
                    id: `do_more_today_${numToMove}`,
                    title: title,
                    description: description,
                    impact: success ? `Moved ${numToMove} future block${numToMove > 1 ? 's' : ''} to today's schedule.` : `Requires more free time.`,
                    disabled: !success,
                    ledger: success ? { ops, meta: {} } : undefined
                });
            }

            // In this flow only, same-goal repetition is allowed, but we don't return the full summary/ops until they select an option.
            let summary = options.every(o => o.disabled) 
                ? "You don't have enough free time to move any blocks to today."
                : "I found some future blocks you can tackle today. How many would you like to move?";
            
            const { conversationId } = await persistQuickChat(summary, [], "Proposed options to do more today", options);

            return NextResponse.json({
                success: true,
                summary: summary,
                options: options,
                proposed_options: options, // some front-end versions look for proposed_options
                mode: 'PROPOSE_OPTIONS',
                execution_mode: 'PROPOSE_OPTIONS',
                conversation_id: conversationId,
                meta: { num_candidates: candidates.length },
            });
        }

        return NextResponse.json({ success: false, error: 'Unhandled action' }, { status: 400 });
    },
    { requireAuth: true, rateLimit: 'aiCoach', auditAction: 'coach_quick_action' }
);
