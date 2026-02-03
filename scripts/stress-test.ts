
import { createClient } from '@supabase/supabase-js';
import { generateAIResponse } from '../src/lib/ai/groq-client';
import { generateMorningBriefing } from '../src/lib/ai/groq-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_USER_EMAIL = `stress_test_${Date.now()}@test.com`;
let userId: string;

async function setupTestUser() {
    console.log('👤 Creating Stress Test User...');
    const { data, error } = await supabase.auth.admin.createUser({
        email: TEST_USER_EMAIL,
        password: 'password123',
        email_confirm: true
    });

    if (error) {
        // If user exists, find them
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users.users.find(u => u.email === TEST_USER_EMAIL);
        if (existing) {
            userId = existing.id;
            console.log(`✅ Using existing user: ${userId}`);
            return;
        }
        throw new Error(`Failed to create user: ${error.message}`);
    }
    userId = data.user.id;
    console.log(`✅ Created test user: ${userId}`);

    // Create profile
    await supabase.from('profiles').insert({
        id: userId,
        full_name: "Stress Tester",
        timezone: "UTC",
        ai_can_suggest: true,
        ai_can_analyze: true
    });
}

async function testVolume() {
    console.log('\n📊 STARTING VOLUME TEST...');
    console.log('   - Creating 50 Goals...');

    const goals = Array.from({ length: 50 }).map((_, i) => ({
        user_id: userId,
        title: `Stress Goal ${i}`,
        category: i % 3 === 0 ? 'mind' : i % 3 === 1 ? 'body' : 'future',
        importance: 'medium',
        minutes_per_day: 10,
        is_paused: false
    }));

    const { error: goalError } = await supabase.from('goals').insert(goals);
    if (goalError) console.error('❌ Goal Volume Failed:', goalError.message);
    else console.log('✅ Created 50 Goals');

    console.log('   - Creating 100 Schedule Blocks...');
    const today = new Date().toISOString().split('T')[0];
    const blocks = Array.from({ length: 100 }).map((_, i) => ({
        user_id: userId,
        date: today,
        start_time: `${10 + Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}`,
        end_time: `${10 + Math.floor((i + 5) / 60)}:${((i + 5) % 60).toString().padStart(2, '0')}`,
        status: 'planned',
        context: `High Volume Block ${i}`
    }));

    // Split into chunks of 50 to avoid payload limits if any
    const chunkSize = 50;
    for (let i = 0; i < blocks.length; i += chunkSize) {
        const chunk = blocks.slice(i, i + chunkSize);
        const { error } = await supabase.from('schedule_blocks').insert(chunk);
        if (error) console.error(`❌ Block Chunk ${i} Failed:`, error.message);
    }
    console.log('✅ Created 100 Schedule Blocks');
}

async function testConcurrency() {
    console.log('\n⚡ STARTING CONCURRENCY TEST...');
    console.log('   - Firing 20 Simultaneous AI Requests...');

    const promises = Array.from({ length: 20 }).map((_, i) =>
        generateAIResponse("Test concurrency. Return empty JSON object {}.", "COACH", userId)
            .then(() => process.stdout.write('.'))
            .catch(e => {
                if (e.message.includes('Rate limited')) process.stdout.write('L');
                else {
                    process.stdout.write('x');
                    console.error('\\nAPI Error:', e.message);
                }
            })
    );

    await Promise.allSettled(promises);
    console.log('\n   (Expect some rate limits, but NO system crashes)');
}

async function testInvalidData() {
    console.log('\n⚠️ STARTING INVALID DATA TEST...');

    // 1. Goal with empty title
    const { error: emptyTitle } = await supabase.from('goals').insert({
        user_id: userId,
        title: '',
        category: 'mind',
        importance: 'medium',
        minutes_per_day: 10
    });
    console.log(emptyTitle ? '✅ Caught empty title' : '❌ ALLOWED empty title');

    // 2. Block with end time before start time
    const { error: timeTravel } = await supabase.from('schedule_blocks').insert({
        user_id: userId,
        date: '2025-01-01',
        start_time: '12:00',
        end_time: '11:00',
        status: 'planned'
    });
    console.log(timeTravel ? '✅ Caught time travel' : '❌ ALLOWED time travel');
}

async function testEdgeCaseInputs() {
    console.log('\n🧪 STARTING EDGE CASE INPUTS...');

    const crazyString = "Ω≈ç√∫˜µ≤≥÷ " + "A".repeat(5000) + " 🚀";

    // Brain Dump with massive content
    const { error: hugeDump } = await supabase.from('brain_dumps').insert({
        user_id: userId,
        content: crazyString
    });

    if (hugeDump) console.error('❌ Failed massive brain dump:', hugeDump.message);
    else console.log('✅ Handled massive brain dump (5000+ chars)');
}

async function run() {
    try {
        await setupTestUser();
        await testVolume();
        await testConcurrency();
        await testInvalidData();
        await testEdgeCaseInputs();
        console.log('\n🏁 STRESS TEST COMPLETE');
    } catch (e) {
        console.error('\n❌ FATAL ERROR:', e);
    } finally {
        // Cleanup? Maybe keep for manual inspection
        console.log(`\nTest Data Left for User: ${userId}`);
        console.log('You can inspect the dashboard for this user to see visual resilience.');
    }
}

run();
