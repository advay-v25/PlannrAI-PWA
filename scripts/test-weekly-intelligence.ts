
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { format, addDays, startOfWeek } from 'date-fns';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateWeek() {
    const { data: userWithCommitments } = await supabase.from('commitments').select('user_id').limit(1);
    const userId = userWithCommitments?.[0]?.user_id;

    if (!userId) {
        console.log("No test user found.");
        return;
    }

    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    console.log(`Starting Weekly Simulation for: ${userId}`);

    for (let i = 0; i < 7; i++) {
        const date = format(addDays(monday, i), 'yyyy-MM-dd');
        console.log(`\n--- Optimizing ${date} ---`);

        try {
            const response = await fetch('http://localhost:3000/api/ai/optimize-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, date, blocks: [], energyLevel: 3 })
            });
            const result = await response.json();

            if (result.success) {
                console.log(`Summary: ${result.data.summary}`);
                console.log(`Blocks: ${result.data.optimizedBlocks.map((b: any) => b.title).join(', ')}`);
            } else {
                console.error(`Error: ${JSON.stringify(result.error)}`);
            }
        } catch (e) {
            console.error(`Fetch failed for ${date}:`, e);
        }
    }
}

simulateWeek();
