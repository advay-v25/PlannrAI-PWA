import { secureApiRoute, apiSuccess } from '@/lib/security/api-protection';

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
    async (context, req) => {
        // secureApiRoute passes generic req, we can cast it if we need specific NextRequest methods,
        // but here we just need the url.
        const requestUrl = (req as any).url || '';
        const searchParams = new URL(requestUrl, 'http://localhost').searchParams;
        const dateStr = searchParams.get('date');

        // Use provided date or server's local date
        let today = new Date();
        if (dateStr) {
            today = new Date(dateStr);
        }

        const isoDate = today.toISOString().split('T')[0];
        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const supabase = context.supabase;
        const userId = context.userId || '5eaf0087-f547-4d87-a235-facd3bd3b997';

        // 1. Fetch Profile for Boundaries (Sleep, Routines)
        const { data: profile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end, wind_down_mins')
            .eq('id', userId)
            .single();

        // 2. Fetch Today's Blocks
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', isoDate)
            .order('start_time', { ascending: true });

        // 3. Determine State Machine
        let currentState: HomeState = 'NO_SCHEDULE';
        let activeBlock = null;
        let nextBlock = null;
        let timeRemainingInBlock: number | null = null;
        let timeUntilNextBlock: number | null = null;

        if (!blocks || blocks.length === 0) {
            currentState = 'NO_SCHEDULE';
        } else {
            const wakeTime = profile?.sleep_end || '07:00';
            const sleepTime = profile?.sleep_start || '23:00';
            const firstBlock = blocks[0];
            const lastBlock = blocks[blocks.length - 1];

            // Helpers to compare "HH:MM"
            const timeToMinutes = (time: string) => {
                const [h, m] = time.split(':').map(Number);
                return h * 60 + m;
            };
            const currentMins = timeToMinutes(currentTimeStr);
            const wakeMins = timeToMinutes(wakeTime);
            let sleepMins = timeToMinutes(sleepTime);
            if (sleepMins < wakeMins) sleepMins += 24 * 60; // handle wrap around

            if (currentMins >= sleepMins || currentMins < wakeMins) {
                // Technically asleep or deep night, treat as day complete if late
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
                // Middle of the day logic
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
                    else if (currentMins >= endMins) {
                        if (i + 1 < blocks.length) {
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

            if (currentState === 'BETWEEN_BLOCKS') {
                const isBehind = false;
                if (isBehind) currentState = 'BEHIND_SCHEDULE';
            }
        }

        const mockInsights: Record<HomeState, string> = {
            'MORNING_ROUTINE': "Your first block is heavy coding. High energy needed. Grab coffee?",
            'BETWEEN_BLOCKS': "You have 15 mins. Your next block is 'Email Triage'. Step away from the screen.",
            'IN_BLOCK': "Focus mode active. You have 25 minutes left on this task.",
            'BEHIND_SCHEDULE': "I noticed the last block overran. Want me to shift the rest of the day by 15m?",
            'DAY_COMPLETE': "All done. 4 blocks completed. Time to wind down.",
            'NO_SCHEDULE': "No schedule found for today. Should we generate one?",
            'AHEAD_OF_SCHEDULE': "You finished that block early. Take the win and rest."
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
            proactive_insight: mockInsights[currentState]
        });
    },
    { requireAuth: process.env.NODE_ENV !== 'development', auditAction: 'home_state_read' }
);
