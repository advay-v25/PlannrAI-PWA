import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Fetching a dummy user...");
    const { data: users } = await supabase.from('users').select('id').limit(1);
    if (!users || users.length === 0) return console.log("No users found");
    const userId = users[0].id;
    
    // simulate the request body for plan_week
    // let's fetch a dummy goal ID just in case
    const { data: goals } = await supabase.from('goals').select('id').eq('user_id', userId).limit(1);
    const goalId = goals?.[0]?.id || null;

    const block = {
        date: "2026-05-25",
        start_time: "09:00",
        end_time: "10:00",
        title: "Test Block",
        block_type: "work",
        goal_id: goalId,
        pillar: "mind",
        status: "planned",
        checklist: []
    };

    console.log("Posting to apply-schedule...");
    // Since we don't have the next.js server environment easily mockable, we can just run the logic manually or use fetch against localhost:3000
    try {
        const res = await fetch('http://localhost:3000/api/calendar/apply-schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // For secureApiRoute we need auth token, or we can just run the logic directly against supabase
            },
            body: JSON.stringify({
                action: 'plan_week',
                patch: {
                    add: [block]
                }
            })
        });
        const text = await res.text();
        console.log("Response:", res.status, text);
    } catch (e) {
        console.error("Fetch failed", e);
    }
}
main();
