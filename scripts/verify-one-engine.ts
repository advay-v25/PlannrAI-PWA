import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { ReactiveGoalService } from '../src/lib/services/reactive-goal-service';
import { MemoryService } from '../src/lib/services/memory-service';
import { StateService } from '../src/lib/user-state/state-service';

// Mock environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function runVerification() {
    console.log("🔍 Verifying One Engine: Reactive Goals...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Get a Test User (Assuming user from previous seeds exists, or pick first)
    const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
    if (!user) throw new Error("No user found");
    const userId = user.id;

    console.log(`👤 User: ${userId}`);

    // 2. Create a Mock Goal
    const { data: goal, error: goalError } = await supabase
        .from('goals')
        .insert({
            user_id: userId,
            title: "Verify One Engine " + Date.now(),
            category: 'mind',
            minutes_per_day: 60,
            importance: 'high'
        })
        .select()
        .single();

    if (goalError) throw goalError;
    console.log(`✅ Goal Created: ${goal.title}`);

    // 3. Trigger Reactive Service manually (simulate API call)
    console.log("⚡ Triggering ReactiveGoalService...");
    await ReactiveGoalService.onGoalUpdated(userId, goal.id, supabase);

    // 4. Verify Memory
    console.log("🧠 Checking Memory for Proposal...");
    const convo = await MemoryService.getLatestConversation(userId, 'coach');
    if (!convo) {
        console.warn("⚠️ No Coach conversation found. Service might have skipped if no convo exists.");
    } else {
        const history = await MemoryService.getHistory(convo.id, 5);
        const proposalMsg = history.find(m => m.metadata?.type === 'proposal_card');

        if (proposalMsg) {
            console.log("✅ SUCCESS: Found Proposal in Memory!");
            console.log("   Content:", proposalMsg.content);
            console.log("   Patch op:", proposalMsg.metadata.patch.changes[0].op);
        } else {
            console.error("❌ FAILURE: No proposal found in recent memory.");
            console.log("Recent messages:", history.map(h => h.content));
        }
    }

    // Cleanup
    await supabase.from('goals').delete().eq('id', goal.id);
}

runVerification().catch(console.error);
