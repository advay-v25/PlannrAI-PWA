
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfWeek, endOfWeek, format } from 'date-fns';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        const { searchParams } = new URL(context.request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        
        const todayDateObj = new Date(date);
        const weekStartStr = format(startOfWeek(todayDateObj, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const weekEndStr = format(endOfWeek(todayDateObj, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        const nextWeekStartObj = new Date(todayDateObj);
        nextWeekStartObj.setDate(nextWeekStartObj.getDate() + 7);
        const nextWeekStartStr = format(startOfWeek(nextWeekStartObj, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const nextWeekEndStr = format(endOfWeek(nextWeekStartObj, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        // Resilient parallel fetching — each query catches its own errors
        const safeQuery = async (fn: () => any, fallback: any): Promise<any> => {
            try {
                const result = await Promise.resolve(fn());
                if (result?.error) {
                    console.warn('[HomeSummary] Query warning:', result.error.message);
                    return fallback;
                }
                return result?.data ?? fallback;
            } catch (e: any) {
                console.warn('[HomeSummary] Query failed:', e.message);
                return fallback;
            }
        };

        const results = await Promise.all([
            safeQuery(() => supabase.from('profiles').select('*, bio_data').eq('id', userId).single(), null),
            safeQuery(() => supabase.from('user_states')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle(), null),
            safeQuery(() => supabase.from('profile_preferences')
                .select('weekly_review_enabled')
                .eq('user_id', userId)
                .single(), null),
            safeQuery(() => supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .eq('date', date)
                .order('start_time'), []),
            safeQuery(() => supabase.from('commitments').select('*').eq('user_id', userId), []),
            safeQuery(() => supabase.from('goals').select('*').eq('user_id', userId), []),
            safeQuery(() => supabase.from('habit_stacks').select('*').eq('user_id', userId).eq('enabled', true), []),
            safeQuery(() => supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', weekStartStr)
                .lte('date', weekEndStr), []),
            safeQuery(() => supabase.from('schedule_blocks')
                .select('id')
                .eq('user_id', userId)
                .gte('date', nextWeekStartStr)
                .lte('date', nextWeekEndStr)
                .limit(1), []),
            safeQuery(() => supabase.from('task_items')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'pending')
                .order('order_index', { ascending: true })
                .limit(1)
                .maybeSingle(), null)
        ]);

        const profile = results[0];
        const userState = results[1];
        const prefs = results[2];
        const blocks = results[3];
        const anchors = results[4];
        const goals = results[5];
        const habitStacks = results[6];
        const weeklyBlocks = results[7];
        const nextWeekBlocks = results[8];
        const topTask = results[9];

        if (!profile) return apiError('Profile not found', 404);

        // --- Logic Engine ---

        // 1. Metrics Calculation
        let plannedMin = 0;
        let completedMin = 0;

        // Filter blocks for valid calculation (exclude buffers if desired, but "planned" usually implies all active blocks)
        // Valid types: anchor, body, craft, mind, meal
        const validTypes = ['anchor', 'goal', 'meal', 'routine', 'buffer', 'flex', 'wind_down', 'sleep', 'body', 'craft', 'mind'];
        const validBlocks = (blocks as any[])?.filter((b: any) => validTypes.includes(b.block_type)) || [];

        validBlocks.forEach((b: any) => {
            // Parse time carefully
            const start = new Date(`${date}T${b.start_time}`);
            const end = new Date(`${date}T${b.end_time}`);
            let duration = (end.getTime() - start.getTime()) / 60000;

            if (duration < 0) duration += 1440; // Handle crossing midnight if needed

            plannedMin += duration;
            if (b.status === 'done') completedMin += duration;
        });

        // Weekly metrics
        let wPlanned = 0;
        let wCompleted = 0;
        (weeklyBlocks as any[])?.filter((b: any) => validTypes.includes(b.block_type)).forEach((b: any) => {
            const start = new Date(`${b.date}T${b.start_time}`);
            const end = new Date(`${b.date}T${b.end_time}`);
            let duration = (end.getTime() - start.getTime()) / 60000;
            if (duration < 0) duration += 1440;

            wPlanned += duration;
            if (b.status === 'done') wCompleted += duration;
        });

        const freeMin = 1440 - plannedMin; // Crude approx

        // 2. Identification of "Next Up"
        const now = new Date();
        const currentTimeStr = now.toTimeString().slice(0, 5);

        let nextUpBlock = null;
        let nextUpReason = "Scheduled";

        if (blocks && blocks.length > 0) {
            const activeBlock = (blocks as any[]).find((b: any) => b.start_time <= currentTimeStr && b.end_time > currentTimeStr);
            if (activeBlock) {
                nextUpBlock = activeBlock;
                nextUpReason = "Now";
            } else {
                const futureBlock = (blocks as any[]).find((b: any) => b.start_time > currentTimeStr);
                if (futureBlock) {
                    nextUpBlock = futureBlock;
                    nextUpReason = "Up Next";
                }
            }
        }

        // 3. Insight Generation (Lightweight)
        let insight = { text: "Ready to conquer the day.", type: "neutral" };

        if (userState?.energy_level && userState.energy_level < 3) {
            insight = { text: "Energy is low. Prioritize the essentials.", type: "caution" };
        } else if (plannedMin > 300) {
            insight = { text: "Heavy load today. Pace yourself.", type: "info" };
        }

        // 4. Goal Sorting (Time commitment + Energy/Importance)
        // importance: high (3), medium (2), low (1)
        const getImportanceValue = (imp: string) => imp === 'high' ? 3 : imp === 'medium' ? 2 : 1;
        const sortedGoals = (goals || []).sort((a: any, b: any) => {
            // Primary sort: Time commitment (minutes_per_day) descending
            const timeA = a.minutes_per_day || 0;
            const timeB = b.minutes_per_day || 0;
            if (timeB !== timeA) return timeB - timeA;
            // Secondary sort: Energy/Importance descending
            return getImportanceValue(b.importance) - getImportanceValue(a.importance);
        });

        // 5. Construct Response
        return apiSuccess({
            date,
            timezone: profile.timezone,
            user_state: {
                energy_level: userState?.energy_level || 3,
                emotional_state: userState?.emotional_state || 'neutral'
            },
            day_window: {
                wake: profile.sleep_end || '07:00',
                sleep_start: profile.sleep_start,
                wind_down_min: profile.wind_down_mins
            },
            schedule_blocks: blocks || [],
            anchors: anchors || [],
            meals: (blocks || []).filter((b: any) => b.block_type === 'meal'),
            habit_stacks: habitStacks || [],
            goals: sortedGoals,
            top_task: topTask,
            next_up: nextUpBlock ? { ...nextUpBlock, reason: nextUpReason } : null,
            metrics: {
                planned_min: Math.round(plannedMin),
                completed_min: Math.round(completedMin),
                planned_items: validBlocks.length,
                completed_items: validBlocks.filter((b: any) => b.status === 'done').length,
                free_min: Math.round(freeMin)
            },
            weekly_metrics: {
                planned_min: Math.round(wPlanned),
                completed_min: Math.round(wCompleted),
                planned_items: ((weeklyBlocks || []) as any[]).filter((b: any) => validTypes.includes(b.block_type)).length,
                completed_items: ((weeklyBlocks || []) as any[]).filter((b: any) => validTypes.includes(b.block_type) && b.status === 'done').length
            },
            nextWeekPlanned: nextWeekBlocks && nextWeekBlocks.length > 0,
            ai_profile: (profile as any)?.bio_data?.ai_profile || null,
            needs_rescheduling: (profile as any)?.bio_data?.needs_rescheduling === true,
            weekly_review_enabled: prefs?.weekly_review_enabled !== false,
            insight
        });
    },
    { requireAuth: true, auditAction: 'home_summary' }
);
