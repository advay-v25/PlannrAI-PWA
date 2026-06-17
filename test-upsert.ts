import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: users, error: authError } = await supabase.auth.admin.listUsers();
    if (authError || !users || users.users.length === 0) {
        console.error('No users found', authError);
        return;
    }
    const userId = users.users[0].id;
    console.log('Testing with user:', userId);

    const { error: prefError } = await supabase
        .from('profile_preferences')
        .upsert({
            user_id: userId,
            sleep_start: '23:00',
            wake_time: '07:00',
            wind_down_min: 30,
            morning_routine_min: 0,
            meals_per_day: 3,
            meal_windows: {},
            buffer_min: 10,
            updated_at: new Date().toISOString()
        });

    if (prefError) {
        console.error('Profile preferences update failed:', prefError);
    } else {
        console.log('Profile preferences update successful!');
    }
}

run();
