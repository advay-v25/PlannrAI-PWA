import { createClient } from '@supabase/supabase-js';
import { buildCoachContext } from '../lib/coach/coach-context';
import { ChannelRegistry } from '../lib/ai/registry';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
console.log(`Loading env from: ${envPath}`);
dotenv.config({ path: envPath });

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials in env.');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get a user
    const { data: user, error } = await supabase.from('profiles').select('id').limit(1).single();
    if (error || !user) {
        console.error('No users found or error:', error);
        return;
    }
    console.log(`Testing with user: ${user.id}`);

    // 2. Build Context
    console.log('--- Building Context ---');
    try {
        const context = await buildCoachContext(user.id, supabase);
        console.log('Context keys:', Object.keys(context));
        console.log('Goals count:', context.goals.length);
        console.log('Schedule items:', context.schedule.length);
        console.log('Profile loaded:', !!context.profile);

        // 3. Simulate Goal Strategy Prompt
        const goalStrategy = ChannelRegistry['goal_strategy'];
        const goalPrompt = goalStrategy.systemPrompt(context);
        console.log('\n--- Goal Strategy Prompt Preview (first 200 chars) ---');
        console.log(goalPrompt.slice(0, 200));

        // 4. Simulate Habit Stack Prompt
        const habitStack = ChannelRegistry['habit_stack'];
        const habitPrompt = habitStack.systemPrompt(context);
        console.log('\n--- Habit Stack Prompt Preview (first 200 chars) ---');
        console.log(habitPrompt.slice(0, 200));

        // 5. Check if we received 'is_locked' in habit stack prompt logic
        if (habitPrompt.includes('is_locked: true')) {
            console.log('\n✅ Habit Stack prompt contains "is_locked: true" constraint.');
        } else {
            console.error('\n❌ Habit Stack prompt MISSING "is_locked: true" constraint.');
        }

        // 6. Check 'options' in Goal Strategy prompt schema
        if (goalPrompt.includes('"options": [{')) {
            console.log('✅ Goal Strategy prompt contains "options" array in schema.');
        } else {
            console.error('❌ Goal Strategy prompt MISSING "options" in schema.');
        }

    } catch (e) {
        console.error('Error building context:', e);
    }
}

main().catch(console.error);
