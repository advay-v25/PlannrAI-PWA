// @ts-nocheck

import { createClient } from '@supabase/supabase-js';
import { generateMorningBriefing } from '../src/lib/ai/groq-client';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testMorningBriefing() {
    console.log('🧪 Starting Morning Briefing Test...');

    // 1. Get a test user (or just the first one found)
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();

    if (userError || !users.users.length) {
        console.error('❌ Failed to get users:', userError);
        return;
    }

    const userId = users.users[0].id;
    console.log(`👤 Testing with user ID: ${userId}`);

    // 2. Fetch User Data (Simulating the API route logic)
    console.log('📊 Fetching user context...');

    const today = new Date().toISOString().split('T')[0];

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, preferred_name')
        .eq('id', userId)
        .single();

    const userName = profile?.preferred_name || profile?.full_name || 'Test User';

    const { data: blocks } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today);

    const { data: goals } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .eq('is_paused', false);

    // Mock yesterday's log for consistency in test
    const yesterdayLog = {
        energy_level: 4,
        wins: ['Completed verification script', 'Fixed bug'],
    };

    console.log(`   - Name: ${userName}`);
    console.log(`   - Blocks found: ${blocks?.length || 0}`);
    console.log(`   - Goals found: ${goals?.length || 0}`);

    // 3. Generate Briefing
    console.log('🤖 Generating Morning Briefing via AI...');

    try {
        const briefing = await generateMorningBriefing({
            userName,
            blocks: blocks || [],
            goals: goals || [],
            yesterdayLog
        }, userId);

        console.log('\n✨ Briefing Generated Successfully:');
        console.log(JSON.stringify(briefing, null, 2));

        // Basic Assertions
        if (!briefing.greeting) throw new Error('Missing greeting');
        if (!Array.isArray(briefing.agenda)) throw new Error('Missing agenda array');
        if (!Array.isArray(briefing.priorities)) throw new Error('Missing priorities array');
        if (!briefing.insight) throw new Error('Missing insight');

        console.log('\n✅ Verification PASSED');

    } catch (error) {
        console.error('❌ Verification FAILED:', error);
    }
}

testMorningBriefing();
