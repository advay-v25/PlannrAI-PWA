import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // using service role
const supabase = createClient(supabaseUrl, supabaseKey);

async function deepReset() {
    console.log('Initiating Deep Reset of Schedule Blocks...');

    // First let's get Advay's user ID by fetching any commitment 
    const { data: users } = await supabase.from('commitments').select('user_id').limit(1);
    if (!users || users.length === 0) {
        console.error('No users found with commitments');
        return;
    }
    const userId = users[0].user_id;

    // Delete everything
    const { count, error } = await supabase
        .from('schedule_blocks')
        .delete({ count: 'exact' })
        .eq('user_id', userId);

    if (error) {
        console.error('Reset Failed:', error);
    } else {
        console.log(`Deep Reset Complete. Wiped ${count} schedule blocks for user ${userId}. Ready for a blank slate.`);
    }
}

deepReset();
