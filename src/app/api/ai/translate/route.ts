import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;


/**
 * AI Goal Interpretation API
 * Transforms any goal into actionable subtasks, routines, weekly schedule, and habits
 */

// Enhanced system prompt for comprehensive goal interpretation
const INTERPRETATION_PROMPT = `You are an AI life coach who helps break down goals into actionable systems.
Given a goal, generate a complete action plan with subtasks, routines, and scheduling.

Return JSON only:
{
  "interpretation": {
    "understanding": "What you understood about this goal in one sentence",
    "timeframe": "short-term" | "medium-term" | "long-term",
    "complexity": "simple" | "moderate" | "complex",
    "success_looks_like": "Clear description of what success looks like"
  },
  "subtasks": [
    {
      "id": "st_1",
      "title": "Specific subtask",
      "description": "Brief description of what this involves",
      "duration_mins": 15,
      "frequency": "daily" | "weekly" | "once",
      "priority": "high" | "medium" | "low",
      "order": 1
    }
  ],
  "routine": {
    "type": "daily" | "weekly",
    "steps": [
      {"order": 1, "action": "specific action", "duration_mins": 10, "best_time": "morning" | "afternoon" | "evening"}
    ]
  },
  "weekly_schedule": {
    "mon": [{"time": "09:00", "duration_mins": 30, "focus": "what to work on"}],
    "tue": [...],
    "wed": [...],
    "thu": [...],
    "fri": [...],
    "sat": [...],
    "sun": [...]
  },
  "milestones": [
    {"week": 1, "goal": "First week achievement", "metric": "how to measure"},
    {"week": 2, "goal": "Second week achievement", "metric": "how to measure"},
    {"week": 4, "goal": "Month achievement", "metric": "how to measure"}
  ],
  "habit_suggestions": [
    {
      "title": "Habit to build",
      "trigger": "After existing habit",
      "duration_mins": 5,
      "why": "How this helps the goal"
    }
  ],
  "adjustments": {
    "lowEnergy": "What to do on low-energy days",
    "timeConstrained": "5-min version",
    "struggling": "What to do when motivation is low"
  }
}

Rules:
- Generate 2-3 subtasks maximum
- Be specific and realistic
- Focus on small, sustainable actions
- Consider the user's time commitment
- Spread activities across the week realistically`;

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['goal_id']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { goal_id, regenerate } = body as { goal_id: string; regenerate?: boolean };

        const supabase = await createClient();

        // Get the goal
        const { data: goal, error: goalError } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goal_id)
            .eq('user_id', context.userId)
            .single();

        if (goalError || !goal) {
            return apiError('Goal not found', 404);
        }

        // Return cached interpretation if exists and not regenerating
        if (goal.ai_routine && !regenerate) {
            return apiSuccess({
                interpretation: goal.ai_routine,
                source: 'cached',
            });
        }

        // Check if Groq is configured
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey || groqKey === 'your_groq_api_key_here') {
            // Return a static interpretation when AI is not configured
            const staticInterpretation = generateStaticInterpretation(goal);

            // Save to goal
            await supabase
                .from('goals')
                .update({ ai_routine: staticInterpretation })
                .eq('id', goal_id);

            return apiSuccess({
                interpretation: staticInterpretation,
                source: 'template',
                message: 'Generated from template. Configure Groq API for AI-powered interpretation.'
            });
        }

        // Get user profile for context
        const { data: profile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end, low_energy_mode')
            .eq('id', context.userId)
            .single();

        // Use AI to generate interpretation
        try {
            const Groq = (await import('groq-sdk')).default;
            const groq = new Groq({ apiKey: groqKey });

            const prompt = `
Goal: ${goal.title}
Category: ${goal.category} (${goal.category === 'mind' ? 'Learning & Growth' : goal.category === 'body' ? 'Health & Fitness' : 'Career & Future'})
Time commitment: ${goal.minutes_per_day} minutes/day
Priority: ${goal.importance}
User wakes at: ${profile?.sleep_end || '07:00'}
User sleeps at: ${profile?.sleep_start || '23:00'}
Constraints: ${JSON.stringify(goal.constraints || {})}
Non-negotiables: ${(goal.non_negotiables || []).join(', ') || 'None specified'}
`;

            const completion = await groq.chat.completions.create({
                model: 'llama-3.1-70b-versatile',
                messages: [
                    { role: 'system', content: INTERPRETATION_PROMPT },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 2048,
                temperature: 0.7,
            });

            const content = completion.choices[0]?.message?.content || '';

            // Parse JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const interpretation = JSON.parse(jsonMatch[0]);

                // Save to goal
                await supabase
                    .from('goals')
                    .update({ ai_routine: interpretation })
                    .eq('id', goal_id);

                // Auto-create habit stacks if suggested
                if (interpretation.habit_suggestions?.length > 0) {
                    const habitStacksToInsert = interpretation.habit_suggestions.map((habit: any) => ({
                        user_id: context.userId,
                        goal_id: goal_id,
                        trigger_habit: habit.trigger,
                        action_habit: habit.title,
                        action_duration_mins: habit.duration_mins || 5,
                    }));

                    await supabase.from('habit_stacks').upsert(habitStacksToInsert, {
                        onConflict: 'goal_id,trigger_habit',
                        ignoreDuplicates: true,
                    });
                }

                return apiSuccess({
                    interpretation,
                    source: 'ai',
                });
            }

            throw new Error('Failed to parse AI response');

        } catch (error) {
            console.error('AI interpretation error:', error);

            // Fallback to static interpretation
            const staticInterpretation = generateStaticInterpretation(goal);

            await supabase
                .from('goals')
                .update({ ai_routine: staticInterpretation })
                .eq('id', goal_id);

            return apiSuccess({
                interpretation: staticInterpretation,
                source: 'template',
                message: 'AI unavailable, using template.'
            });
        }
    },
    { requireAuth: true, rateLimit: 'ai', auditAction: 'ai_interpret' }
);

// Generate a comprehensive static interpretation based on goal parameters
function generateStaticInterpretation(goal: {
    title: string;
    category: string;
    minutes_per_day: number;
    importance: string;
}) {
    const timePerSession = goal.minutes_per_day;
    const bestTime = goal.category === 'body' ? 'morning' : goal.category === 'future' ? 'evening' : 'morning';

    const baseInterpretation = {
        interpretation: {
            understanding: `Help you ${goal.title.toLowerCase()} with ${goal.minutes_per_day} minutes daily`,
            timeframe: goal.minutes_per_day >= 60 ? 'medium-term' : 'short-term',
            complexity: goal.importance === 'high' ? 'moderate' : 'simple',
            success_looks_like: `Consistently doing ${goal.title.toLowerCase()} every day for ${goal.minutes_per_day} minutes`,
        },
        subtasks: [
            {
                id: 'st_1',
                title: `Set up your ${goal.title.toLowerCase()} environment`,
                description: 'Prepare everything you need to get started',
                duration_mins: 15,
                frequency: 'once',
                priority: 'high',
                order: 1,
            },
            {
                id: 'st_2',
                title: `Daily ${goal.title.toLowerCase()} session`,
                description: `Your main ${goal.minutes_per_day}-minute practice`,
                duration_mins: timePerSession,
                frequency: 'daily',
                priority: 'high',
                order: 2,
            },
            {
                id: 'st_3',
                title: 'Weekly review and adjust',
                description: 'Reflect on progress and adjust approach',
                duration_mins: 10,
                frequency: 'weekly',
                priority: 'medium',
                order: 3,
            },
        ],
        routine: {
            type: 'daily',
            steps: [
                { order: 1, action: 'Set intention', duration_mins: 2, best_time: bestTime },
                { order: 2, action: goal.title, duration_mins: timePerSession - 5, best_time: bestTime },
                { order: 3, action: 'Brief reflection', duration_mins: 3, best_time: bestTime },
            ],
        },
        weekly_schedule: generateWeeklySchedule(goal, bestTime),
        milestones: [
            { week: 1, goal: 'Complete 5 sessions', metric: 'sessions logged' },
            { week: 2, goal: 'Build consistency', metric: '5-day streak' },
            { week: 4, goal: 'Establish routine', metric: 'habit feels automatic' },
        ],
        habit_suggestions: [
            {
                title: `${goal.minutes_per_day} min ${goal.title.toLowerCase()}`,
                trigger: goal.category === 'body' ? 'After waking up' : goal.category === 'future' ? 'After dinner' : 'After morning coffee',
                duration_mins: Math.min(timePerSession, 15),
                why: 'Stack with existing routine for better consistency',
            },
        ],
        adjustments: {
            lowEnergy: `Do a 5-minute micro-session of ${goal.title.toLowerCase()} instead`,
            timeConstrained: 'One focused action for 5 minutes',
            struggling: 'Just show up for 2 minutes - momentum will build',
        },
    };

    return baseInterpretation;
}

// Generate a realistic weekly schedule
function generateWeeklySchedule(
    goal: { title: string; minutes_per_day: number; importance: string },
    bestTime: string
): Record<string, Array<{ time: string; duration_mins: number; focus: string }>> {
    const timeMap = {
        morning: '09:00',
        afternoon: '14:00',
        evening: '19:00',
    };
    const time = timeMap[bestTime as keyof typeof timeMap] || '09:00';

    const schedule: Record<string, Array<{ time: string; duration_mins: number; focus: string }>> = {};
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    // High priority = 6 days, medium = 5 days, low = 4 days
    const activeDays = goal.importance === 'high' ? 6 : goal.importance === 'medium' ? 5 : 4;
    const restDay = goal.importance === 'high' ? 'sun' : goal.importance === 'medium' ? 'sat' : 'sat';

    days.forEach((day, index) => {
        if (index < activeDays && day !== restDay) {
            schedule[day] = [{
                time,
                duration_mins: goal.minutes_per_day,
                focus: goal.title,
            }];
        } else {
            schedule[day] = [];
        }
    });

    return schedule;
}
