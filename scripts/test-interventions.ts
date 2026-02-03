
import { createClient } from '@supabase/supabase-js';
import { InterventionManager } from '../src/lib/ai/interventions';
import { subDays } from 'date-fns';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getTestUser() {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error || !users || users.length === 0) throw new Error('No users found');
    return users[0].id; // Use the first user found or specific logic
}

async function testStagnationTrigger(userId: string) {
    console.log('\n--- Testing Stagnation Trigger ---');

    console.log(`Using User ID: ${userId}`);

    // 1. Create a dummy stagnant goal
    // We use insert().select() to get the return data properly.
    const { data: goal, error } = await supabase.from('goals').insert({
        user_id: userId,
        title: "Test Stagnant Goal",
        category: "future",
        importance: "high",
        minutes_per_day: 30,
        is_paused: false,
        created_at: subDays(new Date(), 10).toISOString(),
        updated_at: subDays(new Date(), 10).toISOString() // Old enough
    }).select().single();

    if (error) {
        console.error('Goal Creation Error:', JSON.stringify(error, null, 2));
        throw new Error(`Failed to create test goal: ${error.message}`);
    }

    if (!goal) throw new Error('Goal created but returned null');
    console.log(`Created stagnant goal: ${goal.title} (ID: ${goal.id})`);

    // 2. Clear recent logs to bypass rate limit
    await supabase.from('intervention_logs').delete().eq('user_id', userId);

    // 3. Run check
    console.log('Running Intervention Check...');
    const result = await InterventionManager.checkStagnation(userId, supabase);

    if (result && result.type === 'stagnation') {
        console.log('✅ SUCCESS: Stagnation detected.');
        console.log('Nudge:', result.message);
    } else {
        console.log('❌ FAILURE: No stagnation detected.');
    }

    // Cleanup
    await supabase.from('goals').delete().eq('id', goal.id);
    if (result) {
        await supabase.from('intervention_logs').delete().eq('id', result.id);
    }
}

async function run() {
    const userId = await getTestUser();
    await testStagnationTrigger(userId);
}

run().catch(console.error);
