import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateCoachResponse } from '../src/lib/coach/response-generator';
import { buildCalendarContext } from '../src/lib/calendar/context-builder';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const userId = '8bb069d3-744f-4d4e-a2ea-8866fb981a70';

async function main() {
    console.log(`Generating AI Schedule Context for user: ${userId}`);

    // Build Coach Context
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId);
    const { data: commitments } = await supabase.from('commitments').select('*').eq('user_id', userId);
    const { data: todos } = await supabase.from('todos').select('*').eq('user_id', userId).eq('is_completed', false);

    const todayStr = '2026-05-21'; // matching Thursday May 21

    const { data: todayBlocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('date', todayStr)
        .order('start_time', { ascending: true });

    const tomorrowStr = '2026-05-22';
    const { data: tomorrowBlocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('date', tomorrowStr)
        .order('start_time', { ascending: true });

    const { data: weekBlocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .gte('date', '2026-05-18')
        .lte('date', '2026-05-24')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

    const coachCtx = {
        current: {
            date: todayStr,
            time: '14:31',
            day_of_week: 'thursday'
        },
        user: profile,
        user_state: {
            is_minimal_mode: false,
            recent_missed_blocks: 1,
            last_energy_checkin: null
        },
        schedule: {
            today: todayBlocks || [],
            tomorrow: tomorrowBlocks || [],
            this_week: weekBlocks || []
        },
        goals: goals || [],
        commitments: commitments || [],
        todos: todos || [],
        learned_preferences: []
    };

    const calCtx = await buildCalendarContext(userId, supabase);

    // Call buildScheduleContextForAI indirectly or check response-generator's buildScheduleContextForAI
    // Let's import it dynamically or copy it
    const { buildScheduleContextForAI } = require('../src/lib/coach/response-generator');
    const aiCtxText = buildScheduleContextForAI(coachCtx as any, calCtx);

    console.log("\n=== AI CONTEXT TEXT ===");
    console.log(aiCtxText);
}

main();
