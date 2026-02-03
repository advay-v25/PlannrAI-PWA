import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

/**
 * AI Week Planning API
 * Aggregates all user inputs (goals, brain dumps, coach insights) 
 * and generates an optimized weekly schedule
 */

const WEEK_PLANNING_PROMPT = `You are an AI life coach creating an optimal weekly schedule.
Given the user's goals, constraints, and context, generate a balanced week.

Return valid JSON only. No markdown, no explanations outside the JSON.
Structure:
{
  "schedule": {
    "mon": [{"time": "09:00", "end_time": "09:30", "title": "Activity Name", "goal_id": "UUID_OR_NULL", "type": "goal" | "break" | "buffer"}],
    "tue": [],
    "wed": [],
    "thu": [],
    "fri": [],
    "sat": [],
    "sun": []
  },
  "reasoning": {
    "overview": "Brief explanation",
    "energy_considerations": "How energy patterns were considered",
    "balance": "How mind/body/future balance was achieved"
  },
  "flexibility": [
    {"day": "mon", "time": "09:00", "moveable": true, "alternatives": ["10:00", "14:00"]}
  ],
  "tips": ["Tip 1", "Tip 2"]
}

Rules:
- Respect user's sleep times (no activities outside waking hours)
- Consider energy patterns: morning for high-focus, afternoon for routine, evening for reflection
- Balance across goal categories (mind, body, future)
- Include buffer time between activities
- Leave at least one rest day for "body" goals
- Don't overschedule - quality over quantity
- "goal_id" MUST be the exact UUID provided in the prompt for that goal, or null for general activities.`;

export const POST = secureApiRoute(
    async (context, body) => {
        const { week_start, regenerate } = body as { week_start?: string; regenerate?: boolean };

        const supabase = await createClient();

        // Get all active goals
        const { data: goals, error: goalsError } = await supabase
            .from('goals')
            .select('id, title, category, minutes_per_day, importance, ai_routine')
            .eq('user_id', context.userId)
            .eq('is_paused', false);

        if (goalsError) {
            return apiError('Failed to fetch goals', 500);
        }

        // Calculate week start
        const startDate = week_start
            ? new Date(week_start)
            : getNextMonday();

        if (!goals || goals.length === 0) {
            // Return empty plan instead of error, so UI can handle it gracefully
            return apiSuccess({
                plan: { schedule: {}, reasoning: { overview: "No goals found to plan." }, flexibility: [], tips: ["Add some goals to get started!"] },
                source: 'empty',
                week_start: startDate.toISOString().split('T')[0],
                message: 'No active goals found.'
            });
        }

        // Get user profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end, low_energy_mode, timezone')
            .eq('id', context.userId)
            .single();

        // Get recent brain dump signals
        const { data: recentDumps } = await supabase
            .from('brain_dumps')
            .select('content, extracted_signals, created_at')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(3);

        // Get user's commitments (fixed schedule)
        const { data: commitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', context.userId);

        // Get recent energy patterns from daily logs
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const { data: energyLogs } = await supabase
            .from('daily_logs')
            .select('log_date, energy_level')
            .eq('user_id', context.userId)
            .gte('log_date', oneWeekAgo.toISOString().split('T')[0]);

        const avgEnergy = energyLogs && energyLogs.length > 0
            ? energyLogs.reduce((sum, log) => sum + (log.energy_level || 3), 0) / energyLogs.length
            : 3;

        // Check if Groq is configured
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey || groqKey === 'your_groq_api_key_here') {
            // Generate static schedule
            const staticPlan = generateStaticWeekPlan(goals, profile, commitments || []);
            return apiSuccess({
                plan: staticPlan,
                source: 'template',
                week_start: startDate.toISOString().split('T')[0],
                message: 'Generated from template. Configure Groq API for AI-powered planning.'
            });
        }

        // Use AI to generate optimal schedule
        try {
            const Groq = (await import('groq-sdk')).default;
            const groq = new Groq({ apiKey: groqKey });

            // Extract signals from brain dumps
            const signals = recentDumps
                ?.flatMap(d => d.extracted_signals || [])
                .map((s: any) => `${s.type}: ${s.content}`)
                .join('\n') || 'No recent signals';

            const prompt = `
User Context:
- Wakes at: ${profile?.sleep_end || '07:00'}
- Sleeps at: ${profile?.sleep_start || '23:00'}
- Low energy mode: ${profile?.low_energy_mode ? 'Yes (reduce load)' : 'No'}
- Average energy this week: ${avgEnergy.toFixed(1)}/5

Goals to schedule (Use these UUIDs):
${goals.map(g => `- ID: ${g.id} | ${g.title} (${g.category}, ${g.minutes_per_day} min/day, ${g.importance} priority)`).join('\n')}

Fixed commitments:
${commitments?.map(c => `- ${c.title}: ${c.day_of_week} ${c.start_time}-${c.end_time}`).join('\n') || 'None'}

Recent brain dump signals:
${signals}

Generate an optimal weekly schedule that balances all goals while respecting constraints.
Ensure you use the provided Goal IDs for goal-related activities.
`;

            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: WEEK_PLANNING_PROMPT },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 4096, // Increased for larger schedules
                temperature: 0.5, // Lower temperature for more structured output
                response_format: { type: 'json_object' } // Force JSON mode
            });

            let content = completion.choices[0]?.message?.content || '';
            let plan;

            try {
                // First try direct parse
                plan = JSON.parse(content);
            } catch (e) {
                // Fallback: Try regex extraction
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        plan = JSON.parse(jsonMatch[0]);
                    } catch (e2) {
                        console.error('Failed to parse regex-extracted JSON', e2);
                        throw new Error('Invalid JSON format');
                    }
                } else {
                    throw new Error('No JSON found in response');
                }
            }

            return apiSuccess({
                plan,
                source: 'ai',
                week_start: startDate.toISOString().split('T')[0],
            });

        } catch (error) {
            console.error('AI week planning error:', error);

            // Fallback to static schedule
            const staticPlan = generateStaticWeekPlan(goals, profile, commitments || []);
            return apiSuccess({
                plan: staticPlan,
                source: 'template',
                week_start: startDate.toISOString().split('T')[0],
                message: 'AI unavailable, using template.'
            });
        }
    },
    { requireAuth: true, rateLimit: 'ai', auditAction: 'ai_plan_week' }
);

// Apply the generated plan to the calendar
export const PUT = secureApiRoute(
    async (context, body) => {
        const { plan, week_start } = body as {
            plan: { schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id?: string }>> };
            week_start: string;
        };

        if (!plan?.schedule || !week_start) {
            return apiError('Plan and week_start are required');
        }

        const supabase = await createClient();
        const startDate = new Date(week_start);
        const blocks: Array<{
            user_id: string;
            date: string;
            start_time: string;
            end_time: string;
            goal_id: string | null;
            context: string;
        }> = [];

        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

        // Generate blocks for each day
        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dayName = dayMap[date.getDay()];
            const daySchedule = plan.schedule[dayName] || [];

            for (const slot of daySchedule) {
                blocks.push({
                    user_id: context.userId,
                    date: date.toISOString().split('T')[0],
                    start_time: slot.time,
                    end_time: slot.end_time,
                    goal_id: slot.goal_id || null,
                    context: slot.title,
                });
            }
        }

        if (blocks.length === 0) {
            return apiSuccess({
                created: 0,
                message: 'No blocks to create'
            });
        }

        // Clear existing blocks for this week first
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        await supabase
            .from('schedule_blocks')
            .delete()
            .eq('user_id', context.userId)
            .gte('date', week_start)
            .lte('date', endDate.toISOString().split('T')[0])
            .eq('status', 'planned'); // Only clear planned, keep done/partial/missed

        // Insert new blocks
        const { data, error } = await supabase
            .from('schedule_blocks')
            .insert(blocks)
            .select();

        if (error) {
            return apiError('Failed to create schedule blocks', 500);
        }

        return apiSuccess({
            created: data?.length || 0,
            blocks: data,
            message: `Created ${data?.length || 0} schedule blocks for the week`,
        });
    },
    { requireAuth: true, auditAction: 'ai_apply_plan' }
);

function getNextMonday(): Date {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday;
}

function generateStaticWeekPlan(
    goals: Array<{ id: string; title: string; category: string; minutes_per_day: number; importance: string }>,
    profile: { sleep_end?: string; sleep_start?: string; low_energy_mode?: boolean } | null,
    commitments: Array<{ day_of_week: number; start_time: string; end_time: string }>
) {
    const wakeTime = profile?.sleep_end || '07:00';
    const sleepTime = profile?.sleep_start || '23:00';
    const lowEnergy = profile?.low_energy_mode || false;

    // Time slots by category preference
    const categoryTimes: Record<string, string> = {
        body: '07:30',
        mind: '09:00',
        future: '19:00',
    };

    const schedule: Record<string, Array<{ time: string; end_time: string; title: string; goal_id: string; type: string }>> = {
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
    };

    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    // Sort goals by importance
    const sortedGoals = [...goals].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.importance as keyof typeof order] || 1) - (order[b.importance as keyof typeof order] || 1);
    });

    // Assign each goal to appropriate days
    sortedGoals.forEach(goal => {
        const startTime = categoryTimes[goal.category] || '09:00';
        const duration = lowEnergy ? Math.round(goal.minutes_per_day * 0.7) : goal.minutes_per_day;
        const endTime = addMinutesToTime(startTime, duration);

        // High priority: 6 days, medium: 5 days, low: 4 days
        const activeDays = goal.importance === 'high' ? 6 : goal.importance === 'medium' ? 5 : 4;

        days.slice(0, activeDays).forEach(day => {
            schedule[day].push({
                time: startTime,
                end_time: endTime,
                title: goal.title,
                goal_id: goal.id,
                type: 'goal',
            });
        });
    });

    return {
        schedule,
        reasoning: {
            overview: `Scheduled ${goals.length} goals across the week based on category and priority`,
            energy_considerations: lowEnergy
                ? 'Reduced durations by 30% due to low energy mode'
                : 'Normal energy levels assumed',
            balance: 'Morning for body, mid-morning for mind, evening for future goals',
        },
        flexibility: days.flatMap(day =>
            schedule[day].map(slot => ({
                day,
                time: slot.time,
                moveable: true,
                alternatives: [addMinutesToTime(slot.time, 60), addMinutesToTime(slot.time, 120)],
            }))
        ),
        tips: [
            'Start with the most important task when your energy is highest',
            'Take short breaks between sessions',
            'Review and adjust the schedule based on what works for you',
        ],
    };
}

function addMinutesToTime(time: string, minutes: number): string {
    const [hours, mins] = time.split(':').map(Number);
    const totalMins = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMins / 60) % 24;
    const newMins = totalMins % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}
