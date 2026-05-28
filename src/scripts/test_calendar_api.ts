import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { buildCalendarContext } from '../lib/calendar/context-builder';
import { generateWeekPlan } from '../lib/calendar/ai/plan-week';

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: users } = await supabase.from('profiles').select('id, email').limit(5);
    const userId = users?.find(u => u.email === 'advayvaidya.25@gmail.com')?.id || users?.[0]?.id;
    
    if (!userId) { console.error("User not found"); return; }
    
    console.log(`Testing plan-week for user: ${userId}`);
    const calendarCtx = await buildCalendarContext(userId, supabase);
    const variants = await generateWeekPlan(calendarCtx, '2026-05-25', 'balanced', true, {
        bufferMinutes: 15,
        maxGoalBlocksPerDay: 4,
        maxDeepWorkMins: 240,
    });
    console.log(`Generated ${variants.length} variants`);
    if(variants.length > 0) {
        console.log(`Variant 1 blocks: ${variants[0].blocks.length}`);
    }
}
main().catch(console.error);
