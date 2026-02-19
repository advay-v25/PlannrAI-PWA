
import { executeAI } from '../src/lib/ai/ai-service';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Use Service Role to bypass RLS for test setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase URL or Service Role Key in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    // 1. Get or Create Test User
    let userId;
    const { data: users } = await supabase.from('profiles').select('id').limit(1);

    if (users && users.length > 0) {
        userId = users[0].id;
        console.log(`Using existing user: ${userId}`);
    } else {
        console.log("No users found. Creating test user...");
        const { data: newUser, error } = await supabase.auth.admin.createUser({
            email: `test_ai_${Date.now()}@example.com`,
            password: 'password123',
            email_confirm: true
        });
        if (error || !newUser.user) {
            console.error("Failed to create test user:", error);
            process.exit(1);
        }
        userId = newUser.user.id;
        console.log(`Created test user: ${userId}`);

        // Seed profile
        await supabase.from('profiles').insert({
            id: userId,
            email: newUser.user.email,
            full_name: 'AI Test User',
            onboarding_completed: true,
            timezone: 'UTC'
        });
    }

    const channels = [
        {
            name: 'brain_dump',
            input: 'I feel overwhelmed. I need to buy groceries and finish the report by Friday.',
            expectedMode: 'propose'
        },
        {
            name: 'coach',
            input: 'I am tired, what should I do?',
            expectedMode: 'propose'
        },
        {
            name: 'goal_strategy',
            input: 'Run a marathon'
        },
        {
            name: 'weekly_review',
            input: 'Analyze my week' // Input is ignored but required for executeAI? No, userPrompt handles it.
        }
    ];

    console.log('\n--- STARTING AI SMOKE TEST ---');

    for (const c of channels) {
        console.log(`\nTesting Channel: ${c.name}`);
        try {
            const start = Date.now();
            const result = await executeAI(userId, {
                channel: c.name,
                input: c.input,
                context: {}
            });
            const duration = Date.now() - start;
            console.log(`✅ Success (${duration}ms)`);

            // Detailed Validation
            if (c.name === 'brain_dump') {
                if (!result.extracted) throw new Error('Missing extracted data');
                if (!result.extracted.items) throw new Error('Missing items array');
                if (!result.extracted.signals?.energy) throw new Error('Missing energy signal');
                if (result.extracted.tasks) throw new Error('found "tasks" instead of "items" (Schema Mismatch!)');
                console.log(`   - Extracted ${result.extracted.items.length} items`);
                console.log(`   - Energy Level: ${result.extracted.signals.energy}`);
            }
            if (c.name === 'coach') {
                if (!result.options || result.options.length === 0) throw new Error('Missing options');
                const opt = result.options[0];
                if (!opt.title) throw new Error('Option missing "title"');
                if (!opt.impact) throw new Error('Option missing "impact"');
                if (opt.label) console.warn('   ⚠️ Found "label" in Coach option (Should be title)');
                console.log(`   - Option 1: ${opt.title} (${opt.impact})`);
            }
            if (c.name === 'goal_strategy') {
                if (!result.options || result.options.length === 0) throw new Error('Missing strategy options');
                const opt = result.options[0];
                if (!opt.label) throw new Error('Option missing "label"');
                console.log(`   - Strategy Label: ${opt.label}`);
            }
            if (c.name === 'weekly_review') {
                if (!result.reality) throw new Error('Missing reality');
                if (!result.patterns || result.patterns.length !== 3) throw new Error('Missing patterns (expected 3)');
                if (!result.lever) throw new Error('Missing lever');
                if (!result.note) throw new Error('Missing note');
                console.log(`   - Reality: ${result.reality.slice(0, 50)}...`);
                console.log(`   - Lever: ${result.lever.label}`);
            }

        } catch (e: any) {
            console.error(`❌ Failed:`, e.message);
        }
    }

    console.log('\n--- TEST COMPLETE ---');
}

run();
