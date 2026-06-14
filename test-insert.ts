import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adminDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    const userId = "c8b4df56-e414-4340-a19e-e32fa07b4695"; // Advay's user id or we just test insert
    const { error: insertErr } = await adminDb
        .from('user_states')
        .insert({
            user_id: '158e9ee2-40f0-46eb-a4ff-3bcf73fce6b7', // try a random uuid, but it has a foreign key to profiles(id)
            energy_level: 3,
            emotional_state: 'neutral',
            updated_at: new Date().toISOString()
        });
    console.log("Insert Error:", insertErr);
}
test();
