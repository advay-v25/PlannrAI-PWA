
// Env vars are loaded via shell command
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Using anon key for schema check via public API or if using service role... actually for schema check we might need more permissions OR we just try to select from the tables.

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySchema() {
    console.log('Verifying Database Schema...');

    // Check user_context
    const { error: contextError } = await supabase.from('user_context').select('count').limit(1);
    if (contextError) {
        console.error('❌ Table user_context check failed:', contextError.message);
    } else {
        console.log('✅ Table user_context exists');
    }

    // Check intervention_logs
    const { error: interventionsError } = await supabase.from('intervention_logs').select('count', { count: 'exact', head: true });
    if (interventionsError) {
        console.error('❌ Table intervention_logs check failed:', interventionsError.message);
    } else {
        console.log('✅ Table intervention_logs exists');
    }

    // Check goals updated_at
    const { data: goals, error: goalsError } = await supabase.from('goals').select('updated_at').limit(1);
    if (goalsError) {
        console.error('❌ Table goals check failed:', goalsError.message);
    } else {
        // If goals table is empty, we can't be 100% sure the column exists via select data, but if query succeeds it's likely fine.
        // If column didn't exist, it would throw "Could not find the 'updated_at' column..."
        console.log('✅ Table goals.updated_at column verification passed (query succeeded)');
    }
}

verifySchema();
