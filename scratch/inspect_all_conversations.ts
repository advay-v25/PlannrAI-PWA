import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log("Fetching all coach conversations...");
    const { data: convs, error: convsErr } = await supabase
        .from('coach_conversations')
        .select('*');

    if (convsErr) {
        console.error('Error:', convsErr);
        return;
    }

    console.log(`Found ${convs?.length || 0} conversations total.`);
    convs?.forEach(c => {
        console.log(`ID: ${c.id} | User: ${c.user_id} | Title: "${c.title}" | Updated: ${c.updated_at}`);
    });
}

main();
