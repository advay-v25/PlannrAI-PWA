import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adminDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    const { error } = await adminDb.rpc('exec_sql', { sql: 'ALTER TABLE user_states DROP CONSTRAINT IF EXISTS check_emotional_state;' });
    console.log("RPC Error:", error);
}
test();
