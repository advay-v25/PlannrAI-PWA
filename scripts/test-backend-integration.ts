import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { AgentOrchestrator } from '../src/lib/agents/orchestrator';
import { ContextBuilder } from '../src/lib/agents/context-builder';
import { ValidatorAgent } from '../src/lib/agents/validator/validator-agent';

dotenv.config({ path: '.env.local' });

async function testBackendIntegration() {
    console.log("🚀 Starting Backend Integration Test...\n");

    // 1. Setup Service Client (Bypasses Auth/Cookies)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Mock User ID (Must exist in DB or use a known one if possible)
    // We'll query for a user to use
    const { data: users } = await supabase.from('profiles').select('id').limit(1);

    if (!users || users.length === 0) {
        console.error("❌ No users found to test with.");
        return;
    }
    const userId = users[0].id;
    console.log(`👤 Testing with User ID: ${userId}`);

    // ==========================================
    // STEP 1: SIMULATE /api/intent
    // ==========================================
    console.log("\n--- SIMULATING /api/intent ---");

    // A. Build Context
    console.log("🏗️ Building Context...");
    const context = await ContextBuilder.build(userId, supabase);
    console.log(`   Context: Timezone=${context.timezone}, ScheduleItems=${context.currentSchedule?.length}`);

    // B. Run Pipeline
    console.log("🤖 Running Orchestrator...");
    const orchestrator = new AgentOrchestrator();
    const message = "I'm busy at 3pm for 1 hour.";
    const result = await orchestrator.run(userId, message, context.currentSchedule); // Passing schedule explicitly for now, or context

    // C. Store Options
    console.log("💾 Storing Options...");
    const storedIds: string[] = [];

    for (const option of result.scheduler.options) {
        const { data, error } = await supabase
            .from('agent_options')
            .insert({
                user_id: userId,
                label: option.label,
                patch: option.patch,
                context_snapshot: {},
            })
            .select('id')
            .single();

        if (error) {
            console.error("   ❌ Insert Error:", error.message);
        } else {
            console.log(`   ✅ Stored Option: ${data.id} ("${option.label}")`);
            storedIds.push(data.id);
        }
    }

    if (storedIds.length === 0) {
        console.error("❌ No options stored. Aborting.");
        return;
    }

    // ==========================================
    // STEP 2: SIMULATE /api/apply
    // ==========================================
    console.log("\n--- SIMULATING /api/apply ---");
    const optionId = storedIds[0]; // Pick first one
    console.log(`👉 Applying Option ID: ${optionId}`);

    // A. Fetch Option
    const { data: option } = await supabase
        .from('agent_options')
        .select('*')
        .eq('id', optionId)
        .single();

    if (!option) {
        console.error("❌ Option not found.");
        return;
    }

    // B. Re-Validate
    const validator = new ValidatorAgent();
    // Re-build fresh context
    const freshContext = await ContextBuilder.build(userId, supabase);
    const audit = await validator.run({ patch: option.patch, currentSchedule: freshContext.currentSchedule || [] }, freshContext);

    console.log(`🛡️ Audit Result: ${audit.valid ? 'VALID' : 'INVALID'} (${audit.reason})`);

    // C. Execute (We won't actually mutate DB to keep test non-destructive, or we perform and rollback? 
    // Let's just log the intended mutations)
    if (audit.valid) {
        console.log("✅ Ready to Execute Changes:");
        option.patch.changes.forEach((c: any) => {
            console.log(`   - ${c.op.toUpperCase()} ${c.data.title || c.block_id} (${c.data.start_time || '?'})`);
        });

        // Cleanup
        await supabase.from('agent_options').delete().eq('id', optionId);
        console.log("🧹 Cleaned up option.");
    }

    console.log("\n✅ Test Complete.");
}

testBackendIntegration();
