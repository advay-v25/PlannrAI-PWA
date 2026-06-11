import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Get advay's user id
    const { data: users } = await supabase.from('profiles').select('id, first_name');
    const user = (users || []).find(u => u.first_name === 'Advay');

    const { data: blocks } = await supabase.from('schedule_blocks').select('*').eq('user_id', user!.id).eq('date', '2026-06-14');
    console.log("Blocks on Sunday:", blocks);
}
run();
