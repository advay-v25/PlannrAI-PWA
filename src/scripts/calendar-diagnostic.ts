import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { buildCalendarContext } from '../lib/calendar/context-builder';
import { generateWeekPlan } from '../lib/calendar/ai/plan-week';

const WEEK_START = '2026-07-13';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const duration = (start: string, end: string) => {
    const toMins = (value: string) => {
        const [hours, minutes] = value.split(':').map(Number);
        return hours * 60 + minutes;
    };
    return Math.max(0, toMins(end) - toMins(start));
};

async function main() {
    const { data: activeGoals, error: goalsError } = await supabase
        .from('goals')
        .select('user_id')
        .eq('status', 'active');
    if (goalsError) throw goalsError;
    const goalCounts = new Map<string, number>();
    for (const goal of activeGoals || []) {
        goalCounts.set(goal.user_id, (goalCounts.get(goal.user_id) || 0) + 1);
    }
    const selectedUserId = [...goalCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!selectedUserId) throw new Error('No profile with active goals found');
    const context = await buildCalendarContext(selectedUserId, supabase);
    console.log(JSON.stringify({
        rhythm: { wake: context.user.sleep_end, sleep: context.user.sleep_start, chronotype: context.user.chronotype, weekend: context.user.weekend_intensity },
        goals: context.goals.map((goal) => ({ title: goal.title, pillar: goal.pillar, target: goal.weekly_target_minutes, energy: goal.energy_demand, preferred: goal.preferred_time_of_day })),
        commitments: context.commitments.length,
    }, null, 2));

    for (const chronotype of ['lark', 'bear', 'owl', 'wolf']) {
        for (const mode of ['balanced', 'momentum', 'recovery'] as const) {
            const simulated = { ...context, user: { ...context.user, chronotype } };
            const variants = await generateWeekPlan(simulated, WEEK_START, mode, false);

            for (const variant of variants) {
                const scheduled: Record<string, number> = {};
                const weekends: string[] = [];
                for (const block of variant.blocks) {
                    if (block.goal_id) {
                        const title = block.title.replace(/ \(Part\)$/, '');
                        scheduled[title] = (scheduled[title] || 0) + duration(block.start_time, block.end_time);
                    }
                    if (block.goal_id && ['2026-07-18', '2026-07-19'].includes(block.date)) {
                        weekends.push(`${block.date} ${block.title} ${block.start_time}-${block.end_time}`);
                    }
                }
                console.log(JSON.stringify({ chronotype, mode, variant: variant.label, scheduled, unscheduled: variant.stats.unscheduled_minutes, weekendGoalBlocksWhenDisabled: weekends }));
            }
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
