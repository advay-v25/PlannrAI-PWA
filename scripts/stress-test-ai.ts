
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { AgentContext } from '@/lib/agents/core/types';

// Load Env BEFORE importing agents
dotenv.config({ path: '.env.local' });

// Load Env BEFORE importing agents
dotenv.config({ path: '.env.local' });

// Mock Environment
const MOCK_USER_ID = 'stress-test-user-v1';

// Results Container
const results: { test: string; status: 'pass' | 'fail'; duration: number; error?: any }[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
    console.log(`\n🧪 Testing: ${name}`);
    const start = Date.now();
    try {
        await fn();
        const duration = Date.now() - start;
        console.log(`✅ PASS (${duration}ms)`);
        results.push({ test: name, status: 'pass', duration });
    } catch (e: any) {
        const duration = Date.now() - start;
        console.error(`❌ FAIL (${e.message})`);
        results.push({ test: name, status: 'fail', duration, error: e.message });
    }
}

async function main() {
    console.log("🔥 Starting AI Stress Test (Chaos Monkey)...");

    console.log("DEBUG: GROQ_API_KEY status:", process.env.GROQ_API_KEY ? "Loaded (" + process.env.GROQ_API_KEY.substring(0, 4) + "...)" : "MISSING");
    console.log("DEBUG: SUPABASE_URL status:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "Loaded" : "MISSING");

    // Dynamic Imports to respect Env Loading
    const { AgentOrchestrator } = await import('@/lib/agents/orchestrator');
    const { PlannerAgent } = await import('@/lib/agents/planner/planner-agent');

    // AgentContext is a type, so we don't import it dynamically here. 
    // It should be imported statically or we just use the shape if TS allows, 
    // but since we need it for typing CONTEXT, we'll assume it's available or cast it.
    // Actually, we can move the type import to the top of the file as 'import type' which is erased at runtime 
    // and doesn't affect side-effect order.

    // For now, let's just remove the destructuring of AgentContext since it's a type.
    // And rely on the static import I will add at the top.

    const CONTEXT = {
        userId: MOCK_USER_ID,
        now: new Date('2026-02-06T10:00:00Z'),
        timezone: 'UTC',
        currentSchedule: []
    };

    // 1. Planner Agent Stress
    const planner = new PlannerAgent();

    await runTest('Planner: Empty Input', async () => {
        const out = await planner.run("", CONTEXT);
        if (out.intent !== 'unknown' && out.intent !== 'clarify') throw new Error(`Expected unknown/clarify, got ${out.intent}`);
    });

    await runTest('Planner: Gibberish Input', async () => {
        const out = await planner.run("asdflkj asdflkj asdflkj", CONTEXT);
        if (out.intent !== 'unknown' && out.intent !== 'clarify') throw new Error(`Expected unknown/clarify, got ${out.intent}`);
    });

    await runTest('Planner: Huge Input (2048 chars)', async () => {
        const huge = "work ".repeat(500);
        const out = await planner.run("I need to focus on " + huge, CONTEXT);
        // Should not crash, intent might be Add Task
        if (!out) throw new Error("Returned null");
    });

    await runTest('Planner: Contradiction', async () => {
        const out = await planner.run("Schedule a meeting at 3am but I sleep at 3am", CONTEXT);
        // AI should hopefully figure it out or ask clarification
        console.log("Contradiction Output:", out);
    });

    // 2. Orchestrator Integration Stress
    const orchestrator = new AgentOrchestrator();

    await runTest('Orchestrator: Full Pipeline (Basic)', async () => {
        const res = await orchestrator.run(MOCK_USER_ID, "Schedule gym at 5pm", []);
        if (res.planner.intent === 'unknown') throw new Error("Planner failed to understand intent (fallback used)");
        if (!res.summary) throw new Error("No summary generated");
        if (res.scheduler.options.length === 0) throw new Error("No options found");
    });

    await runTest('Orchestrator: Impossible Request', async () => {
        // Mock a full schedule
        const fullSchedule = [{
            id: '1', start: new Date('2026-02-06T00:00:00Z'), end: new Date('2026-02-06T23:59:00Z'), type: 'fixed', is_fixed: true
        }];

        // Use a modified context with full schedule if run() supported it or via mockSchedule param
        const res = await orchestrator.run(MOCK_USER_ID, "Fit 2 hours of deep work", fullSchedule);

        // Should return options (maybe conflict) or impossible flag?
        // SchedulerOutput has impossible flag? NO, it has impossible: boolean
        if (!res.scheduler.impossible && res.scheduler.options.length > 0 && res.scheduler.options[0].patch.changes.length === 0) {
            // It might return a "No changes" option, which is effectively impossible but valid return
            console.log("Orchestrator handled impossible request gracefully");
        }
    });

    // 3. JSON Attack
    // This is hard to simulate without mocking `generateAIResponse` to return bad JSON.
    // skipped for this script, relies on static analysis of try/catch in agents.

    // Summary
    console.log("\n📊 Stress Test Summary");
    console.table(results);

    const reportPath = path.join(process.cwd(), 'ai_stress_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`Report written to ${reportPath}`);

    const fails = results.filter(r => r.status === 'fail');
    if (fails.length > 0) {
        console.error(`${fails.length} Tests Failed!`);
        process.exit(1);
    }
}

main().catch(console.error);
