import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: users } = await supabase.from('profiles').select('id, email, full_name');
    console.log('Users:', users);
    
    for (const u of users || []) {
        const { data: goals } = await supabase.from('goals').select('id, title, status').eq('user_id', u.id);
        console.log("Goals for", u.email, ":", goals?.length);
    }
}
main();
