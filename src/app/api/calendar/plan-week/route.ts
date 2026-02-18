import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { SchedulerService } from '@/lib/scheduler/scheduler-service';
import { startOfDay, addDays, format, parseISO } from 'date-fns';

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;
        const { start_date, mode, allow_weekend } = body as {
            start_date: string;
            mode: 'balanced' | 'intense' | 'recovery';
            allow_weekend?: boolean
        };

        const startDate = start_date ? parseISO(start_date) : startOfDay(new Date());
        const days = 7;
        const endDate = addDays(startDate, days);
        const startStr = format(startDate, 'yyyy-MM-dd');

        // 1. Fetch Full Context
        const [profileRes, commitmentsRes, goalsRes, habitsRes, existingBlocksRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).single(),
            supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
            supabase.from('goals').select('*').eq('user_id', userId).eq('is_paused', false),
            supabase.from('habit_stacks').select('*').eq('user_id', userId).eq('enabled', true),
            supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startStr)
                .lt('date', format(endDate, 'yyyy-MM-dd'))
        ]);

        if (profileRes.error) return apiError('Failed to load profile', 500);

        const schedulerContext = {
            startDate,
            days,
            profile: profileRes.data,
            commitments: commitmentsRes.data || [],
            goals: goalsRes.data || [],
            habitStacks: habitsRes.data || [],
            existingBlocks: existingBlocksRes.data || []
        };

        // 2. Run Deterministic Scheduler (Baseline)
        const scheduler = new SchedulerService(schedulerContext);
        const baselineBlocks = await scheduler.generateBaseline();

        // 3. AI Optimization
        const { executeAI } = await import('@/lib/ai/ai-service');

        const aiContext = {
            ...schedulerContext,
            baseline_blocks_count: baselineBlocks.length,
            baseline_sample: baselineBlocks.slice(0, 50).map((b: any) => `${b.title} (${b.start_time}-${b.end_time})`)
        };

        const aiResponse = await executeAI(userId, {
            channel: 'calendar_plan_week',
            input: `Plan week starting ${startStr}. Mode: ${mode}. Weekend allowed: ${allow_weekend}`,
            context: aiContext
        });

        return apiSuccess(aiResponse);
    },
    { requireAuth: true }
);
