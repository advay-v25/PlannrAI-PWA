import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { callAI } from '@/lib/ai/unified-client';
import { format } from 'date-fns';

export const maxDuration = 60;
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

            // If force=true and existing blocks, clear ALL of them for a clean slate
            if (force && existingBlocks && existingBlocks.length > 0) {
                const blockIds = existingBlocks.map((b: any) => b.id);
                if (blockIds.length > 0) {
                    await supabase
                        .from('schedule_blocks')
                        .delete()
                        .in('id', blockIds)
                        .eq('user_id', userId);
                }
            }

            // 2. Build rich context for AI prompt
            const goalsText = ctx.goals.length > 0
                ? ctx.goals.map(g =>
                    `  - ${g.title} (Pillar: ${g.pillar.toUpperCase()}, Energy: ${g.energy_demand}, ${g.minutes_per_day}min/day) → ID: ${g.id}\n    AI Strategy: ${g.ai_strategy ? JSON.stringify(g.ai_strategy) : 'None'}`
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

            // Bio-context from onboarding
            const userEnergy = ctx.user.energy_level || 5;
            const userStress = ctx.user.stress_level || 3;
            const chronotype = ctx.user.chronotype || 'bear';
            const mealsPerDay = ctx.user.meals_per_day || 3;
            const mealWindows = ctx.user.meal_windows || {};

            // Compute energy level from both profile and performance
            const perfRate = ctx.performance.last_7_days_completion_rate;
            let energyLevel: string;
            if (userEnergy >= 7 && perfRate > 70) {
                energyLevel = 'High (user has good energy and is consistent — plan a productive day)';
            } else if (userEnergy >= 4 && perfRate > 40) {
                energyLevel = 'Moderate (plan a realistic day, don\'t overpack)';
            } else if (userStress >= 7) {
                energyLevel = 'Low-Stressed (user is stressed — plan a LIGHTER day with extra breaks and breathing room)';
            } else {
                energyLevel = 'Low (user is struggling — plan a gentle day with few goals and lots of rest)';
            }

            // Chronotype-specific scheduling rules
            const chronotypeRules = chronotype === 'early_bird' || chronotype === 'lark'
                ? 'User is an EARLY BIRD: schedule deep work EARLY (7am-11am). Lighter tasks in afternoon.'
                : chronotype === 'night_owl' || chronotype === 'owl'
                    ? 'User is a NIGHT OWL: schedule deep work LATE (11am-3pm, 4pm-8pm). Light mornings.'
                    : chronotype === 'wolf'
                        ? 'User is a WOLF: peak productivity LATE (1pm-8pm). Easy mornings.'
                        : 'User is a BEAR (default): deep work MID-MORNING (9am-12pm). Standard schedule.';


            // 3. Construct the AI prompt
            const systemPrompt = `You are PlannrAI's Day Architect. Your job is to create the perfect daily schedule that helps ${ctx.user.first_name} achieve their goals while maintaining flow state and balance.

CORE PRINCIPLES:
1. COVER THE ENTIRE DAY from ${wakeTime} (wake) to ${windDownTime} (wind-down)
2. Schedule HIGH-ENERGY goal blocks in the morning (9am–12pm) for deep focus
3. Schedule CREATIVE/MODERATE blocks mid-morning and early afternoon
4. Schedule LIGHT/ADMIN blocks after lunch (1pm–3pm) when energy dips
5. Schedule BODY/EXERCISE in late afternoon (4pm–6pm) for energy renewal
6. Every block MUST have a concrete checklist of 2-4 specific action steps
7. Include meals AT REALISTIC TIMES: Breakfast (~30m), Lunch (~45m around 12:30-13:30), Dinner (~45m around 18:30-19:30). DO NOT schedule Dinner early at 18:00.
8. Include 10-15min 'Buffer' blocks between distinct activities (e.g. Work and Workout)
9. Morning Routine should include the user's habit stacks
10. NEVER overlap with fixed commitments
11. NEVER schedule ANYTHING within 30 minutes before or after a fixed commitment — this is travel/transition time. Leave those slots EMPTY.
12. Make it REALISTIC — no more than 3-4 hours of deep focused work
13. Include downtime/free blocks — humans need rest
14. Wind-down routine before sleep
15. MAX 1 body/exercise block per day for busy professionals. MAX 2 for fitness-focused users.
16. MAX 3-5 goal blocks per day — SPREAD goals across the WEEK. Today should not try to cover ALL goals.
17. Do NOT pack the day — leave breathing room between blocks
18. FLOW STATE: NEVER schedule two goals of the SAME PILLAR consecutively. You MUST alternate pillars (e.g., MIND -> BODY -> CRAFT) or insert a BREAK/BUFFER to maintain flow.
19. ZERO OVERLAP: NEVER allow multiple blocks to exist at the exact same start_time. Every block MUST have a distinct, non-overlapping time slot.
20. CHECKLIST SYNC: For every 'goal' block you schedule, you MUST examine its provided 'AI Strategy' to generate a realistic 2-3 item 'checklist'. Extract the most immediate actionable steps from the strategy.

BLOCK TYPES (use these exactly):
- "routine" → Morning/Evening routines
- "focus" → Deep work, goal-focused blocks
- "body" → Exercise, walks, stretching
- "meal" → Breakfast, Lunch, Dinner, Snack
- "break" → Buffer, transition, free time
- "mind" → Reading, meditation, learning
- "craft" → Creative/professional skill work
- "task" → Admin, errands, misc tasks

BIO-CONTEXT:
- ${chronotypeRules}
- User energy: ${userEnergy}/10, Stress: ${userStress}/10
- Plan density should match energy level. HIGH stress = MORE breaks, FEWER goal blocks.
- Meals per day: ${mealsPerDay}
${mealWindows?.breakfast ? `- Breakfast window: ${mealWindows.breakfast.start}–${mealWindows.breakfast.end}` : ''}
${mealWindows?.lunch ? `- Lunch window: ${mealWindows.lunch.start}–${mealWindows.lunch.end}` : ''}
${mealWindows?.dinner ? `- Dinner window: ${mealWindows.dinner.start}–${mealWindows.dinner.end}` : ''}

Return valid JSON only.`;


            const userPrompt = `PLAN ${ctx.user.first_name}'s ${dayName} (${targetDate})

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
- Generate a COMPLETE schedule — no gaps
- RESPECT the 30 minute buffer around fixed commitments — NO blocks within 30 minutes before or after!
- MAX 1 body/exercise block (2 if user is fitness-focused)
- MAX 5 goal blocks — spread goals across the week, not all today
- Do NOT overschedule — quality over quantity`;

            // 4. Call AI
            const response = await callAI<{ blocks: any[]; summary: string; philosophy: string }>({
                prompt: userPrompt,
                systemPrompt,
                model: 'smart',
                temperature: 0.6,
                maxTokens: 4000,
                requireJSON: true,
                timeout: 110000,
                calendarKey: true,
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

            // 5. Clean and validate blocks — resolve goal IDs + enforce constraints
            const goalMap = new Map(ctx.goals.map(g => [g.id, g]));
            const goalsByTitle = new Map(ctx.goals.map(g => [g.title.toLowerCase(), g]));

            // Helper: time string to minutes
            const timeToMinutes = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            };

            // Build commitment exclusion zones (commitment time ± 30 min buffer)
            const dayOfWeek = new Date(targetDate + 'T12:00:00').getDay();
            const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
            const commitmentZones = ctx.commitments
                .filter((c: any) => !c.days_of_week || c.days_of_week.includes(isoDay))
                .map((c: any) => ({
                    start: timeToMinutes(c.start_time) - 30, // 30 min buffer before
                    end: timeToMinutes(c.end_time) + 30, // 30 min buffer after
                    title: c.title,
                }));

            // Map AI block_types to DB-allowed values
            const normalizeBlockType = (type: string): string => {
                const map: Record<string, string> = {
                    'focus': 'goal', 'body': 'goal', 'mind': 'goal', 'craft': 'goal',
                    'task': 'flex', 'break': 'buffer', 'free': 'buffer', 'transition': 'buffer',
                    'exercise': 'goal', 'work': 'goal', 'deep_work': 'goal',
                    'admin': 'flex', 'personal': 'flex',
                };
                const allowed = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];
                if (allowed.includes(type)) return type;
                return map[type] || 'flex';
            };

            const enforceFlowState = (dayBlocks: any[], commitments: any[]) => {
                const minToTime = (m: number) => {
                    const h = Math.floor(m / 60) % 24;
                    const ms = m % 60;
                    return `${h.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
                };

                // Sort blocks chronologically
                dayBlocks.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

                // Get commitments for this date for buffer checking
                const dayCommitments = commitments.filter((c: any) => (c.days_of_week || []).includes(isoDay));

                let processedDay: any[] = [];
                let lastPillar: string | null = null;
                let lastEndTime = 0;

                for (let i = 0; i < dayBlocks.length; i++) {
                    let b = { ...dayBlocks[i] };
                    let bStart = timeToMinutes(b.start_time);
                    let duration = timeToMinutes(b.end_time) - bStart;

                    // 1. Force Alternate Pillars (Insert Buffer if needed)
                    if (b.block_type === 'goal' && b.pillar) {
                        if (b.pillar === lastPillar) {
                            // Inject a 15-min buffer block
                            const bufferStart = Math.max(lastEndTime, bStart - 15);
                            processedDay.push({
                                date: b.date,
                                start_time: minToTime(bufferStart),
                                end_time: minToTime(bufferStart + 15),
                                title: 'Flow Transition',
                                block_type: 'buffer',
                            });
                            lastEndTime = bufferStart + 15;
                            bStart = Math.max(bStart, lastEndTime);
                        }
                        lastPillar = b.pillar;
                    } else if (b.block_type !== 'buffer') {
                        lastPillar = null; // Reset pillar constraint if we hit a meal/break/etc
                    }

                    // 2. Prevent Overlap with previous blocks
                    if (bStart < lastEndTime) {
                        bStart = lastEndTime; // Shift start time down
                    }

                    // 3. Prevent Overlap with Commitments (Anchor 30-min buffer)
                    for (const cmt of dayCommitments) {
                        const cStart = timeToMinutes(cmt.start_time);
                        const cEnd = timeToMinutes(cmt.end_time);

                        // If block falls within the commitment + 30m buffer zone, push it after
                        if (bStart < cEnd + 30 && bStart + duration > cStart - 30) {
                            bStart = cEnd + 30;
                        }
                    }

                    // Apply shifted times
                    b.start_time = minToTime(bStart);
                    b.end_time = minToTime(bStart + duration);

                    processedDay.push(b);
                    lastEndTime = bStart + duration;
                }

                return processedDay;
            };

            // Determine body cap based on user profile
            // If user has explicit body/fitness goals, allow 2 body blocks; otherwise cap at 1
            const hasBodyGoals = ctx.goals.some((g: any) => g.pillar === 'body' || g.category === 'body');
            const bodyGoalCount = ctx.goals.filter((g: any) => g.pillar === 'body' || g.category === 'body').length;
            const maxBodyBlocks = bodyGoalCount >= 2 ? 2 : (hasBodyGoals ? 1 : 1);

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
                        block_type: normalizeBlockType(b.block_type || 'flex'),
                        goal_id: resolvedGoalId,
                        pillar: b.pillar || null,
                        status: 'planned',
                        checklist: Array.isArray(b.checklist) ? b.checklist : [],
                        _original_type: b.block_type || 'flex', // Keep original for filtering
                    };
                });

            // --- Post-processing: Filter out commitment-overlapping blocks ---
            const filteredBlocks = cleanBlocks.filter((b: any) => {
                const bStart = timeToMinutes(b.start_time);
                const bEnd = timeToMinutes(b.end_time);
                for (const zone of commitmentZones) {
                    if (bStart < zone.end && bEnd > zone.start) {
                        console.log(`[GenerateToday] Removing block "${b.title}" (${b.start_time}-${b.end_time}) — overlaps commitment zone "${zone.title}"`);
                        return false;
                    }
                }
                return true;
            });

            // --- Post-processing: Cap body/exercise blocks ---
            let bodyCount = 0;
            const bodyCapBlocks = filteredBlocks.filter((b: any) => {
                const origType = (b._original_type || '').toLowerCase();
                const isBody = origType === 'body' || origType === 'exercise' ||
                    (b.pillar === 'body') ||
                    (b.title || '').toLowerCase().includes('exercise') ||
                    (b.title || '').toLowerCase().includes('workout') ||
                    (b.title || '').toLowerCase().includes('gym');
                if (isBody) {
                    bodyCount++;
                    if (bodyCount > maxBodyBlocks) {
                        console.log(`[GenerateToday] Removing excess body block "${b.title}" (cap: ${maxBodyBlocks})`);
                        return false;
                    }
                }
                return true;
            });

            // --- Post-processing: Cap goal blocks at 5 per day ---
            let goalCount = 0;
            const MAX_GOAL_BLOCKS = 5;
            const cappedBlocks = bodyCapBlocks.filter((b: any) => {
                if (b.block_type === 'goal') {
                    goalCount++;
                    if (goalCount > MAX_GOAL_BLOCKS) {
                        console.log(`[GenerateToday] Removing excess goal block "${b.title}" (cap: ${MAX_GOAL_BLOCKS})`);
                        return false;
                    }
                }
                return true;
            });

            // Remove the internal _original_type field and enforce Flow State algorithm
            const rawFinalBlocks = cappedBlocks.map(({ _original_type, ...rest }: any) => rest);
            const finalBlocks = enforceFlowState(rawFinalBlocks, ctx.commitments);

            // 6. Return as a single option to auto-apply
            const option = {
                id: 'today_schedule',
                label: `${dayName} Schedule`,
                description: summary,
                tradeoff: philosophy,
                patch: {
                    ops: finalBlocks.map((b: any) => ({
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
            title: goal.title, block_type: 'goal', goal_id: goal.id, pillar: goal.pillar,
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
            title: goal.title, block_type: 'goal', goal_id: goal.id, pillar: goal.pillar,
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
            title: goal.title, block_type: 'goal', goal_id: goal.id, pillar: goal.pillar,
            checklist: [{ text: `Work on ${goal.title}` }],
        });
        cursor += dur + 15;
    }

    // Exercise (if no body goals already)
    if (!ctx.goals.some((g: any) => g.pillar === 'body') && cursor < 17 * 60 + 30) {
        const exStart = Math.max(cursor, 16 * 60 + 30);
        blocks.push({
            date, start_time: minutesToTime(exStart), end_time: minutesToTime(exStart + 45),
            title: 'Exercise / Walk', block_type: 'goal',
            checklist: [{ text: 'Warm up for 5 minutes' }, { text: 'Main workout / walk' }, { text: 'Cool down and stretch' }],
        });
        cursor = exStart + 60;
    }

    // Free Time
    if (cursor < 18 * 60 + 30) {
        blocks.push({
            date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 45),
            title: 'Free Time', block_type: 'buffer',
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
            title: 'Evening Free Time', block_type: 'buffer',
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
