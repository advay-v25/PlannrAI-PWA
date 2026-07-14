import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { DEFAULT_TIMEZONE, nowInTimezone } from '@/lib/timezone';

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
    | 'DAY_COMPLETE'
    | 'PLANNING_NEEDED';

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

            // Use user's timezone for date/time calculations (safely fallback if invalid)
            let timezone = profile?.timezone || DEFAULT_TIMEZONE;
            const now = new Date();
            let dateFormatter: Intl.DateTimeFormat;
            let timeFormatter: Intl.DateTimeFormat;
            try {
                dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
                timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
            } catch (e) {
                console.warn(`[HomeState] Invalid timezone string: ${timezone}, falling back to ${DEFAULT_TIMEZONE}`);
                timezone = DEFAULT_TIMEZONE;
                dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
                timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: DEFAULT_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
            }

            // Use provided date param or the user's local date
            const dateParam = context.request.nextUrl.searchParams.get('date');
            const isoDate = dateParam || dateFormatter.format(now);
            const currentTimeStr = timeFormatter.format(now);
            
            // Check if it's Friday (5), Saturday (6), or Sunday (0)
            const dayOfWeek = new Date(isoDate).getDay();
            const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

            // 2. Fetch Today's Blocks and Anchors
            let blocks: any[] = [];
            try {
                const { data: scheduleBlocks } = await supabase
                    .from('schedule_blocks')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('date', isoDate);
                
                const { data: commitments } = await supabase
                    .from('commitments')
                    .select('*')
                    .eq('user_id', userId);

                // Filter commitments by dayOfWeek
                const activeCommitments = (commitments || []).filter(c => 
                    c.days_of_week && c.days_of_week.includes(dayOfWeek) && c.is_active !== false &&
                    !scheduleBlocks?.some(sb => sb.commitment_id === c.id) // Avoid duplicates
                ).map(c => ({
                    ...c,
                    title: c.name || c.title || 'Commitment',
                    block_type: 'anchor',
                    date: isoDate
                }));

                blocks = [...(scheduleBlocks || []), ...activeCommitments].sort((a, b) => {
                    if (a.start_time < b.start_time) return -1;
                    if (a.start_time > b.start_time) return 1;
                    return 0;
                });
            } catch (e) {
                console.warn('[HomeState] Blocks fetch failed:', e);
            }

            // If weekend, check next week's blocks
            let nextWeekNeedsPlanning = false;
            if (isWeekend) {
                try {
                    const todayDateObj = new Date(isoDate);
                    const nextMonday = new Date(todayDateObj);
                    nextMonday.setDate(todayDateObj.getDate() + ((1 + 7 - todayDateObj.getDay()) % 7 || 7));
                    const nextMondayStr = nextMonday.toISOString().split('T')[0];

                    const { count } = await supabase
                        .from('schedule_blocks')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', userId)
                        .gte('date', nextMondayStr)
                        .eq('block_type', 'goal'); // focus on actual AI generated goal blocks
                    
                    if (count === 0) {
                        nextWeekNeedsPlanning = true;
                    }
                } catch (e) {
                    console.warn('[HomeState] Next week check failed:', e);
                }
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

                // PRIORITY 1: Check if we are inside or between any scheduled blocks.
                // This takes precedence over generic sleep/wake boundaries so that
                // blocks like "Work 09:00–19:00" always win over a misconfigured sleep_start.
                let foundState = false;
                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    const startMins = timeToMinutes(block.start_time);
                    const endMins = timeToMinutes(block.end_time);

                    if (currentMins >= startMins && currentMins < endMins) {
                        currentState = 'IN_BLOCK';
                        activeBlock = block;
                        timeRemainingInBlock = endMins - currentMins;
                        if (i + 1 < blocks.length) nextBlock = blocks[i + 1];
                        foundState = true;
                        break;
                    }
                    else if (currentMins >= endMins && i + 1 < blocks.length) {
                        const nextStartMins = timeToMinutes(blocks[i + 1].start_time);
                        if (currentMins < nextStartMins) {
                            currentState = 'BETWEEN_BLOCKS';
                            nextBlock = blocks[i + 1];
                            timeUntilNextBlock = nextStartMins - currentMins;
                            foundState = true;
                            break;
                        }
                    }
                }

                // PRIORITY 2: Fall back to sleep/wake/morning/day-complete boundaries
                if (!foundState) {
                    const hasFutureBlocks = blocks.some((b: any) => timeToMinutes(b.start_time) > currentMins);

                    if (hasFutureBlocks) {
                        // If there are future blocks today, we are between blocks
                        if (currentMins < timeToMinutes(firstBlock.start_time)) {
                            // Before the very first block
                            currentState = 'MORNING_ROUTINE';
                        } else {
                            currentState = 'BETWEEN_BLOCKS';
                        }
                        nextBlock = blocks.find((b: any) => timeToMinutes(b.start_time) > currentMins);
                        timeUntilNextBlock = nextBlock ? timeToMinutes(nextBlock.start_time) - currentMins : null;
                    } else {
                        // No future blocks today
                        if (currentMins >= timeToMinutes(lastBlock.end_time)) {
                            currentState = 'DAY_COMPLETE';
                            activeBlock = lastBlock;
                        } else {
                            // Fallback if something weird happened
                            currentState = 'DAY_COMPLETE';
                        }
                    }
                }

                // Check for BEHIND_SCHEDULE: if blocks with end_time < currentTime are still 'planned'
                // Never override IN_BLOCK — the active block always takes priority.
                const missedBlocks = blocks.filter((b: any) => {
                    const endMins = timeToMinutes(b.end_time);
                    return endMins < currentMins && b.status === 'planned';
                });
                if (missedBlocks.length >= 2 && currentState !== 'DAY_COMPLETE' && currentState !== 'IN_BLOCK') {
                    currentState = 'BEHIND_SCHEDULE';
                }
            }

            const insights: Record<HomeState, string> = {
                'MORNING_ROUTINE': "Morning routine active. Your first block is coming up — get ready.",
                'BETWEEN_BLOCKS': nextBlock ? `Break time. Next: "${nextBlock.title || 'the next block'}" in ${timeUntilNextBlock}m.` : "Break time. You have free space.",
                'IN_BLOCK': activeBlock ? `Focus mode: "${activeBlock.title || activeBlock.context || 'Focused Block'}". ${timeRemainingInBlock}m remaining.` : "Focus mode active.",
                'BEHIND_SCHEDULE': "Running behind. Want me to shift the rest of the day?",
                'DAY_COMPLETE': "All done for today. Time to wind down.",
                'NO_SCHEDULE': "No schedule for today. Plan your day or let AI generate one.",
                'AHEAD_OF_SCHEDULE': "Ahead of schedule — nice! Take the win.",
                'PLANNING_NEEDED': "Next week is completely empty. Let AI generate your schedule now."
            };

            // Override state if planning is needed for next week
            if (nextWeekNeedsPlanning && currentState === 'NO_SCHEDULE') {
                currentState = 'PLANNING_NEEDED';
            } else if (nextWeekNeedsPlanning && currentState === 'DAY_COMPLETE') {
                currentState = 'PLANNING_NEEDED';
            } else if (nextWeekNeedsPlanning && currentState === 'MORNING_ROUTINE' && blocks.length === 0) {
                currentState = 'PLANNING_NEEDED';
            }

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
            // Return safe fallback instead of 500 — compute in the app's default
            // timezone rather than the server's local clock (Vercel runs UTC).
            const fallbackNow = nowInTimezone(DEFAULT_TIMEZONE);
            return apiSuccess({
                date: fallbackNow.date,
                current_time: fallbackNow.time,
                state: 'NO_SCHEDULE' as HomeState,
                active_block: null,
                next_block: null,
                metrics: {
                    time_remaining_in_block: null,
                    time_until_next_block: null
                },
                proactive_insight: "System degraded. Displaying fallback schedule.",
                is_fallback: true,
                error_message: error?.message || 'Unknown error'
            });
        }
    },
    { requireAuth: true, auditAction: 'home_state_read' }
);
