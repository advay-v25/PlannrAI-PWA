import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { callAI } from '@/lib/ai/unified-client';
import { format } from 'date-fns';

export const maxDuration = 45;
export const dynamic = 'force-dynamic';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { date } = body as { date?: string };

        const targetDate = date || format(new Date(), 'yyyy-MM-dd');
        const dayName = format(new Date(targetDate + 'T12:00:00'), 'EEEE');

        try {
            // 1. Build context
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

            if (existingBlocks && existingBlocks.length > 3) {
                return apiSuccess({
                    message: 'You already have a schedule for today. Use Optimize Day instead.',
                    has_existing: true,
                    blocks_count: existingBlocks.length,
                    options: []
                });
            }

            // 2. Build AI prompt for a full day schedule
            const goalsText = ctx.goals.length > 0
                ? ctx.goals.map(g =>
                    `  - ${g.title} (${g.pillar.toUpperCase()}, ${g.energy_demand} energy): ${g.minutes_per_day || 30}min/day, ID: ${g.id}`
                ).join('\n')
                : '  (No goals — generate general productivity blocks like "Deep Work", "Exercise", "Learning")';

            const commitmentsText = ctx.commitments.length > 0
                ? ctx.commitments.filter(c => {
                    const dow = new Date(targetDate + 'T12:00:00').getDay();
                    return (c.days_of_week || []).includes(dow as any);
                }).map(c =>
                    `  - ${c.title}: ${c.start_time}-${c.end_time} (FIXED — DO NOT MOVE)`
                ).join('\n')
                : '  (No fixed commitments today)';

            const existingText = existingBlocks && existingBlocks.length > 0
                ? existingBlocks.map((b: any) => `  - ${b.start_time}-${b.end_time}: ${b.title} [${b.status}]`).join('\n')
                : '  (None)';

            const systemPrompt = `You are PlannrAI's day scheduling AI. Generate a complete, realistic day schedule from wake to sleep.

RULES:
1. Cover the ENTIRE day from wake (${wakeTime}) to wind-down (${windDownTime})
2. Include Morning Routine (30min after wake), Breakfast, Lunch, Dinner
3. Add 15min buffers between different activity types
4. Schedule goal blocks based on user's energy demand preferences
5. Include free time / break blocks where appropriate
6. NEVER overlap with existing commitments
7. All times in HH:MM (24-hour), date in YYYY-MM-DD
8. Each block should be 30-90 minutes
9. Make it REALISTIC — not overpacked
10. Include a wind-down routine before sleep

Return valid JSON only.`;

            const userPrompt = `GENERATE FULL DAY SCHEDULE

DATE: ${targetDate} (${dayName})
WAKE: ${wakeTime}
WIND-DOWN: ${windDownTime}
SLEEP: ${sleepTime}

USER: ${ctx.user.first_name}

GOALS TO SCHEDULE:
${goalsText}

FIXED COMMITMENTS TODAY:
${commitmentsText}

EXISTING BLOCKS:
${existingText}

CAPACITY:
- Daily awake hours: ${ctx.capacity.daily_awake_hours}h
- Energy level: ${ctx.performance.last_7_days_completion_rate > 60 ? 'Normal' : 'Low (schedule lighter)'}

Generate ONE optimized schedule for today covering wake to sleep.

OUTPUT FORMAT:
{
  "blocks": [
    {
      "date": "${targetDate}",
      "start_time": "${wakeTime}",
      "end_time": "HH:MM",
      "title": "Morning Routine",
      "block_type": "routine",
      "goal_id": null,
      "pillar": null,
      "checklist": [{"text": "Specific sub-task or habit 1"}, {"text": "Specific sub-task 2"}]
    }
  ],
  "summary": "Your day plan: X blocks, Y hours of focused work",
  "philosophy": "Brief note about the day's approach"
}`;

            // 3. Call AI
            const response = await callAI<{ blocks: any[]; summary: string; philosophy: string }>({
                prompt: userPrompt,
                systemPrompt,
                model: 'smart',
                temperature: 0.7,
                maxTokens: 4000,
                requireJSON: true,
                timeout: 30000,
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

            // 4. Clean and validate blocks
            const cleanBlocks = blocks
                .filter((b: any) => b.start_time && b.end_time)
                .map((b: any) => ({
                    date: targetDate,
                    start_time: b.start_time,
                    end_time: b.end_time,
                    title: b.title || 'Block',
                    block_type: b.block_type || 'task',
                    goal_id: b.goal_id || null,
                    pillar: b.pillar || null,
                    status: 'planned',
                    checklist: Array.isArray(b.checklist) ? b.checklist : [],
                }));

            // 5. Return as a single option to auto-apply
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

    // Morning Routine
    blocks.push({ date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 30), title: 'Morning Routine', block_type: 'routine' });
    cursor += 45;

    // Breakfast
    blocks.push({ date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 30), title: 'Breakfast', block_type: 'meal' });
    cursor += 45;

    // Goal blocks (morning energy)
    for (const goal of ctx.goals.slice(0, 3)) {
        if (cursor >= 12 * 60) break;
        const dur = Math.min(goal.minutes_per_day || 60, 90);
        blocks.push({ date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + dur), title: goal.title, block_type: 'focus', goal_id: goal.id, pillar: goal.pillar });
        cursor += dur + 15;
    }

    // Lunch
    if (cursor < 13 * 60) cursor = Math.max(cursor, 12 * 60 + 30);
    blocks.push({ date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 45), title: 'Lunch', block_type: 'meal' });
    cursor += 60;

    // Afternoon goal blocks
    for (const goal of ctx.goals.slice(3, 5)) {
        if (cursor >= 17 * 60) break;
        const dur = Math.min(goal.minutes_per_day || 45, 60);
        blocks.push({ date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + dur), title: goal.title, block_type: 'focus', goal_id: goal.id, pillar: goal.pillar });
        cursor += dur + 15;
    }

    // Exercise (if no goals with body pillar)
    if (!ctx.goals.some((g: any) => g.pillar === 'body') && cursor < 17 * 60) {
        blocks.push({ date, start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + 45), title: 'Exercise / Walk', block_type: 'body' });
        cursor += 60;
    }

    // Dinner
    const dinnerStart = Math.max(cursor, 19 * 60);
    if (dinnerStart < windDownMins - 60) {
        blocks.push({ date, start_time: minutesToTime(dinnerStart), end_time: minutesToTime(dinnerStart + 45), title: 'Dinner', block_type: 'meal' });
    }

    // Wind Down
    blocks.push({ date, start_time: windDownTime, end_time: minutesToTime(timeToMinutes(windDownTime) + 30), title: 'Wind Down', block_type: 'routine' });

    return {
        blocks,
        summary: `Fallback schedule: ${blocks.length} blocks from ${wakeTime} to wind-down`,
        philosophy: 'A simple, balanced day structure to keep you on track.'
    };
}
