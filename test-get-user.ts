import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adminDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    const { data } = await adminDb.from('profiles').select('id').limit(1);
    console.log("User ID:", data?.[0]?.id);
    if (data?.[0]?.id) {
        const { error } = await adminDb.from('user_states').insert({
            user_id: data[0].id,
            energy_level: 3,
            emotional_state: 'neutral',
            updated_at: new Date().toISOString()
        });
        console.log("Insert Error:", error);
    }
}
test();
