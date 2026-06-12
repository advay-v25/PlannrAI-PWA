import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data: cfaCmt } = await supabase.from('commitments').select('*').eq('title', 'CFA Block 1').limit(1);
    if (!cfaCmt || cfaCmt.length === 0) return;
    
    const days = cfaCmt[0].days_of_week;
    console.log("days_of_week:", days);
    console.log("typeof days[0]:", typeof days[0]);
    console.log("includes(0):", days.includes(0));
    console.log("includes('0'):", days.includes('0'));
}
main();
