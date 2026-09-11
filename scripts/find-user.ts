import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: goals } = await supabase.from('goals').select('user_id');
    const counts: Record<string, number> = {};
    for (const g of goals || []) {
        counts[g.user_id] = (counts[g.user_id] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number));
    console.log('User with most goals:', sorted[0][0], 'with', sorted[0][1], 'goals');
}
main().catch(console.error);
