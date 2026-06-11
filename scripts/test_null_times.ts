import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: blocks } = await supabase.from('schedule_blocks').select('*').eq('date', '2026-06-14');
    
    blocks?.forEach(b => {
        if (!b.start_time || !b.end_time) {
            console.log("BLOCK WITH NULL TIME:", b);
        }
    });
    console.log("Checked null times for Sunday.");
}
run();
