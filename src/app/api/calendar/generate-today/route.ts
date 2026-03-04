import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { callAI } from '@/lib/ai/unified-client';
import { format } from 'date-fns';

export const maxDuration = 45;
export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { date, force } = body as { date?: string; force?: boolean };

        const targetDate = date || format(new Date(), 'yyyy-MM-dd');
        const dayName = format(new Date(targetDate + 'T12:00:00'), 'EEEE');

        try {
            // 1. Build context (includes goals, commitments, habit stacks, performance)
            const ctx = await buildCalendarContext(userId, supabase);

            const wakeTime = ctx.user.sleep_end || '07:00';
            const sleepTime = ctx.user.sleep_start || '23:00';
            const windDownMins = ctx.user.wind_down_mins || 30;

            // Calculate wind-down time
            const sleepMins = parseInt(sleepTime.split(':')[0]) * 60 + parseInt(sleepTime.split(':')[1] || '0');
            const windDownStart = sleepMins - windDownMins;
            const windDownTime = `${Math.floor(windDownStart / 60).toString().padStart(2, '0')}:${(windDownStart % 60).toString().padStart(2, '0')}`;

            // Check for existing blocks today
            const { data: existingBlocks } = await supabase
                .from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .eq('date', targetDate)
                .order('start_time');

            // If >3 blocks exist and user didn't force regeneration, warn them
            if (!force && existingBlocks && existingBlocks.length > 3) {
                return apiSuccess({
                    message: 'You already have a schedule for today. Use force=true to clear and regenerate.',
                    has_existing: true,
                    blocks_count: existingBlocks.length,
                    options: []
                });
            }

            // If force=true and existing blocks, clear them first
            if (force && existingBlocks && existingBlocks.length > 0) {
                const nonFixedIds = existingBlocks
                    .filter((b: any) => !b.is_fixed && !b.commitment_id)
                    .map((b: any) => b.id);
                if (nonFixedIds.length > 0) {
                    await supabase
                        .from('schedule_blocks')
                        .delete()
                        .in('id', nonFixedIds)
                        .eq('user_id', userId);
                }
            }

            // 2. Build rich context for AI prompt
            const goalsText = ctx.goals.length > 0
                ? ctx.goals.map(g =>
                    `  - ${g.title} (Pillar: ${g.pillar.toUpperCase()}, Energy: ${g.energy_demand}, ${g.minutes_per_day}min/day) → ID: ${g.id}`
                ).join('\n')
                : '  (No goals — generate general productivity blocks like "Deep Work", "Exercise", "Learning")';

            const commitmentsText = ctx.commitments.length > 0
                ? ctx.commitments.filter(c => {
                    const dow = new Date(targetDate + 'T12:00:00').getDay();
                    return (c.days_of_week || []).includes(dow as any);
                }).map(c =>
                    `  - "${c.title}": ${c.start_time}–${c.end_time} (FIXED — DO NOT MOVE OR OVERLAP)`
                ).join('\n')
                : '  (No fixed commitments today)';

            const habitStacksText = ctx.habitStacks.length > 0
                ? ctx.habitStacks.map(h =>
                    `  - When doing "${h.trigger_habit}" → also do "${h.action_habit}" (${h.action_duration_mins}min)`
                ).join('\n')
                : '  (No habit stacks)';

            const existingText = existingBlocks && existingBlocks.length > 0 && !force
                ? existingBlocks.map((b: any) => `  - ${b.start_time}–${b.end_time}: ${b.title} [${b.status}]`).join('\n')
                : '  (Clean slate — plan the entire day)';

            const energyLevel = ctx.performance.last_7_days_completion_rate > 70
                ? 'High (user has been consistent — plan a full day)'
                : ctx.performance.last_7_days_completion_rate > 40
                    ? 'Moderate (plan a realistic day, don\'t overpack)'
                    : 'Low (user is struggling — plan a lighter day with more breaks)';

            // 3. Construct the AI prompt
            const systemPrompt = `You are PlannrAI's Day Architect. Your job is to create the perfect daily schedule that helps ${ctx.user.first_name} achieve their goals while maintaining flow state and balance.

CORE PRINCIPLES:
1. COVER THE ENTIRE DAY from ${wakeTime} (wake) to ${windDownTime} (wind-down)
2. Schedule HIGH-ENERGY goal blocks in the morning (9am–12pm) for deep focus
3. Schedule CREATIVE/MODERATE blocks mid-morning and early afternoon
4. Schedule LIGHT/ADMIN blocks after lunch (1pm–3pm) when energy dips
5. Schedule BODY/EXERCISE in late afternoon (4pm–6pm) for energy renewal
6. Every block MUST have a concrete checklist of 2-4 specific action steps
7. Include meals: Breakfast (~30min), Lunch (~45min), Dinner (~45min)
8. Include 10-15min buffer/transition blocks between different activity types
9. Morning Routine should include the user's habit stacks
10. NEVER overlap with fixed commitments
11. Make it REALISTIC — no more than 3-4 hours of deep focused work
12. Include downtime/free blocks — humans need rest
13. Wind-down routine before sleep

BLOCK TYPES (use these exactly):
- "routine" → Morning/Evening routines
- "focus" → Deep work, goal-focused blocks
- "body" → Exercise, walks, stretching
- "meal" → Breakfast, Lunch, Dinner, Snack
- "break" → Buffer, transition, free time
- "mind" → Reading, meditation, learning
- "craft" → Creative/professional skill work
- "task" → Admin, errands, misc tasks

Return valid JSON only.`;

            const userPrompt = `PLAN ${ctx.user.first_name}'s ${dayName}

━━━ TIME WINDOW ━━━
Wake: ${wakeTime}
Wind-down: ${windDownTime}
Sleep: ${sleepTime}

━━━ GOALS TO SCHEDULE ━━━
${goalsText}

━━━ FIXED COMMITMENTS (DO NOT OVERLAP) ━━━
${commitmentsText}

━━━ HABIT STACKS (integrate into routines) ━━━
${habitStacksText}

━━━ EXISTING BLOCKS ━━━
${existingText}

━━━ ENERGY & CAPACITY ━━━
- Awake hours: ${ctx.capacity.daily_awake_hours}h
- Energy level: ${energyLevel}
- 7-day completion rate: ${ctx.performance.last_7_days_completion_rate}%

━━━ OUTPUT FORMAT ━━━
{
  "blocks": [
    {
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "title": "Block Title",
      "block_type": "routine|focus|body|meal|break|mind|craft|task",
      "goal_id": "uuid-if-linked-to-goal-or-null",
      "pillar": "mind|body|craft|soul|null",
      "checklist": [
        {"text": "Specific action step 1"},
        {"text": "Specific action step 2"},
        {"text": "Specific action step 3"}
      ]
    }
  ],
  "summary": "Concise 1-line summary of today's plan",
  "philosophy": "Brief approach note for the day"
}

IMPORTANT:
- Use 24-hour HH:MM format for all times
- Each block should be 20-90 minutes
- Include ALL time from ${wakeTime} to ${windDownTime}
- For goal blocks, use the exact goal ID from the list above
- Morning Routine checklist should include habit stacks from above
- Generate a COMPLETE schedule — no gaps`;

            // 4. Call AI
            const response = await callAI<{ blocks: any[]; summary: string; philosophy: string }>({
                prompt: userPrompt,
                systemPrompt,
                model: 'smart',
                temperature: 0.6,
                maxTokens: 4000,
                requireJSON: true,
                timeout: 35000,
            });

            let blocks: any[];
            let summary: string;
            let philosophy: string;

            if (response.success && response.data?.blocks?.length) {
                blocks = response.data.blocks;
                summary = response.data.summary || 'AI-generated day schedule';
                philosophy = response.data.philosophy || 'Balanced approach for today';
            } else {
                // Fallback: generate deterministic schedule
                console.warn('[GenerateToday] AI failed, using fallback:', response.error);
                const fb = generateFallbackDay(ctx, targetDate, wakeTime, windDownTime);
                blocks = fb.blocks;
                summary = fb.summary;
                philosophy = fb.philosophy;
            }

            // 5. Clean and validate blocks — resolve goal IDs
            const goalMap = new Map(ctx.goals.map(g => [g.id, g]));
            const goalsByTitle = new Map(ctx.goals.map(g => [g.title.toLowerCase(), g]));

            const cleanBlocks = blocks
                .filter((b: any) => b.start_time && b.end_time)
                .map((b: any) => {
                    let resolvedGoalId: string | null = null;
                    if (b.goal_id && goalMap.has(b.goal_id)) {
                        resolvedGoalId = b.goal_id;
                    } else if (b.goal_id) {
                        const titleLower = (b.title || '').toLowerCase();
                        for (const [gTitle, goal] of goalsByTitle) {
                            if (titleLower.includes(gTitle) || gTitle.includes(titleLower)) {
                                resolvedGoalId = goal.id;
                                break;
                            }
                        }
                    }

                    return {
                        date: targetDate,
                        start_time: b.start_time,
                        end_time: b.end_time,
                        title: b.title || 'Block',
                        block_type: b.block_type || 'task',
                        goal_id: resolvedGoalId,
                        pillar: b.pillar || null,
                        status: 'planned',
                        checklist: Array.isArray(b.checklist) ? b.checklist : [],
                    };
                });

            // 6. Return as a single option to auto-apply
            const option = {
                id: 'today_schedule',
                label: `${dayName} Schedule`,
                description: summary,
                tradeoff: philosophy,
                patch: {
                    ops: cleanBlocks.map((b: any) => ({
                        op: 'create_event' as const,
                        payload: b
                    })),
                    undoable: true,
                    reason: `Generate Today: ${dayName} Schedule`,
                },
            };

            return apiSuccess({
                plan_summary: summary,
                options: [option],
                warnings: [],
            });

        } catch (e: any) {
            console.error('[GenerateToday] Error:', e);
            return apiError(`Schedule generation failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);

function generateFallbackDay(
    ctx: any,
    date: string,
    wakeTime: string,
    windDownTime: string
) {
    const timeToMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    const minutesToTime = (mins: number) => {
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
    };

    const blocks: any[] = [];
    const wakeMins = timeToMinutes(wakeTime);
    const windDownMins = timeToMinutes(windDownTime);
    let cursor = wakeMins;

    // Morning Routine (with habit stacks)
    const morningChecklist = [
        { text: 'Stretch for 5 minutes' },
        { text: 'Meditate or breathe for 5 minutes' },
        { text: 'Review today\'s priorities' },
    ];
    if (ctx.habitStacks?.length > 0) {
        ctx.habitStacks.slice(0, 2).forEach((h: any) => {
            morningChecklist.push({ text: `${h.action_habit} (${h.action_duration_mins}min)` });
        });
    }
    blocks.push({
        date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 30),
        title: 'Morning Routine', block_type: 'routine',
        checklist: morningChecklist,
    });
    cursor += 40;

    // Breakfast
    blocks.push({
        date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 30),
        title: 'Breakfast', block_type: 'meal',
        checklist: [{ text: 'Prepare and eat a healthy breakfast' }],
    });
    cursor += 40;

    // High-energy goal blocks (morning)
    const highEnergyGoals = ctx.goals.filter((g: any) => g.energy_demand === 'high' || g.pillar === 'craft');
    const otherGoals = ctx.goals.filter((g: any) => g.energy_demand !== 'high' && g.pillar !== 'craft');

    for (const goal of highEnergyGoals.slice(0, 2)) {
        if (cursor >= 12 * 60) break;
        const dur = Math.min(goal.minutes_per_day || 60, 90);
        blocks.push({
            date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + dur),
            title: goal.title, block_type: 'focus', goal_id: goal.id, pillar: goal.pillar,
            checklist: [
                { text: `Focus on ${goal.title} — main task` },
                { text: 'Review progress at end' },
            ],
        });
        cursor += dur + 15; // 15min buffer
    }

    // Remaining morning goals
    for (const goal of otherGoals.slice(0, 1)) {
        if (cursor >= 12 * 60 + 30) break;
        const dur = Math.min(goal.minutes_per_day || 45, 60);
        blocks.push({
            date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + dur),
            title: goal.title, block_type: 'focus', goal_id: goal.id, pillar: goal.pillar,
            checklist: [{ text: `Work on ${goal.title}` }],
        });
        cursor += dur + 10;
    }

    // Lunch
    const lunchStart = Math.max(cursor, 12 * 60 + 30);
    blocks.push({
        date, start_time: minutesToTime(lunchStart), end_time: minutesToTime(lunchStart + 45),
        title: 'Lunch', block_type: 'meal',
        checklist: [{ text: 'Eat lunch and take a proper break' }],
    });
    cursor = lunchStart + 60;

    // Afternoon: lighter goals/tasks
    for (const goal of otherGoals.slice(1, 3)) {
        if (cursor >= 17 * 60) break;
        const dur = Math.min(goal.minutes_per_day || 45, 60);
        blocks.push({
            date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + dur),
            title: goal.title, block_type: 'focus', goal_id: goal.id, pillar: goal.pillar,
            checklist: [{ text: `Work on ${goal.title}` }],
        });
        cursor += dur + 15;
    }

    // Exercise (if no body goals already)
    if (!ctx.goals.some((g: any) => g.pillar === 'body') && cursor < 17 * 60 + 30) {
        const exStart = Math.max(cursor, 16 * 60 + 30);
        blocks.push({
            date, start_time: minutesToTime(exStart), end_time: minutesToTime(exStart + 45),
            title: 'Exercise / Walk', block_type: 'body',
            checklist: [{ text: 'Warm up for 5 minutes' }, { text: 'Main workout / walk' }, { text: 'Cool down and stretch' }],
        });
        cursor = exStart + 60;
    }

    // Free Time
    if (cursor < 18 * 60 + 30) {
        blocks.push({
            date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 45),
            title: 'Free Time', block_type: 'break',
            checklist: [{ text: 'Relax, hobby, or social time' }],
        });
        cursor += 60;
    }

    // Dinner
    const dinnerStart = Math.max(cursor, 19 * 60);
    if (dinnerStart < windDownMins - 60) {
        blocks.push({
            date, start_time: minutesToTime(dinnerStart), end_time: minutesToTime(dinnerStart + 45),
            title: 'Dinner', block_type: 'meal',
            checklist: [{ text: 'Prepare and eat dinner' }],
        });
        cursor = dinnerStart + 60;
    }

    // Evening wind-down
    if (cursor < windDownMins) {
        blocks.push({
            date, start_time: minutesToTime(cursor), end_time: minutesToTime(Math.min(cursor + 60, windDownMins)),
            title: 'Evening Free Time', block_type: 'break',
            checklist: [{ text: 'Reading, journaling, or leisure' }],
        });
    }

    // Wind Down
    blocks.push({
        date, start_time: windDownTime, end_time: minutesToTime(timeToMinutes(windDownTime) + 30),
        title: 'Wind Down', block_type: 'routine',
        checklist: [{ text: 'No screens' }, { text: 'Reflect on the day' }, { text: 'Prepare for tomorrow' }],
    });

    return {
        blocks,
        summary: `${blocks.length} blocks from ${wakeTime} to wind-down — goals, meals, movement, and rest`,
        philosophy: 'A balanced day structure focused on flow and recovery.',
    };
}
