import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { AgentOrchestrator } from '../src/lib/agents/orchestrator';
import { AgentContext } from '../src/lib/agents/core/types';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });

async function verifyPillar3() {
    console.log("🗣️  Verifying Pillar 3: Coach Execution (The Voice)...");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseKey) {
        console.error("❌ SERVICE_ROLE_KEY missing.");
        process.exit(1);
    }

    // We don't strictly need DB here as we are testing Orchestrator logic, 
    // but some agents might need it. We'll mock the schedule.

    // Test Case A: Survival Mode (High Cognitive Load)
    console.log("\n🧪 Test Case A: User in SURVIVAL MODE");
    const contextA: AgentContext = {
        userId: 'test-user',
        now: new Date(),
        timezone: 'UTC',
        currentSchedule: [],
        userState: {
            energy_level: 1,
            cognitive_load: 3, // High Load
            emotional_bandwidth: 1,
            current_mode: 'survival',
            emotional_state: 'overwhelmed',
            last_updated: new Date()
        }
    };

    // Mock Orchestrator to inject context manually? 
    // AgentOrchestrator builds context internally usually, but 'run' takes 'mockSchedule'.
    // BUT 'userState' is injected by ContextBuilder usually.
    // The Orchestrator class instantiates agents.
    // We need to subclass or modify Orchestrator to accept a pre-built context for testing, 
    // OR just instantiate the agents directly here.

    // Let's instantiate agents directly to simulate the pipeline with controlled context.
    const { PlannerAgent } = await import('../src/lib/agents/planner/planner-agent');
    const { RegulatorAgent } = await import('../src/lib/agents/regulator/regulator-agent');
    const { SchedulerAgent } = await import('../src/lib/agents/scheduler/scheduler-agent');
    const { generateAIResponse } = await import('../src/lib/ai/groq-client');

    const planner = new PlannerAgent();
    const regulator = new RegulatorAgent();
    const scheduler = new SchedulerAgent();

    const userMessage = "I need to fit in a workout";

    // 1. Planner
    const plannerOutput = await planner.run(userMessage, contextA);
    console.log("   Planner Intent:", plannerOutput.intent);

    // 2. Regulator (Should see Survival Mode)
    const regulatorOutput = await regulator.run({ userMessage, plannerOutput }, contextA);
    console.log("   Regulator Mode:", regulatorOutput.response_mode);
    console.log("   Regulator Style:", regulatorOutput.language_style);

    if (regulatorOutput.response_mode !== 'minimal') {
        console.error("❌ FAIL: Expected intent 'minimal' for Survival Mode.");
    } else {
        console.log("✅ PASS: Regulator chose 'minimal'.");
    }

    // 3. Scheduler
    const schedulerOutput = await scheduler.run({ planner: plannerOutput, regulator: regulatorOutput }, contextA);

    // 4. Generator (The Voice)
    const summaryPrompt = `
        Context:
        - User Intent: ${plannerOutput.intent}
        - Strategy: ${plannerOutput.strategy}
        - Options Found: ${schedulerOutput.options.length}
        - Regulator Style: ${regulatorOutput.language_style}
        - Regulator Mode: ${regulatorOutput.response_mode}

        Task: Write a confirmation summary for the user.
        CONSTRAINTS:
        1. MAX 2 SENTENCES.
        2. NO WAFFLE ("Here are some options...").
        3. BE DIRECT.
        4. If Options > 0: "I found X options. [Brief detail]."
        5. If Impossible: "I cannot do that because [Reason]. Sacrifice?"

        Output: Pure String.
    `;

    // We mock the generation to print it
    const summary = await generateAIResponse(summaryPrompt, 'COACH', 'test-user');

    console.log("\n🤖 Generated Summary:\n" + summary);

    const sentenceCount = summary.split('.').filter(s => s.trim().length > 0).length;
    if (sentenceCount > 3) { // Allow 3 for edge cases, but aim for 2
        console.warn("⚠️  WARNING: Summary might be too long.");
    } else {
        console.log("✅ PASS: Summary is concise.");
    }
}

verifyPillar3();
