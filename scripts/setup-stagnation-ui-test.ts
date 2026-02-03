
import { createClient } from '@supabase/supabase-js';
import { subDays } from 'date-fns';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setup() {
    console.log('--- Setting up UI Test State ---');

    // 1. Get User
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error || !users || users.length === 0) throw new Error('No users found');
    const user = users[0];
    const userId = user.id;
    console.log(`Target User: ${user.email} (${userId})`);

    // 2. Set Password
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: 'Password123!'
    });
    if (updateError) throw new Error(`Failed to update password: ${updateError.message}`);
    console.log('✅ Password set to "Password123!"');

    // 3. Clear existing logs
    await supabase.from('intervention_logs').delete().eq('user_id', userId);
    console.log('✅ Cleared intervention logs');

    // 4. Create Stagnant Goal
    // First distinct title to avoid confusion
    const title = "UI Test: Learn Pottery";

    // Clean up old ones just in case
    await supabase.from('goals').delete().eq('user_id', userId).eq('title', title);

    const { data: goal, error: goalError } = await supabase.from('goals').insert({
        user_id: userId,
        title: title,
        category: "body", // checking different category
        importance: "high",
        minutes_per_day: 45,
        is_paused: false,
        created_at: subDays(new Date(), 20).toISOString(),
        updated_at: subDays(new Date(), 10).toISOString()
    }).select().single();

    if (goalError) throw new Error(`Goal creation failed: ${goalError.message}`);
    console.log(`✅ Created stagnant goal: "${goal.title}"`);
    console.log('Ready for browser test.');
}

setup().catch(console.error);
