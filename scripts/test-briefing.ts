
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const APP_URL = "http://localhost:3000"; // Assuming local dev

async function getTestUser() {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error || !users || users.length === 0) throw new Error('No users found');
    return users[0].id;
}

async function testBriefingAPI() {
    console.log('--- Testing Morning Briefing API ---');
    const userId = await getTestUser();
    console.log(`User: ${userId}`);

    try {
        const response = await fetch(`${APP_URL}/api/ai/morning-briefing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ SUCCESS: Briefing Generated');
            console.log('Greeting:', data.greeting);
            console.log('Summary:', data.agenda_summary);
            console.log('Key Points:', data.key_points);
            console.log('Insight:', data.insight);
        } else {
            console.error('❌ FAILURE:', data);
        }

    } catch (e) {
        console.error('Network Error:', e);
        console.log('Make sure the dev server is running!');
    }
}

testBriefingAPI();
