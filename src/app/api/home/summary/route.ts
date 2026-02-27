
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;
        const { searchParams } = new URL(context.request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

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

        const [profile, userState, blocks, anchors, goals, habitStacks, tasks] = await Promise.all([
            safeQuery(() => supabase.from('profiles').select('*, bio_data').eq('id', userId).single(), null),
            safeQuery(() => supabase.from('user_states').select('*').eq('user_id', userId).single(), null),
            safeQuery(() => supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .eq('date', date)
                .order('start_time'), []),
            safeQuery(() => supabase.from('commitments').select('*').eq('user_id', userId), []),
            safeQuery(() => supabase.from('goals').select('id, title, pillar').eq('user_id', userId), []),
            safeQuery(() => supabase.from('habit_stacks').select('*').eq('user_id', userId).eq('enabled', true), []),
            safeQuery(() => supabase.from('task_items').select('*').eq('user_id', userId).neq('status', 'done'), [])
        ]);

        if (!profile) return apiError('Profile not found', 404);

        // --- Logic Engine ---

        // 1. Metrics Calculation
        let plannedMin = 0;
        let completedMin = 0;

        // Filter blocks for valid calculation (exclude buffers if desired, but "planned" usually implies all active blocks)
        // Valid types: anchor, body, craft, mind, meal
        const validTypes = ['anchor', 'body', 'craft', 'mind', 'meal'];
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

        const freeMin = 1440 - plannedMin; // Crude approx, refinement needed for "awake free time"

        // 2. Identification of "Next Up"
        const now = new Date();
        const currentTimeStr = now.toTimeString().slice(0, 5);

        // Simple logic: Find first block that hasn't ended and is NOT 'done' (or is current)
        // If date is not today, logic shifts (start of day)
        // Assuming 'date' is today for this logic
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

        // 4. Construct Response
        return apiSuccess({
            date,
            timezone: profile.timezone,
            user_state: {
                energy_level: userState?.energy_level || 3,
                emotional_state: userState?.emotional_state || 'neutral'
            },
            day_window: {
                wake: '07:00', // TODO: Pull from preferences if stored, or infer
                sleep_start: profile.sleep_start,
                wind_down_min: profile.wind_down_mins
            },
            schedule_blocks: blocks || [],
            anchors: anchors || [],
            meals: [], // TODO: If meals are schedule blocks, they are in 'blocks'. If separate, fetch.
            habit_stacks: habitStacks || [],
            tasks: tasks || [],
            next_up: nextUpBlock ? { ...nextUpBlock, reason: nextUpReason } : null,
            metrics: {
                planned_min: Math.round(plannedMin),
                completed_min: Math.round(completedMin),
                free_min: Math.round(freeMin)
            },
            ai_profile: (profile as any)?.bio_data?.ai_profile || null,
            insight
        });
    },
    { requireAuth: true, auditAction: 'home_summary' }
);
