import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data: cfaCmt } = await supabase.from('commitments').select('user_id').eq('title', 'CFA Block 1').limit(1);
    const userId = cfaCmt[0].user_id;

    const { data: blocks } = await supabase.from('schedule_blocks')
        .select('title, block_type, date, start_time, end_time')
        .eq('user_id', userId)
        .eq('date', '2026-06-13'); // Saturday!
        
    console.log("Blocks on Saturday:", blocks.filter(b => b.block_type === 'anchor'));
}
main();
