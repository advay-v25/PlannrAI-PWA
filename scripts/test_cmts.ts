import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data: cfaCmt } = await supabase.from('commitments').select('user_id').eq('title', 'CFA Block 1').limit(1);
    if (!cfaCmt || cfaCmt.length === 0) return;
    const userId = cfaCmt[0].user_id;

    const { data: cmts } = await supabase.from('commitments')
        .select('id, title, start_time, end_time, days_of_week, is_active')
        .eq('user_id', userId)
        
    console.log("All commitments:", cmts);
}
main();
