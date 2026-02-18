import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { SchedulerService } from '@/lib/scheduler/scheduler-service';
import { startOfDay, addDays, format, parseISO } from 'date-fns';
import { z } from 'zod';
import { safeParseISO } from '@/lib/date-safe';

// Request Schema
const PlanWeekSchema = z.object({
    start_date: z.string().optional(), // Defaults to today
    mode: z.enum(['balanced', 'intense', 'recovery']).default('balanced'),
    allow_weekend: z.boolean().default(false)
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        // 1. Zod Validation
        const validation = PlanWeekSchema.safeParse(body);
        if (!validation.success) {
            return apiError(`Invalid Input: ${validation.error.message}`, 400);
        }

        const { start_date, mode, allow_weekend } = validation.data;

        // 2. Safe Date Parsing
        let startDate: Date;
        if (start_date) {
            const parsed = safeParseISO(start_date);
            if (!parsed) return apiError("Invalid start_date format. Expected ISO string.", 400);
            startDate = startOfDay(parsed);
        } else {
            startDate = startOfDay(new Date());
        }

        const days = 7;
        const endDate = addDays(startDate, days);
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        try {
            // 3. Fetch Full Context
            const [profileRes, commitmentsRes, goalsRes, habitsRes, existingBlocksRes] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
                supabase.from('goals').select('*').eq('user_id', userId).eq('is_paused', false),
                supabase.from('habit_stacks').select('*').eq('user_id', userId).eq('enabled', true),
                supabase.from('schedule_blocks')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('date', startStr)
                    .lt('date', endStr)
            ]);

            if (profileRes.error) return apiError('Failed to load profile', 500);

            const schedulerContext = {
                userId,
                weekStart: startDate,
                startDate, // Legacy support
                days,
                profile: profileRes.data,
                commitments: commitmentsRes.data || [],
                goals: goalsRes.data || [],
                habitStacks: habitsRes.data || [],
                existingBlocks: existingBlocksRes.data || []
            };

            // 4. Run Deterministic Scheduler (Baseline)
            // Wrapped in try-catch to catch inner scheduler errors
            const scheduler = new SchedulerService(schedulerContext as any); // Type assertion for now if mismatch
            let baselineBlocks: any[] = [];

            try {
                const result = await scheduler.generateBaseline();
                if (Array.isArray(result)) {
                    baselineBlocks = result;
                } else {
                    console.warn("[PlanWeek] Scheduler returned non-array:", result);
                }
            } catch (scheduleError) {
                console.error("[PlanWeek] Scheduler Error:", scheduleError);
                // Continue with empty baseline if scheduler fails, so AI can still try
            }

            // 5. AI Optimization
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

        } catch (e: any) {
            console.error("[PlanWeek] Unhandled Logic Error:", e);
            return apiError(`Planning failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);
