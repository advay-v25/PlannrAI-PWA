import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { buildCalendarContext } from '../src/lib/calendar/context-builder';
import { generateWeekPlan } from '../src/lib/calendar/ai/plan-week';
import { SchedulingProtocol } from '../src/lib/scheduling/protocol';

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const userId = '08187789-1f62-47f7-b7d3-f1bc299b4446';

    // buildCalendarContext(userId, supabase)
    const ctx = await buildCalendarContext(userId, supabase as any);

    const effectiveMode = 'balanced';
    const modeConfig = SchedulingProtocol.getModeConfig(effectiveMode);

    const variants = await generateWeekPlan(ctx, '2026-08-31', effectiveMode, false, {
        maxGoalBlocksPerDay: modeConfig.maxGoalBlocksPerDay,
        maxDeepWorkMins: modeConfig.maxDeepWorkMins,
    });

    const v = variants[0];
    
    // Block count by type
    const blockCounts: Record<string, number> = {};
    for (const b of v.blocks) {
        blockCounts[b.block_type] = (blockCounts[b.block_type] || 0) + 1;
    }
    console.log('\n--- Block count by type ---');
    console.log(blockCounts);

    // Morning Routine's start time on every day
    console.log('\n--- Morning Routine start times ---');
    const routines = v.blocks.filter(b => b.block_type === 'routine');
    for (const b of routines) {
        console.log(`${b.date}: ${b.start_time} - ${b.end_time}`);
    }

    // Meals present per day
    console.log('\n--- Meals present per day ---');
    const mealsByDay: Record<string, string[]> = {};
    for (const b of v.blocks) {
        if (b.block_type === 'meal') {
            if (!mealsByDay[b.date]) mealsByDay[b.date] = [];
            mealsByDay[b.date].push(b.title);
        }
    }
    for (const date in mealsByDay) {
        console.log(`${date}: ${mealsByDay[date].join(', ')}`);
    }

    // Per-goal minutes placed against target
    console.log('\n--- Per-goal minutes placed vs targeted ---');
    if (v.stats.goal_placements) {
        for (const p of v.stats.goal_placements) {
            console.log(`${p.title}: ${p.placed_mins}m placed / ${p.target_mins}m target`);
        }
    } else {
        console.log('No goal_placements in stats (legacy output)');
        // Try to compute manually
        const placedByGoal: Record<string, number> = {};
        for (const b of v.blocks) {
            if (b.block_type === 'goal' && b.goal_id) {
                const startMins = Number(b.start_time.split(':')[0]) * 60 + Number(b.start_time.split(':')[1]);
                const endMins = Number(b.end_time.split(':')[0]) * 60 + Number(b.end_time.split(':')[1]);
                placedByGoal[b.goal_id] = (placedByGoal[b.goal_id] || 0) + (endMins - startMins);
            }
        }
        for (const goal of ctx.goals) {
            const placed = placedByGoal[goal.id] || 0;
            const progress = ctx.goalProgress?.find(p => p.goal_id === goal.id);
            const targetMins = progress ? progress.remaining_minutes : (goal.days_per_week || 5) * (goal.minutes_per_day || 60);
            console.log(`${goal.title}: ${placed}m placed / ${targetMins}m target`);
        }
    }
}

main().catch(console.error);
