// @ts-nocheck

// import dotenv from 'dotenv';
// dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { MemoryManager } from '../src/lib/ai/memory';
import { generateCoachResponse } from '../src/lib/ai/groq-client';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must be service role to bypass RLS for test script

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// const TEST_USER_ID = 'test-user-123'; 

async function getTestUser() {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error || !users || users.length === 0) {
        throw new Error('No users found to test with');
    }
    return users[0].id;
}

async function testMemoryExtraction(userId: string) {
    console.log('--- Testing Memory Extraction ---');
    const text = "I started a new vegan diet this week and I really hate early morning meetings before 9am.";

    console.log(`Processing text: "${text}"`);
    await MemoryManager.extractMemories(text, 'brain_dump', userId, supabase);

    // Allow some time for async processing if it were fire-and-forget, but here we awaited it generally. 
    // Wait, extractMemories is async, so we await it.

    console.log('Verifying DB persistence...');
    const { data, error } = await supabase
        .from('user_context')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('DB Error:', error);
        return;
    }

    console.log('Memories found:', data);

    const hasDiet = data?.some(m => m.content.toLowerCase().includes('vegan'));
    const hasMeeting = data?.some(m => m.content.toLowerCase().includes('morning') || m.content.includes('9am'));

    if (hasDiet && hasMeeting) {
        console.log('✅ SUCCESS: Extracted facts found.');
    } else {
        console.log('❌ FAILURE: Could not find expected memories.');
    }
}

async function testContextRetrieval(userId: string) {
    console.log('\n--- Testing Context Retrieval & Coach Injection ---');

    const context = await MemoryManager.retrieveContext(userId, supabase);
    console.log('Retrieved Context String:\n', context);

    if (context.includes('vegan') && context.includes('9am')) {
        console.log('✅ SUCCESS: Context string contains memories.');
    } else {
        console.log('❌ FAILURE: Context string missing memories.');
    }
}

async function run() {
    const userId = await getTestUser();
    console.log(`Testing with User ID: ${userId}`);

    // Clean up previous tests
    await supabase.from('user_context').delete().eq('user_id', userId);

    await testMemoryExtraction(userId);
    await testContextRetrieval(userId);
}

run().catch(console.error);
