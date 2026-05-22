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
const userId = '393b8369-21b7-4206-8705-559904a58272';

async function main() {
    console.log(`Inspecting blocks and commitments for user: ${userId} for May 18 - May 24, 2026...`);

    const { data: blocks, error: blocksError } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .gte('date', '2026-05-18')
        .lte('date', '2026-05-24')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

    if (blocksError) {
        console.error('Error fetching blocks:', blocksError);
    } else {
        console.log(`\n=== SCHEDULE BLOCKS (${blocks?.length || 0}) ===`);
        blocks?.forEach(b => {
            console.log(`[${b.date}] ${b.start_time} - ${b.end_time} | Title: "${b.title}" | Type: ${b.block_type} | IsFixed: ${b.is_fixed} | CommitmentID: ${b.commitment_id}`);
        });
    }

    const { data: commitments, error: commsError } = await supabase
        .from('commitments')
        .select('*')
        .eq('user_id', userId);

    if (commsError) {
        console.error('Error fetching commitments:', commsError);
    } else {
        console.log(`\n=== COMMITMENTS (${commitments?.length || 0}) ===`);
        commitments?.forEach(c => {
            console.log(`ID: ${c.id} | Title: "${c.title}" | Day: ${c.day_of_week} | Time: ${c.start_time}-${c.end_time} | IsAnchor: ${c.is_anchor}`);
        });
    }
}

main();
