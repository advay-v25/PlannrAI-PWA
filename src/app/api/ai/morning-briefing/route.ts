import { createClient } from '@/lib/supabase/server';
import { generateMorningBriefing } from '@/lib/ai/groq-client';
import { NextResponse } from 'next/server';
import { subDays } from 'date-fns';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Get User Profile (Name)
        const { data: profile } = await supabase
            .from('profiles')
            .select('preferred_name')
            .eq('id', user.id)
            .single();

        const userName = profile?.preferred_name || user.user_metadata?.full_name || 'there';

        // 2. Get Today's Schedule
        const today = new Date().toISOString().split('T')[0];
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('start_time', { ascending: true });

        // 3. Get Active Goals
        const { data: goals } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_paused', false);

        // 4. Get Yesterday's Log (for context)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const { data: yesterdayLog } = await supabase
            .from('daily_logs')
            .select('*')
            .eq('user_id', user.id)
            .eq('log_date', yesterdayStr)
            .single();

        // 5. Get Stagnant Goals (Not updated in 7 days)
        const sevenDaysAgo = subDays(new Date(), 7).toISOString();
        const { data: stagnantGoals } = await supabase
            .from('goals')
            .select('title, updated_at')
            .eq('user_id', user.id)
            .eq('is_paused', false)
            .lt('updated_at', sevenDaysAgo);

        // 6. Get High Streaks
        const { data: habitStacks } = await supabase
            .from('habit_stacks')
            .select('action_habit, current_streak')
            .eq('user_id', user.id)
            .gte('current_streak', 3);

        // 7. Get Overdue Tasks (from yesterday)
        const { data: overdueBlocks } = await supabase
            .from('schedule_blocks')
            .select('context')
            .eq('user_id', user.id)
            .eq('date', yesterdayStr)
            .neq('status', 'done');

        // 8. Generate Briefing
        const briefing = await generateMorningBriefing({
            userName,
            blocks: blocks || [],
            goals: goals || [],
            yesterdayLog,
            stagnantGoals: stagnantGoals?.map(g => ({
                title: g.title,
                days_inactive: Math.floor((new Date().getTime() - new Date(g.updated_at).getTime()) / (1000 * 60 * 60 * 24))
            })) || [],
            highStreaks: habitStacks?.map(h => ({
                name: h.action_habit,
                streak: h.current_streak
            })) || [],
            overdueTasks: overdueBlocks?.map(b => ({
                title: b.context || 'Untitled Task'
            })) || []
        }, user.id);

        return NextResponse.json({ success: true, briefing });

    } catch (error) {
        console.error('Morning briefing API error:', error);
        return NextResponse.json(
            { error: 'Failed to generate briefing' },
            { status: 500 }
        );
    }
}
