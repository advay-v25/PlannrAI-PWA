import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data } = await supabase.from('coach_conversations').select('*').limit(5).order('created_at', { ascending: false });
    console.log(JSON.stringify(data, null, 2));
}
main();
