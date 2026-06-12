import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { callAI } from '@/lib/ai/unified-client';
import {
    computeDayPhases,
    buildFlowPromptFragment,
    buildBehaviorInsights,
    buildGoalProgressFragment,
    validateFlowConstraints,
} from '@/lib/calendar/flow-protocol';
import { SchedulingProtocol, type MoodLevel } from '@/lib/scheduling/protocol';
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
            // 1. Build full context (goals, commitments, habits, performance, behavior, coach learnings)
            const ctx = await buildCalendarContext(userId, supabase);

            const wakeTime = ctx.user.sleep_end || '07:00';
            const sleepTime = ctx.user.sleep_start || '23:00';
            const windDownMins = ctx.user.wind_down_mins || 30;
            const chronotype = ctx.user.chronotype || 'bear';

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

            // 2. Compute energy phases for this user's chronotype
            const wakeMins = parseInt(wakeTime.split(':')[0]) * 60 + parseInt(wakeTime.split(':')[1] || '0');
            const phases = computeDayPhases(wakeMins, sleepMins, chronotype);

            // 3. Build rich context fragments
            const flowFragment = buildFlowPromptFragment(phases, ctx);
            const behaviorFragment = buildBehaviorInsights(ctx);
            const progressFragment = buildGoalProgressFragment(ctx);


            // 4. Build goals text with priority ordering
            // Sort goals: weekly progress behind → high energy demand → importance
            const sortedGoals = [...ctx.goals].sort((a, b) => {
                const aProgress = ctx.goalProgress.find(gp => gp.goal_id === a.id);
                const bProgress = ctx.goalProgress.find(gp => gp.goal_id === b.id);

                // Goals behind schedule come first
                const aPctDone = aProgress ? (aProgress.completed_minutes_this_week / Math.max(1, aProgress.weekly_target_minutes)) : 0;
                const bPctDone = bProgress ? (bProgress.completed_minutes_this_week / Math.max(1, bProgress.weekly_target_minutes)) : 0;
                if (aPctDone < 0.5 && bPctDone >= 0.5) return -1;
                if (bPctDone < 0.5 && aPctDone >= 0.5) return 1;

                // Then by importance
                return (b.importance || 5) - (a.importance || 5);
            });

            const goalsText = sortedGoals.length > 0
                ? sortedGoals.map(g => {
                    const progress = ctx.goalProgress.find(gp => gp.goal_id === g.id);
                    const progressNote = progress
                        ? ` | Weekly: ${progress.completed_minutes_this_week}/${progress.weekly_target_minutes}min${progress.daily_target_today > 0 ? ` → schedule ~${progress.daily_target_today}min today` : ' ✅ on track'}`
                        : '';
                    return `  - ${g.title} (Pillar: ${g.pillar.toUpperCase()}, Energy: ${g.energy_demand}, ${g.minutes_per_day}min/day) → ID: ${g.id}${progressNote}\n    AI Strategy: ${g.ai_strategy ? JSON.stringify(g.ai_strategy) : 'None'}`;
                }).join('\n')
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

            // Bio-context from today's check-in or profile defaults
            const todayEnergy = ctx.dailyEnergyState?.energy_level ?? Math.round(ctx.user.energy_level / 2); // profile is 1-10, check-in is 1-5
            const todayMood: MoodLevel = (ctx.dailyEnergyState?.emotional_state as MoodLevel) ?? 'neutral';
            const userStress = ctx.user.stress_level || 3;
            const mealsPerDay = ctx.user.meals_per_day || 3;
            const mealWindows = ctx.user.meal_windows || {};

            // SCHEDULING PROTOCOL: Compute mode from energy + mood
            const scheduleMode = SchedulingProtocol.computeMode({
                energy: todayEnergy,
                mood: todayMood,
                completionRate7d: ctx.performance.last_7_days_completion_rate,
            });
            const scheduleIntensity = SchedulingProtocol.getIntensityDescription(
                scheduleMode,
                todayEnergy,
                ctx.performance.last_7_days_completion_rate
            );

            console.log(`[GenerateToday] Protocol Mode: ${scheduleMode.strategy} (energy=${todayEnergy}, mood=${todayMood})`);

            // 5. Construct the AI prompt
            const systemPrompt = `You are PlannrAI's Day Architect — an expert in chronobiology, flow state management, and high-performance scheduling. Your job is to create a science-backed daily schedule that helps ${ctx.user.first_name} achieve their goals while maintaining deep focus and sustainable energy.

YOU ARE NOT A GENERIC CALENDAR APP. You are designing a day for a high-performance individual. Every block has purpose. Every transition is intentional.

━━━ CORE ARCHITECTURE ━━━

1. FOLLOW THE ENERGY ARC: Schedule blocks according to the user's energy phases (provided below). Never put high-energy work in low-energy phases.
2. ULTRADIAN RHYTHM: Deep work in 60-90min bursts, followed by 15-20min Active Recovery (walk, stretch, breathe — NOT another task).
3. COGNITIVE SWITCHING: 10-15min transition buffer between different types of work. Same-pillar tasks need 5min, different pillars need 15min.
4. STRATEGIC MEALS: Meals are energy anchors. YOU MUST SCHEDULE EXACTLY ${mealsPerDay} meals. YOU MUST SCHEDULE THEM STRICTLY WITHIN THE PROVIDED MEAL WINDOWS. NEVER INVENT RANDOM MEAL TIMES OUTSIDE THESE WINDOWS.
5. MAX 3-4 DEEP WORK CYCLES: No human sustains more than 3-4 hours of genuine deep focus per day. Quality over quantity.
6. MORNING ROUTINE: The first 60-90 min after waking is for activation (routine, breakfast, light review). Do NOT schedule heavy cognitive work here.
7. WIND-DOWN: The last 60-90 min before sleep is for deceleration. No work, no screens for deep focus. Light review, journaling, routine only.
8. ZERO OVERLAP & RESPECT ANCHORS: Every block has a unique time slot. YOU MUST NEVER OVERLAP WITH FIXED COMMITMENTS.
9. COMMITMENT BUFFERS: Leave 20-30 minute buffers before and after fixed commitments for travel/transition.

🧠 PILLAR DISTRIBUTION — DYNAMIC, NOT FORMULAIC:
- The number of blocks per pillar depends on the user's ACTUAL goals and their weekly progress
- If a user has 3 mind goals that are behind schedule, create 3 mind blocks
- If they're on track for body but behind on craft, prioritize craft
- Use the WEEKLY PROGRESS section to decide how much time each goal needs TODAY
- Use the user's EXACT goal names and IDs — NEVER invent generic blocks like "Mind Boost"

BLOCK TYPES (use exactly):
- "goal" → Any block tied to a user goal (set pillar to mind/body/craft/soul)
- "routine" → Morning/Evening routines
- "meal" → Breakfast, Lunch, Dinner, Snack
- "buffer" → Transition, active recovery, breaks
- "flex" → Admin, errands, brain dump items, misc

SCHEDULING INTENSITY TODAY: ${scheduleIntensity}

BIO-CONTEXT:
- Chronotype: ${chronotype.toUpperCase()}
- Today's energy: ${todayEnergy}/5 (mood: ${todayMood})
- Stress level: ${userStress}/10
- Meals per day: ${mealsPerDay}
${(mealWindows as any)?.breakfast ? `- Breakfast window: ${(mealWindows as any).breakfast.start}–${(mealWindows as any).breakfast.end}` : ''}
${(mealWindows as any)?.lunch ? `- Lunch window: ${(mealWindows as any).lunch.start}–${(mealWindows as any).lunch.end}` : ''}
${(mealWindows as any)?.dinner ? `- Dinner window: ${(mealWindows as any).dinner.start}–${(mealWindows as any).dinner.end}` : ''}

Return valid JSON only.`;


            const userPrompt = `ARCHITECT ${ctx.user.first_name}'s ${dayName} (${targetDate})

━━━ TIME WINDOW ━━━
Wake: ${wakeTime}
Wind-down: ${windDownTime}
Sleep: ${sleepTime}
${flowFragment}
━━━ GOALS TO SCHEDULE (priority ordered — behind-schedule goals first) ━━━
${goalsText}
${progressFragment}
━━━ FIXED COMMITMENTS (DO NOT OVERLAP — leave 20min buffer around each) ━━━
${commitmentsText}

━━━ HABIT STACKS (integrate into morning routine) ━━━
${habitStacksText}

━━━ EXISTING BLOCKS ━━━
${existingText}
${behaviorFragment}
━━━ CAPACITY ━━━
- Awake hours: ${ctx.capacity.daily_awake_hours}h
- 7-day completion rate: ${ctx.performance.last_7_days_completion_rate}%
${ctx.performance.last_7_days_completion_rate < 50 ? '⚠️ LOW COMPLETION — make the schedule ACHIEVABLE. Fewer blocks, shorter durations.' : ''}

━━━ OUTPUT FORMAT ━━━
{
  "blocks": [
    {
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "title": "Block Title",
      "block_type": "goal|routine|meal|buffer|flex",
      "goal_id": "uuid-if-linked-to-goal-or-null",
      "pillar": "mind|body|craft|soul|null",
      "energy_demand": "high|medium|low",
      "checklist": [
        {"text": "Specific action step 1"},
        {"text": "Specific action step 2"},
        {"text": "Specific action step 3"}
      ]
    }
  ],
  "summary": "Concise 1-line summary of today's plan",
  "philosophy": "Brief approach note — why this schedule is structured this way"
}

━━━ RULES ━━━
1. Use 24-hour HH:MM format for all times
2. Cover the FULL day from ${wakeTime} to ${windDownTime}
3. For goal blocks, use the EXACT goal ID and title from the list above
4. Morning Routine checklist should include habit stacks
5. Follow the ENERGY ARC phases — deep work in Peak, light work in Trough
6. After every deep work block (60-90min), schedule a 15min "Active Recovery" buffer
7. Schedule goals based on WEEKLY PROGRESS — goals that are behind get priority and more time
8. Include at least 1 "Free Time" or unstructured block — high performers need whitespace
9. Meals MUST be placed exactly within the provided Meal Windows. No exceptions.
10. If there's a large commitment (e.g., Work 9-5), fill morning and evening windows intelligently, not just 1 block
11. Generate 10-20 blocks for a FULL, COMPLETE day — not just 3-4 blocks
12. EVERY goal block MUST have a 2-4 item checklist. The checklist MUST be derived directly from the 'AI Strategy' provided for that goal. DO NOT INVENT RANDOM TASKS if an AI Strategy is provided.`;

            // 6. Call AI
            const response = await callAI<{ blocks: any[]; summary: string; philosophy: string }>({
                prompt: userPrompt,
                systemPrompt,
                model: 'smart',
                temperature: 0.6,
                maxTokens: 4000,
                requireJSON: true,
                timeout: 55000,
                useNvidia: true,
            });

            let blocks: any[];
            let summary: string;
            let philosophy: string;

            if (response.success && response.data?.blocks?.length) {
                blocks = response.data.blocks;
                summary = response.data.summary || 'AI-generated day schedule';
                philosophy = response.data.philosophy || 'Flow-state optimized approach';
            } else {
                // Fallback: generate flow-state-aware deterministic schedule
                console.warn('[GenerateToday] AI failed, using fallback:', response.error);
                const fb = generateFlowStateFallback(ctx, targetDate, wakeTime, windDownTime, phases);
                blocks = fb.blocks;
                summary = fb.summary;
                philosophy = fb.philosophy;
            }

            // 7. Clean and validate blocks — resolve goal IDs + enforce constraints
            const goalMap = new Map(ctx.goals.map(g => [g.id, g]));
            const goalsByTitle = new Map(ctx.goals.map(g => [g.title.toLowerCase(), g]));

            // Helper: time string to minutes
            const timeToMinutes = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            };

            // Build commitment exclusion zones (commitment time ± 30 min buffer)
            // DB stores days_of_week with JS encoding: Sun=0, Mon=1...Sat=6
            const dayOfWeek = new Date(targetDate + 'T12:00:00').getDay();
            const commitmentZones = ctx.commitments
                .filter((c: any) => !c.days_of_week || c.days_of_week.includes(dayOfWeek))
                .map((c: any) => ({
                    start: timeToMinutes(c.start_time) - 30,
                    end: timeToMinutes(c.end_time) + 30,
                    title: c.title,
                }));

            // Map AI block_types to DB-allowed values
            const normalizeBlockType = (type: string): string => {
                const map: Record<string, string> = {
                    'focus': 'goal', 'body': 'goal', 'mind': 'goal', 'craft': 'goal',
                    'task': 'flex', 'break': 'buffer', 'free': 'buffer', 'transition': 'buffer',
                    'exercise': 'goal', 'work': 'goal', 'deep_work': 'goal',
                    'admin': 'flex', 'personal': 'flex', 'recovery': 'buffer',
                    'active_recovery': 'buffer',
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
                const dayCommitments = commitments.filter((c: any) => (c.days_of_week || []).includes(dayOfWeek));

                const processedDay: any[] = [];
                let lastEndTime = 0;
                let bodyGoalCount = 0;

                for (let i = 0; i < dayBlocks.length; i++) {
                    const b = { ...dayBlocks[i] };
                    let bStart = timeToMinutes(b.start_time);
                    const duration = timeToMinutes(b.end_time) - bStart;
                    const isBodyGoal = b.pillar === 'body' || b.block_type === 'body' || (b.title && (b.title.toLowerCase().includes('workout') || b.title.toLowerCase().includes('gym') || b.title.toLowerCase().includes('exercise') || b.title.toLowerCase().includes('football')));

                    // Max two body goals per day rule
                    if (isBodyGoal && bodyGoalCount >= 2) {
                        console.log(`[GenerateToday] Skipping extra body goal "${b.title}"`);
                        continue;
                    }

                    // 1. Prevent Overlap with previous blocks
                    if (bStart < lastEndTime) {
                        bStart = lastEndTime;
                    }

                    // 2. Prevent Overlap with Commitments (Anchor 30-min buffer)
                    for (const cmt of dayCommitments) {
                        const cStart = timeToMinutes(cmt.start_time);
                        const cEnd = timeToMinutes(cmt.end_time);
                        if (bStart < cEnd + 30 && bStart + duration > cStart - 30) {
                            bStart = cEnd + 30;
                        }
                    }

                    // Apply shifted times
                    b.start_time = minToTime(bStart);
                    b.end_time = minToTime(bStart + duration);
                    if (isBodyGoal) bodyGoalCount++;

                    processedDay.push(b);
                    lastEndTime = bStart + duration;
                }

                // If there are exactly 2 body goals, reorder them to the ends of the day
                const reorderBodyGoals = (blocks: any[]) => {
                    const bodyBlocks = blocks.filter(b => b.pillar === 'body' || b.block_type === 'body' || (b.title && (b.title.toLowerCase().includes('workout') || b.title.toLowerCase().includes('gym') || b.title.toLowerCase().includes('exercise') || b.title.toLowerCase().includes('football'))));
                    if (bodyBlocks.length < 2) return blocks;

                    const activeBodyBlocks = bodyBlocks.slice(0, 2);
                    const nonBodyBlocks = blocks.filter(b => !activeBodyBlocks.includes(b));
                    const goalSlots = nonBodyBlocks.filter(b => b.block_type === 'goal' || b.block_type === 'flex');

                    if (goalSlots.length === 0) return blocks;

                    goalSlots.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

                    // First body goal goes to the first goal slot, second body goal to the last goal slot
                    const orderedGoals = [activeBodyBlocks[0], ...goalSlots, activeBodyBlocks[1]];
                    const allGoalTimes = [
                        ...goalSlots.map(g => ({ start: g.start_time, end: g.end_time })),
                        ...activeBodyBlocks.map(g => ({ start: g.start_time, end: g.end_time }))
                    ].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

                    for (let i = 0; i < orderedGoals.length; i++) {
                        if (i < allGoalTimes.length) {
                            orderedGoals[i].start_time = allGoalTimes[i].start;
                            orderedGoals[i].end_time = allGoalTimes[i].end;
                        }
                    }

                    const otherBlocks = nonBodyBlocks.filter(b => b.block_type !== 'goal' && b.block_type !== 'flex');
                    return [...otherBlocks, ...orderedGoals].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
                };

                return reorderBodyGoals(processedDay);
            };

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

            // --- Post-processing: Enforce zero-overlap and commitment buffers ---
            const overlapFixed = enforceFlowState(filteredBlocks, ctx.commitments);

            // --- Post-processing: Validate flow constraints ---
            const flowValidation = validateFlowConstraints(overlapFixed, phases, ctx);
            if (flowValidation.violations.length > 0) {
                console.log(`[GenerateToday] Flow violations detected:`, flowValidation.violations.map(v => v.violation).join(', '));
            }

            const finalBlocks = flowValidation.fixedBlocks;

            // 8. Auto-apply when force=true — write directly to schedule_blocks
            let appliedCount = 0;
            if (force && finalBlocks.length > 0) {
                const blocksToInsert = finalBlocks.map((b: any) => ({
                    ...b,
                    user_id: userId,
                    status: b.status || 'planned',
                }));

                const { data: inserted, error: insertError } = await supabase
                    .from('schedule_blocks')
                    .insert(blocksToInsert)
                    .select('id');

                if (insertError) {
                    console.error('[GenerateToday] Auto-apply insert failed:', insertError);
                } else {
                    appliedCount = inserted?.length || 0;
                    console.log(`[GenerateToday] Auto-applied ${appliedCount} blocks for ${targetDate}`);
                }

                // Clear needs_rescheduling flag after successful generation
                try {
                    const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', userId).single();
                    if (profile) {
                        const bioData = (profile.bio_data as any) || {};
                        if (bioData.needs_rescheduling) {
                            await supabase.from('profiles').update({
                                bio_data: { ...bioData, needs_rescheduling: false }
                            }).eq('id', userId);
                        }
                    }
                } catch (e) { /* non-blocking */ }
            }

            // 9. Return as a single option (also usable for manual apply)
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
                auto_applied: force ? appliedCount : 0,
                warnings: flowValidation.violations.map(v => `${v.block_title}: ${v.violation}`),
            });

        } catch (e: any) {
            console.error('[GenerateToday] Error:', e);
            return apiError(`Schedule generation failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true, rateLimit: 'aiPlanDay' }
);

// ── Flow-State-Aware Fallback Generator ──────────────────────────

function generateFlowStateFallback(
    ctx: any,
    date: string,
    wakeTime: string,
    windDownTime: string,
    phases: ReturnType<typeof computeDayPhases>
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

    // Build commitment exclusion zones for this date
    // DB stores days_of_week with JS encoding: Sun=0, Mon=1...Sat=6
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const dayCommitments = (ctx.commitments || [])
        .filter((c: any) => !c.days_of_week || c.days_of_week.includes(dayOfWeek))
        .sort((a: any, b: any) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

    // Build available time windows (wake to wind-down, excluding commitments with 20min buffer)
    const windows: Array<{ start: number; end: number }> = [];
    let cursor = wakeMins;

    for (const cmt of dayCommitments) {
        const cmtStart = timeToMinutes(cmt.start_time) - 20;
        const cmtEnd = timeToMinutes(cmt.end_time) + 20;
        if (cursor < cmtStart) {
            windows.push({ start: cursor, end: cmtStart });
        }
        cursor = Math.max(cursor, cmtEnd);
    }
    if (cursor < windDownMins) {
        windows.push({ start: cursor, end: windDownMins });
    }

    // Track which window we're in
    let windowIdx = 0;
    let windowCursor = windows.length > 0 ? windows[0].start : wakeMins;

    const placeBlock = (title: string, type: string, durationMin: number, extra?: any) => {
        if (windowIdx >= windows.length) return false;
        const win = windows[windowIdx];

        if (windowCursor + durationMin > win.end) {
            windowIdx++;
            if (windowIdx >= windows.length) return false;
            windowCursor = windows[windowIdx].start;
            if (windowCursor + durationMin > windows[windowIdx].end) return false;
        }

        blocks.push({
            date,
            start_time: minutesToTime(windowCursor),
            end_time: minutesToTime(windowCursor + durationMin),
            title,
            block_type: type,
            status: 'planned',
            checklist: [],
            ...extra,
        });
        windowCursor += durationMin;
        return true;
    };

    // ── Meal Window Placement ─────────────────────
    // Instead of placing meals sequentially, place them at their user-defined window times
    const mealWindows = ctx.user?.meal_windows || {
        breakfast: { start: '07:00', end: '10:00' },
        lunch: { start: '12:00', end: '15:00' },
        dinner: { start: '20:00', end: '21:30' },
    };

    const placeMealBlock = (title: string, mealKey: string, durationMin: number) => {
        const window = (mealWindows as any)?.[mealKey];
        if (!window?.start) return;

        const windowStart = timeToMinutes(window.start);
        const windowEnd = timeToMinutes(window.end || window.start);
        // Place meal at the start of its window
        const mealStart = Math.max(windowStart, wakeMins);
        const mealEnd = mealStart + durationMin;

        // Only place if within waking hours and window
        if (mealEnd <= windDownMins + 60 && mealStart < windowEnd) {
            blocks.push({
                date,
                start_time: minutesToTime(mealStart),
                end_time: minutesToTime(mealEnd),
                title,
                block_type: 'meal',
                status: 'planned',
                checklist: title === 'Breakfast'
                    ? [{ text: 'Prepare and eat a protein-rich breakfast' }, { text: 'Plan first deep work block mentally' }]
                    : title === 'Lunch'
                    ? [{ text: 'Step away from desk completely' }, { text: 'Eat mindfully, no screens' }]
                    : [{ text: 'Prepare and eat dinner' }, { text: 'Connect with family/friends if possible' }],
            });
        }
    };

    // ── RAMP-UP PHASE ──────────────────────────

    // Morning Routine (with habit stacks)
    const morningChecklist = [
        { text: 'Hydrate — drink a full glass of water' },
        { text: 'Stretch or mobility work for 5 minutes' },
        { text: 'Mindful breathing — 3 deep breaths' },
        { text: "Review today's top 3 priorities" },
    ];
    if (ctx.habitStacks?.length > 0) {
        ctx.habitStacks.slice(0, 2).forEach((h: any) => {
            morningChecklist.push({ text: `${h.action_habit} (${h.action_duration_mins}min)` });
        });
    }
    placeBlock('Morning Routine', 'routine', 30, { checklist: morningChecklist });

    // Breakfast — placed within user-defined breakfast window
    placeMealBlock('Breakfast', 'breakfast', 30);

    // ── PEAK PHASE — Deep Work ─────────────────

    // Sort goals: high-energy first (for peak), use weekly progress to prioritize
    const goalsByPriority = [...(ctx.goals || [])].sort((a: any, b: any) => {
        // Goals behind schedule come first
        const aProgress = ctx.goalProgress?.find((gp: any) => gp.goal_id === a.id);
        const bProgress = ctx.goalProgress?.find((gp: any) => gp.goal_id === b.id);
        const aBehind = aProgress ? (aProgress.completed_minutes_this_week / Math.max(1, aProgress.weekly_target_minutes)) : 0;
        const bBehind = bProgress ? (bProgress.completed_minutes_this_week / Math.max(1, bProgress.weekly_target_minutes)) : 0;

        if (aBehind < 0.5 && bBehind >= 0.5) return -1;
        if (bBehind < 0.5 && aBehind >= 0.5) return 1;

        // High-energy goals in peak
        const energyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (energyOrder[a.energy_demand] || 1) - (energyOrder[b.energy_demand] || 1);
    });

    const highEnergyGoals = goalsByPriority.filter((g: any) => g.energy_demand === 'high' || g.pillar === 'craft' || g.pillar === 'mind');
    const moderateGoals = goalsByPriority.filter((g: any) => g.energy_demand !== 'high' && g.pillar !== 'craft' && g.pillar !== 'mind');

    // Deep Work Block 1 (peak phase)
    if (highEnergyGoals.length > 0) {
        const goal = highEnergyGoals[0];
        const dur = Math.min(goal.minutes_per_day || 60, 90);
        placeBlock(goal.title, 'goal', dur, {
            goal_id: goal.id,
            pillar: goal.pillar,
            energy_demand: 'high',
            checklist: [
                { text: `Set a clear intention for this ${dur}min block` },
                { text: `Focus on the most important task for ${goal.title}` },
                { text: 'Note progress and blockers at end' },
            ],
        });
    }

    // Active Recovery
    placeBlock('Active Recovery', 'buffer', 15, {
        checklist: [{ text: 'Stand up, stretch, walk briefly' }, { text: 'Hydrate' }, { text: 'Look away from screen for 2 min' }]
    });

    // Deep Work Block 2 (peak phase)
    if (highEnergyGoals.length > 1) {
        const goal = highEnergyGoals[1];
        const dur = Math.min(goal.minutes_per_day || 60, 75);
        placeBlock(goal.title, 'goal', dur, {
            goal_id: goal.id,
            pillar: goal.pillar,
            energy_demand: 'high',
            checklist: [
                { text: `Continue from yesterday's progress on ${goal.title}` },
                { text: `Complete at least one concrete deliverable` },
                { text: 'Review progress at end of block' },
            ],
        });
    }

    // ── TROUGH PHASE — Lunch + Light Work ──────

    // Lunch — placed within user-defined lunch window
    placeMealBlock('Lunch', 'lunch', 45);

    // Light admin / flex block
    placeBlock('Admin & Planning', 'flex', 30, {
        checklist: [
            { text: 'Process inbox/messages' },
            { text: 'Review and update task lists' },
            { text: 'Handle quick replies and logistics' },
        ]
    });

    // ── REBOUND PHASE — Moderate Work + Body ───

    // Moderate goal blocks
    for (const goal of moderateGoals.slice(0, 2)) {
        const dur = Math.min(goal.minutes_per_day || 45, 60);
        placeBlock(goal.title, 'goal', dur, {
            goal_id: goal.id,
            pillar: goal.pillar,
            energy_demand: goal.energy_demand || 'medium',
            checklist: [
                { text: `Work on ${goal.title} — main task` },
                { text: 'Review progress at end' },
            ],
        });

        // Short transition
        placeBlock('Transition', 'buffer', 10, {
            checklist: [{ text: 'Quick stretch or walk' }]
        });
    }

    // Body/Exercise block (if any body goals exist, or add generic exercise)
    const bodyGoal = goalsByPriority.find((g: any) => g.pillar === 'body');
    if (bodyGoal) {
        placeBlock(bodyGoal.title, 'goal', Math.min(bodyGoal.minutes_per_day || 45, 60), {
            goal_id: bodyGoal.id,
            pillar: 'body',
            energy_demand: bodyGoal.energy_demand || 'medium',
            checklist: [
                { text: `Complete ${bodyGoal.title} session` },
                { text: 'Track performance/metrics' },
            ],
        });
    } else {
        placeBlock('Movement & Exercise', 'flex', 30, {
            pillar: 'body',
            checklist: [{ text: 'Walk, stretch, or light exercise' }, { text: 'Get outside if possible' }]
        });
    }

    // ── WIND-DOWN PHASE ────────────────────────

    // Free Time
    placeBlock('Free Time', 'buffer', 45, {
        checklist: [{ text: 'Unstructured time — relax, hobby, or social' }],
    });

    // Dinner — placed within user-defined dinner window
    placeMealBlock('Dinner', 'dinner', 45);

    // Evening Review / Light goal if remaining
    if (highEnergyGoals.length > 2) {
        const goal = highEnergyGoals[2];
        placeBlock(goal.title + ' (Light Session)', 'goal', 30, {
            goal_id: goal.id,
            pillar: goal.pillar,
            energy_demand: 'low',
            checklist: [
                { text: `Quick review or light work on ${goal.title}` },
                { text: 'Plan tomorrow\'s approach' },
            ],
        });
    }

    // Wind-Down Routine
    const windDownChecklist = [
        { text: 'No screens — switch to paper or conversation' },
        { text: 'Reflect on the day — 3 wins, 1 lesson' },
        { text: 'Prepare tomorrow\'s top 3 priorities' },
        { text: 'Light reading or journaling' },
    ];
    blocks.push({
        date,
        start_time: windDownTime,
        end_time: minutesToTime(timeToMinutes(windDownTime) + 30),
        title: 'Wind-Down Routine',
        block_type: 'routine',
        status: 'planned',
        checklist: windDownChecklist,
    });

    const goalBlockCount = blocks.filter(b => b.block_type === 'goal').length;
    const totalHours = Math.round(blocks.reduce((sum: number, b: any) => {
        return sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
    }, 0) / 60 * 10) / 10;

    return {
        blocks,
        summary: `${blocks.length} blocks from ${wakeTime} to wind-down — ${goalBlockCount} goal sessions, ${totalHours}h total`,
        philosophy: 'Flow-state architecture: deep work in peak energy, recovery between cycles, progressive wind-down.',
    };
}
