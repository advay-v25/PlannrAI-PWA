
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { startOfDay, addDays, format, parseISO } from 'date-fns';

export const GET = secureApiRoute(
    async (context) => {
        const { searchParams } = new URL(context.request.url);
        const startParam = searchParams.get('start');
        const daysParam = searchParams.get('days');

        const startDate = startParam ? parseISO(startParam) : startOfDay(new Date());
        const days = daysParam ? parseInt(daysParam, 10) : 7;
        const endDate = addDays(startDate, days);

        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        const supabase = await createClient();

        // Parallel Fetch: Profile (not profile_preferences), Commitments, Goals, Habits, Blocks
        const [profileRes, commitmentsRes, goalsRes, habitsRes, blocksRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', context.userId).single(),
            supabase.from('commitments').select('*').eq('user_id', context.userId).eq('is_active', true),
            supabase.from('goals').select('*').eq('user_id', context.userId).eq('is_paused', false),
            supabase.from('habit_stacks').select('*').eq('user_id', context.userId).eq('enabled', true),
            supabase.from('schedule_blocks')
                .select('*, goal:goals(*)')
                .eq('user_id', context.userId)
                .gte('date', startStr)
                .lt('date', endStr)
        ]);

        const profile = profileRes.data || {};
        const commitments = commitmentsRes.data || [];
        const goals = goalsRes.data || [];
        const habits = habitsRes.data || [];
        const blocks = blocksRes.data || [];

        // --- Metrics Calculation ---
        const metrics = {
            planned: blocks.filter((b: any) => b.status === 'planned').length,
            done: blocks.filter((b: any) => b.status === 'done').length,
            missed: blocks.filter((b: any) => b.status === 'missed').length
        };

        // --- Conflict Detection ---
        const conflicts: any[] = [];
        const blocksByDay = blocks.reduce((acc: any, b: any) => {
            acc[b.date] = acc[b.date] || [];
            acc[b.date].push(b);
            return acc;
        }, {});

        Object.keys(blocksByDay).forEach(date => {
            const dayBlocks = blocksByDay[date];
            for (let i = 0; i < dayBlocks.length; i++) {
                for (let j = i + 1; j < dayBlocks.length; j++) {
                    const b1 = dayBlocks[i];
                    const b2 = dayBlocks[j];

                    const [h1, m1] = b1.start_time.split(':').map(Number);
                    const [h2, m2] = b1.end_time.split(':').map(Number);
                    const [h3, m3] = b2.start_time.split(':').map(Number);
                    const [h4, m4] = b2.end_time.split(':').map(Number);

                    const start1 = h1 * 60 + m1;
                    const end1 = h2 * 60 + m2;
                    const start2 = h3 * 60 + m3;
                    const end2 = h4 * 60 + m4;

                    if (start1 < end2 && end1 > start2) {
                        conflicts.push({
                            date,
                            block_ids: [b1.id, b2.id],
                            type: 'overlap',
                            severity: 'high'
                        });
                    }
                }
            }
        });

        return apiSuccess({
            range: { start: startStr, end: endStr },
            profile,
            commitments,
            goals,
            habit_stacks: habits,
            blocks,
            metrics,
            conflicts
        });
    },
    { requireAuth: true }
);
