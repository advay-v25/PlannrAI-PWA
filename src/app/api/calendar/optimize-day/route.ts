import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfDay, format, parseISO } from 'date-fns';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { date, focus } = body as {
            date: string;
            focus?: 'reduce_overwhelm' | 'maximize_output' | 'rebalance_pillars'
        };

        const targetDate = date ? parseISO(date) : startOfDay(new Date());
        const dateStr = format(targetDate, 'yyyy-MM-dd');

        // 1. Fetch Context for Day + User Profile
        const [profileRes, commitmentsRes, currentBlocksRes, goalsRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).single(),
            supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', dateStr)
                .lte('date', dateStr),
            supabase.from('goals').select('title, priority, pillar, status').eq('user_id', userId).eq('is_paused', false)
        ]);

        if (profileRes.error) return apiError('Failed to load profile', 500);

        const aiContext = {
            date: dateStr,
            focus,
            profile: profileRes.data,
            commitments: commitmentsRes.data || [],
            blocks: currentBlocksRes.data || [],
            goals: goalsRes.data || []
        };

        const { executeAI } = await import('@/lib/ai/ai-service');

        const aiResponse = await executeAI(userId, {
            channel: 'calendar_optimize_day',
            input: `Optimize schedule for ${dateStr}. Focus: ${focus || 'balance'}`,
            context: aiContext
        });

        return apiSuccess(aiResponse);
    },
    { requireAuth: true }
);
