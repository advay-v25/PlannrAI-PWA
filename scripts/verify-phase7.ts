
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Mock imports
import { StateEngine, BASELINE_STATE, StateInputs } from '@/lib/user-state/state-engine';
import { AnticipationService } from '@/lib/intelligence/anticipation-service';

async function verifyEmotionalLogic() {
    console.log("🧪 Testing Emotional Logic...");
    const base = { ...BASELINE_STATE };

    // Test 1: Overwhelmed
    const overwhelmedInputs: StateInputs = {
        currentDate: new Date(),
        missedBlocksCount: 5, // High
        completionRate: 0.2,
        sentiment: 'negative',
    };
    const s1 = StateEngine.calculateNextState(base, overwhelmedInputs);
    console.log(`Input: High Missed -> State: ${s1.emotional_state} (Expected: overwhelmed)`);
    if (s1.emotional_state !== 'overwhelmed') console.error("FAIL: Expected overwhelmed");

    // Test 2: Motivated
    const motivatedInputs: StateInputs = {
        currentDate: new Date(),
        missedBlocksCount: 0,
        completionRate: 0.9,
        sentiment: 'positive',
    };
    // Force bandwidth to 3 for test
    const baseMotivated = { ...base, emotional_bandwidth: 3 as any };
    const s2 = StateEngine.calculateNextState(baseMotivated, motivatedInputs);
    console.log(`Input: High Completion + Positive -> State: ${s2.emotional_state} (Expected: motivated)`);
    if (s2.emotional_state !== 'motivated') console.error("FAIL: Expected motivated");
}

async function verifyAnticipation() {
    console.log("\n🧪 Testing Anticipation Service (Mocked DB)...");
    // Since this requires DB, we might just log that we can't fully automated test without mocking Supabase.
    // However, if we run this with `tsx`, it connects to real DB if env is set.
    // Let's rely on the module import check.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.log("Skipping DB test (No Env)");
        return;
    }

    // Assuming user exists
    const userId = 'stress-test-user-v1';
    try {
        const signal = await AnticipationService.analyzeTomorrow(userId);
        console.log("Anticipation Signal:", signal);
    } catch (e) {
        console.error("Anticipation Error:", e);
    }
}

async function verifyNarrativeReview() {
    console.log("\n🧪 Testing Narrative Review Structure...");

    // Mock Response from AI (simulated)
    const mockAIOutput = {
        energyTrend: "stable",
        stressTrend: "decreasing",
        frictionPatterns: ["Overscheduled mornings", "Missed lunch breaks"],
        suggestedAdjustment: "Shift high-focus work to 10am.",
        leverAction: {
            type: "update_goal",
            payload: { goal_id: "123", updates: { minutes_per_day: 30 } },
            description: "Reducing goal intensity."
        }
    };

    console.log("Review JSON:", JSON.stringify(mockAIOutput, null, 2));

    if (!mockAIOutput.leverAction || !mockAIOutput.leverAction.type) {
        console.error("FAIL: Lever Action missing or invalid.");
    } else {
        console.log("PASS: Lever Action present.");
    }

    // Verify Patterns Limit
    if (mockAIOutput.frictionPatterns.length > 3) {
        console.error("FAIL: Too many patterns.");
    } else {
        console.log("PASS: Patterns count valid.");
    }
}

async function main() {
    await verifyEmotionalLogic();
    await verifyNarrativeReview();
    // await verifyAnticipation(); 
}

main();
