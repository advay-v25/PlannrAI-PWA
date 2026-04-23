import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

/**
 * V1 Mission Control State Machine Logic
 * Defines the 7 core states based on the current time and user's schedule.
 */
export type HomeState =
    | 'NO_SCHEDULE'
    | 'MORNING_ROUTINE'
    | 'IN_BLOCK'
    | 'BETWEEN_BLOCKS'
    | 'BEHIND_SCHEDULE'
    | 'AHEAD_OF_SCHEDULE'
    | 'DAY_COMPLETE';

export const GET = secureApiRoute(
    async (context) => {
        try {
            const supabase = context.supabase;
            const userId = context.userId;

            if (!userId) {
                return apiError('Unauthorized', 401);
            }

            // 1. Fetch Profile for Boundaries (Sleep, Routines, Timezone) — resilient
            let profile: any = null;
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('sleep_start, sleep_end, wind_down_mins, timezone')
                    .eq('id', userId)
                    .single();
                profile = data;
            } catch (e) {
                console.warn('[HomeState] Profile fetch failed:', e);
            }

            // Use user's timezone for date/time calculations
            const timezone = profile?.timezone || 'UTC';
            const now = new Date();
            const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });

            // Use provided date param or the user's local date
            const dateParam = context.request.nextUrl.searchParams.get('date');
            const isoDate = dateParam || dateFormatter.format(now);
            const currentTimeStr = timeFormatter.format(now);

            // 2. Fetch Today's Blocks — resilient
            let blocks: any[] = [];
            try {
                const { data } = await supabase
                    .from('schedule_blocks')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('date', isoDate)
                    .order('start_time', { ascending: true });
                blocks = data || [];
            } catch (e) {
                console.warn('[HomeState] Blocks fetch failed:', e);
            }

            // 3. Determine State Machine
            let currentState: HomeState = 'NO_SCHEDULE';
            let activeBlock = null;
            let nextBlock = null;
            let timeRemainingInBlock: number | null = null;
            let timeUntilNextBlock: number | null = null;

            const timeToMinutes = (time: string) => {
                const parts = time.split(':').map(Number);
                return (parts[0] || 0) * 60 + (parts[1] || 0);
            };

            if (blocks.length > 0) {
                const wakeTime = profile?.sleep_end || '07:00';
                const sleepTime = profile?.sleep_start || '23:00';
                const firstBlock = blocks[0];
                const lastBlock = blocks[blocks.length - 1];

                const currentMins = timeToMinutes(currentTimeStr);
                const wakeMins = timeToMinutes(wakeTime);
                let sleepMins = timeToMinutes(sleepTime);
                if (sleepMins < wakeMins) sleepMins += 24 * 60;

                if (currentMins >= sleepMins || currentMins < wakeMins) {
                    currentState = currentMins >= sleepMins ? 'DAY_COMPLETE' : 'MORNING_ROUTINE';
                }
                else if (currentMins >= wakeMins && currentMins < timeToMinutes(firstBlock.start_time)) {
                    currentState = 'MORNING_ROUTINE';
                    nextBlock = firstBlock;
                    timeUntilNextBlock = timeToMinutes(firstBlock.start_time) - currentMins;
                }
                else if (currentMins > timeToMinutes(lastBlock.end_time)) {
                    currentState = 'DAY_COMPLETE';
                }
                else {
                    for (let i = 0; i < blocks.length; i++) {
                        const block = blocks[i];
                        const startMins = timeToMinutes(block.start_time);
                        const endMins = timeToMinutes(block.end_time);

                        if (currentMins >= startMins && currentMins < endMins) {
                            currentState = 'IN_BLOCK';
                            activeBlock = block;
                            timeRemainingInBlock = endMins - currentMins;
                            if (i + 1 < blocks.length) nextBlock = blocks[i + 1];
                            break;
                        }
                        else if (currentMins >= endMins && i + 1 < blocks.length) {
                            const nextStartMins = timeToMinutes(blocks[i + 1].start_time);
                            if (currentMins < nextStartMins) {
                                currentState = 'BETWEEN_BLOCKS';
                                nextBlock = blocks[i + 1];
                                timeUntilNextBlock = nextStartMins - currentMins;
                                break;
                            }
                        }
                    }
                }
            }

            const insights: Record<HomeState, string> = {
                'MORNING_ROUTINE': "Morning routine active. Your first block is coming up — get ready.",
                'BETWEEN_BLOCKS': nextBlock ? `Break time. Next: "${nextBlock.title}" in ${timeUntilNextBlock}m.` : "Break time. You have free space.",
                'IN_BLOCK': activeBlock ? `Focus mode: "${activeBlock.title}". ${timeRemainingInBlock}m remaining.` : "Focus mode active.",
                'BEHIND_SCHEDULE': "Running behind. Want me to shift the rest of the day?",
                'DAY_COMPLETE': "All done for today. Time to wind down.",
                'NO_SCHEDULE': "No schedule for today. Plan your day or let AI generate one.",
                'AHEAD_OF_SCHEDULE': "Ahead of schedule — nice! Take the win."
            };

            return apiSuccess({
                date: isoDate,
                current_time: currentTimeStr,
                state: currentState,
                active_block: activeBlock,
                next_block: nextBlock,
                metrics: {
                    time_remaining_in_block: timeRemainingInBlock,
                    time_until_next_block: timeUntilNextBlock
                },
                proactive_insight: insights[currentState]
            });
        } catch (error: any) {
            console.error('[HomeState] Unexpected error:', error);
            // Return safe fallback instead of 500
            return apiSuccess({
                date: new Date().toISOString().split('T')[0],
                current_time: new Date().toTimeString().slice(0, 5),
                state: 'NO_SCHEDULE' as HomeState,
                active_block: null,
                next_block: null,
                metrics: {
                    time_remaining_in_block: null,
                    time_until_next_block: null
                },
                proactive_insight: "Loading your schedule..."
            });
        }
    },
    { requireAuth: true, auditAction: 'home_state_read' }
);

