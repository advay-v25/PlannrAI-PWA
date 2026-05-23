import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const userId = users?.[0]?.id || (await supabase.from('profiles').select('id').limit(1)).data?.[0]?.id;
    
    const { buildCalendarContext } = await import('../lib/calendar/context-builder');
    const { generateWeekPlan } = await import('../lib/calendar/ai/plan-week');
    
    const calendarCtx = await buildCalendarContext(userId, supabase);
    const variants = await generateWeekPlan(calendarCtx, '2026-05-25', 'balanced', false, { bufferMinutes: 15, maxGoalBlocksPerDay: 4, maxDeepWorkMins: 240 });
    
    const v = variants[0];
    const ops = v.blocks.map(b => ({
        op: 'create_event',
        payload: {
            date: b.date,
            start_time: b.start_time,
            end_time: b.end_time,
            title: b.title,
            block_type: b.block_type,
            goal_id: b.goal_id || null,
            pillar: b.pillar || null,
            status: 'planned',
            checklist: b.checklist || null,
        }
    }));

    const addBlocks = ops.map(o => o.payload);
    
    const timeToMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const normalizeBlockType = (type: string) => {
        const map: any = {
            'focus': 'goal', 'body': 'goal', 'mind': 'goal', 'craft': 'goal',
            'task': 'flex', 'break': 'buffer', 'free': 'buffer', 'transition': 'buffer',
            'exercise': 'goal', 'work': 'goal', 'deep_work': 'goal',
            'admin': 'flex', 'personal': 'flex',
        };
        const allowed = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];
        if (allowed.includes(type)) return type;
        return map[type] || 'flex';
    };

    const normalizePillar = (pillar: any) => {
        if (!pillar) return null;
        const lower = pillar.toLowerCase();
        const allowed = ['mind', 'body', 'craft', 'soul'];
        if (allowed.includes(lower)) return lower;
        return null;
    };

    const blocksToInsert = addBlocks.map((b: any) => {
        let adjustedEnd = b.end_time;
        if (timeToMin(adjustedEnd) <= timeToMin(b.start_time)) {
            adjustedEnd = '23:59:59';
        }
        return {
            ...b,
            end_time: adjustedEnd,
            user_id: userId,
            status: b.status || 'planned',
            block_type: normalizeBlockType(b.block_type || 'flex'),
            pillar: normalizePillar(b.pillar),
        };
    });

    console.log(`Inserting ${blocksToInsert.length} blocks...`);
    const { data, error } = await supabase
        .from('schedule_blocks')
        .insert(blocksToInsert)
        .select('id');

    if (!error) {
        console.log(`[ApplySchedule] Successfully inserted ${data?.length} blocks.`);
    } else {
        console.error('[ApplySchedule] Insert failed. Error details:', JSON.stringify(error, null, 2));
    }
}
run();
