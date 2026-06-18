import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data, error } = await supabase
        .from('habit_stacks')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Data:', data);
        if (data && data.length > 0) {
            console.log('Keys:', Object.keys(data[0]));
        } else {
            console.log('No data found, trying an insert to see if name exists...');
            const { error: insertError } = await supabase.from('habit_stacks').insert({
                user_id: '00000000-0000-0000-0000-000000000000',
                trigger_habit: 'test',
                action_habit: 'test',
                name: 'test_name'
            }).select();
            if (insertError) {
                console.error('Insert Error:', insertError);
            } else {
                console.log('Insert with name succeeded! name column EXISTS.');
            }
        }
    }
}

checkSchema();
