import { AgentOrchestrator } from '../src/lib/agents/orchestrator';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testPlanner() {
    const orchestrator = new AgentOrchestrator();

    // Simulate User Input
    const inputs = [
        "I'm exhausted and can't do the 4pm workout.", // Deviation (Energy)
        "I need to book a dentist appointment tomorrow at 10am.", // Constraint
        "Show me my schedule for today." // Query
    ];

    // Mock Schedule for testing
    const mockSchedule = [
        { id: '1', title: 'Work', start_time: new Date().toISOString().split('T')[0] + 'T09:00:00.000Z', end_time: new Date().toISOString().split('T')[0] + 'T17:00:00.000Z', is_fixed: true }
    ];

    // Mock User ID
    const userId = "test-user-v2";

    console.log("🧪 Testing Multi-Agent Pipeline with Mock Schedule...\n");

    for (const msg of inputs) {
        console.log(`\n🗣️ User: "${msg}"`);
        try {
            const result = await orchestrator.run(userId, msg, mockSchedule);
            console.log("🤖 Planner Output:\n", JSON.stringify(result.planner, null, 2));
            console.log("❤️ Regulator Output:\n", JSON.stringify(result.regulator, null, 2));
            console.log("🗓️ Scheduler Output:\n", JSON.stringify(result.scheduler, null, 2));
            console.log("🛡️ Validator Output:\n", JSON.stringify(result.validation, null, 2));
        } catch (e) {
            console.error("❌ Error:", e);
        }
    }
}

testPlanner();
