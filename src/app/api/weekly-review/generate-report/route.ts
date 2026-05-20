import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callAI } from '@/lib/ai/unified-client';
import { startOfWeek, endOfWeek, format, subWeeks } from 'date-fns';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        let { weekStart, weekEnd } = body;

        // Default to the past week if not provided
        if (!weekStart || !weekEnd) {
            const today = new Date();
            // Start of the current week is Monday
            const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
            // We want to review the *previous* week
            const lastWeekStart = subWeeks(currentWeekStart, 1);
            const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
            
            weekStart = format(lastWeekStart, 'yyyy-MM-dd');
            weekEnd = format(lastWeekEnd, 'yyyy-MM-dd');
        }

        console.log(`Generating report for week: ${weekStart} to ${weekEnd}`);

        // 1. Fetch data
        const [blocksRes, goalsRes] = await Promise.all([
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', user.id)
                .gte('date', weekStart)
                .lte('date', weekEnd)
                .order('date', { ascending: true })
                .order('start_time', { ascending: true }),
            supabase.from('goals')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_paused', false)
        ]);

        if (blocksRes.error) throw blocksRes.error;
        if (goalsRes.error) throw goalsRes.error;

        const blocks = blocksRes.data || [];
        const goals = goalsRes.data || [];

        // 2. Aggregate Data
        let plannedMinutes = 0;
        let completedMinutes = 0;
        let skippedMinutes = 0;
        const goalStats: Record<string, { title: string; planned: number; completed: number; skipped: number; importance: string; weeklyTarget: number }> = {};

        goals.forEach(g => {
            goalStats[g.id] = {
                title: g.title,
                planned: 0,
                completed: 0,
                skipped: 0,
                importance: g.importance || 'medium',
                weeklyTarget: (g.minutes_per_day || 0) * (g.days_per_week || 7)
            };
        });

        const timeToMinutes = (t: string) => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return (h * 60) + m;
        };

        const skippedBlocks = [];
        const completedBlocks = [];
        const rescheduledBlocks = []; // if we track this

        blocks.forEach(b => {
            const duration = Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time));
            plannedMinutes += duration;

            // Blocks left unchecked (still 'planned' or 'in_progress') at end of week
            // are automatically treated as incomplete/missed for AI analysis.
            const effectiveStatus = (b.status === 'planned' || b.status === 'in_progress')
                ? 'missed'
                : b.status;

            if (effectiveStatus === 'done') {
                completedMinutes += duration;
                completedBlocks.push(b.title);
            } else if (effectiveStatus === 'missed') {
                skippedMinutes += duration;
                skippedBlocks.push(b.title);
            }

            if (b.goal_id && goalStats[b.goal_id]) {
                goalStats[b.goal_id].planned += duration;
                if (effectiveStatus === 'done') goalStats[b.goal_id].completed += duration;
                if (effectiveStatus === 'missed') goalStats[b.goal_id].skipped += duration;
            }
        });

        // 3. Prepare AI Prompt
        const systemPrompt = `You are PlannrAI, an elite AI productivity and lifestyle coach.
You are running a Weekly Review for the user. Your job is to analyze their performance for the week against their goals and commitments.
Be objective, empathetic, but very practical.

The user's schedule blocks this week:
- Total Planned Time: ${Math.round(plannedMinutes / 60)} hours
- Completed Time: ${Math.round(completedMinutes / 60)} hours
- Skipped Time: ${Math.round(skippedMinutes / 60)} hours

Goals Breakdown:
${Object.values(goalStats).map(g => `- ${g.title} (Importance: ${g.importance}): Target = ${Math.round(g.weeklyTarget / 60)}h. Planned = ${Math.round(g.planned / 60)}h, Completed = ${Math.round(g.completed / 60)}h, Skipped = ${Math.round(g.skipped / 60)}h`).join('\n')}

Based on this data, if you see a gap or misalignment (e.g., they didn't complete their required hours for a goal, or they planned too much and skipped a lot), propose adjusting their goals. You can propose lowering the times for some things, pausing/deleting a goal if it's completely ignored, or shifting priority.
If they nailed everything, congratulate them and suggest maintaining or slightly pushing.

You MUST respond in JSON format matching this schema:
{
    "summary": "A 2-3 sentence summary of their week.",
    "achievements": ["A bullet point celebrating a win", ...],
    "struggles": ["A bullet point calling out an area they struggled with", ...],
    "proposed_goal_changes": [
        {
            "goal_id": "the goal ID",
            "title": "the goal title",
            "change_type": "update_time" | "update_days" | "pause" | "delete",
            "old_value": "e.g., 60m/day x 5 days",
            "new_value": "e.g., 45m/day x 5 days",
            "new_minutes_per_day": 45,
            "new_days_per_week": 5,
            "rationale": "Short explanation of why this change makes sense based on their data."
        }
    ]
}
If no changes are needed, leave proposed_goal_changes empty.`;

        const aiRes = await callAI({
            model: 'smart',
            systemPrompt: 'You are an AI coach that outputs ONLY valid JSON matching the schema.',
            prompt: systemPrompt,
            requireJSON: true,
            useNvidia: true,
            timeout: 85000 // 85 seconds to prevent 55s abort, matching frontend 90s max
        });

        if (!aiRes.success) {
            throw new Error(aiRes.error || 'Failed to generate AI report');
        }

        return NextResponse.json({
            data: aiRes.data,
            metrics: {
                plannedMinutes,
                completedMinutes,
                skippedMinutes,
                goalStats
            },
            weekStart,
            weekEnd
        });

    } catch (error: any) {
        console.error('Generate Report error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
