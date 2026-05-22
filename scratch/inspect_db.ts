import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Bypass RLS using service role key
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const userId = '8bb069d3-744f-4d4e-a2ea-8866fb981a70';
    console.log("Fetching ALL schedule blocks for Friday, May 22, 2026...");
    const { data: blocks, error: blockErr } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('date', '2026-05-22')
        .order('start_time', { ascending: true });

    if (blockErr) {
        console.error("Error fetching blocks:", blockErr);
        return;
    }

    console.log(`Found ${blocks?.length} blocks on Friday:`);
    blocks?.forEach(b => {
        console.log(`- [${b.start_time} - ${b.end_time}] type: ${b.block_type} | title: "${b.title}" | context: "${b.context}" | id: ${b.id}`);
    });
}

inspect();
