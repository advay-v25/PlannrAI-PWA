import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { format, startOfWeek, endOfWeek, addDays, getDay } from 'date-fns';

export const GET = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;

        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        // 1. Fetch user profile for sleep/meal windows
        const { data: profile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end, meals_per_day, meal_windows')
            .eq('id', userId)
            .maybeSingle();

        // 2. Fetch active commitments (anchors)
        const { data: commitments } = await supabase
            .from('commitments')
            .select('id, title, start_time, end_time, days_of_week, is_active')
            .eq('user_id', userId)
            .eq('is_active', true);

        // 3. Fetch fixed schedule blocks for this week (already placed)
        const { data: fixedBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, date, start_time, end_time, title, block_type, is_fixed')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .eq('is_fixed', true);

        // Build conflict zones per day for the current week
        const sleepStart = profile?.sleep_start || '23:00';
        const sleepEnd = profile?.sleep_end || '07:00';
        const mealWindows = profile?.meal_windows || {
            breakfast: { start: '07:00', end: '10:00' },
            lunch: { start: '12:00', end: '15:00' },
            dinner: { start: '18:30', end: '21:30' },
        };

        const weekDays: Record<string, any[]> = {};

        for (let i = 0; i < 7; i++) {
            const dayDate = format(addDays(startOfWeek(now, { weekStartsOn: 1 }), i), 'yyyy-MM-dd');
            const dayOfWeek = getDay(new Date(dayDate + 'T12:00:00'));
            const conflicts: any[] = [];

            // Sleep blocks (non-editable)
            conflicts.push({
                type: 'sleep',
                title: 'Sleep',
                start_time: sleepStart,
                end_time: '23:59',
                editable: false,
                reason: 'Sleep window — protected time',
            });
            conflicts.push({
                type: 'sleep',
                title: 'Sleep',
                start_time: '00:00',
                end_time: sleepEnd,
                editable: false,
                reason: 'Sleep window — protected time',
            });

            // Meal windows (non-editable unless user explicitly overrides)
            for (const [mealName, window] of Object.entries(mealWindows as Record<string, any>)) {
                if (window?.start && window?.end) {
                    conflicts.push({
                        type: 'meal',
                        title: mealName.charAt(0).toUpperCase() + mealName.slice(1),
                        start_time: window.start,
                        end_time: window.end,
                        editable: false,
                        reason: `${mealName.charAt(0).toUpperCase() + mealName.slice(1)} window — protected time`,
                    });
                }
            }

            // Anchors/commitments for this day (non-editable)
            const dayCommitments = (commitments || []).filter((c: any) =>
                (c.days_of_week || []).includes(dayOfWeek)
            );

            for (const c of dayCommitments) {
                conflicts.push({
                    type: 'anchor',
                    title: c.title,
                    commitment_id: c.id,
                    start_time: c.start_time?.slice(0, 5),
                    end_time: c.end_time?.slice(0, 5),
                    editable: false,
                    reason: `Fixed commitment — cannot be moved`,
                });
            }

            // Fixed schedule blocks (already placed, non-editable)
            const dayFixedBlocks = (fixedBlocks || []).filter((b: any) => b.date === dayDate);
            for (const b of dayFixedBlocks) {
                // Avoid duplicating commitments that are already listed
                const isAlreadyListed = conflicts.some(
                    (c: any) => c.start_time === b.start_time?.slice(0, 5) && c.end_time === b.end_time?.slice(0, 5)
                );
                if (!isAlreadyListed) {
                    conflicts.push({
                        type: b.block_type || 'fixed',
                        title: b.title,
                        block_id: b.id,
                        start_time: b.start_time?.slice(0, 5),
                        end_time: b.end_time?.slice(0, 5),
                        editable: false,
                        reason: `Fixed block — cannot be moved unless explicitly unlocked`,
                    });
                }
            }

            weekDays[dayDate] = conflicts;
        }

        return apiSuccess({
            week_start: weekStart,
            week_end: weekEnd,
            conflicts: weekDays,
            rules: {
                sleep_protected: true,
                meals_protected: true,
                anchors_protected: true,
                description: 'These time slots cannot be used for scheduling unless explicitly overridden by the user.',
            },
        });
    },
    { requireAuth: true }
);
