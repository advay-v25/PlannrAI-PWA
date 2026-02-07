
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
    // Try to find a user with commitments first
    const { data: userWithCommitments } = await supabase.from('commitments').select('user_id').limit(1);
    const userId = userWithCommitments?.[0]?.user_id;

    if (!userId) {
        console.log("No users with commitments found");
        return;
    }

    const { data: profile } = await supabase.from('profiles').select('preferred_name').eq('id', userId).single();
    console.log(`Auditing User: ${profile?.preferred_name} (${userId})`);

    const { data: commitments } = await supabase.from('commitments').select('*').eq('user_id', userId);
    console.log("\n--- COMMITMENTS (ANCHORS) ---");
    commitments?.forEach(c => {
        console.log(`${c.title}: Days ${JSON.stringify(c.days_of_week)} | ${c.start_time}-${c.end_time}`);
    });

    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active');
    console.log("\n--- ACTIVE GOALS ---");
    goals?.forEach(g => {
        console.log(`${g.title}: Category ${g.category} | ${g.days_per_week}x/week | ${g.minutes_per_day}m/day`);
    });
}

audit();
