import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data, error } = await supabase.rpc('query_schema'); // Not sure if this exists
    // Let's just fetch one row from patch_runs to see what columns come back
    const { data: rows, error: err2 } = await supabase.from('patch_runs').select('*').limit(1);
    if (err2) console.error("Error:", err2);
    else console.log("Columns:", Object.keys(rows[0] || {}));
}
main();
