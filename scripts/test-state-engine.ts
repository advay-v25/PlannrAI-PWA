import { StateEngine, BASELINE_STATE, StateInputs } from '../src/lib/user-state/state-engine';

function testStateEngine() {
    console.log("🧠 Testing State Engine...");

    // Scenario 1: Busy & Tired
    const inputs1: StateInputs = {
        sleepHours: 5, // -2 Energy
        missedBlocksCount: 5, // -1 Emotional
        completionRate: 0.4,
        sentiment: 'negative', // -1 Energy, -1 Emotional
        currentDate: new Date(),
        explicitSignal: 'low_energy'
    };

    // Assume start from Baseline
    const result1 = StateEngine.calculateNextState(BASELINE_STATE, inputs1);
    console.log("\nScenario 1: Busy & Tired");
    console.log("Inputs:", { sleep: 5, missed: 5, sentiment: 'negative' });
    console.log("Result:", {
        energy: result1.energy_level,
        cognitive: result1.cognitive_load,
        emotional: result1.emotional_bandwidth,
        mode: result1.current_mode
    });

    if (result1.current_mode === 'survival' && result1.energy_level <= 2) {
        console.log("✅ PASS: Correctly entered Survival Mode.");
    } else {
        console.error("❌ FAIL: Did not enter Survival Mode.");
    }

    // Scenario 2: Recovery
    const inputs2: StateInputs = {
        sleepHours: 9, // +1 Energy
        missedBlocksCount: 0,
        completionRate: 0.9, // +1 Emotional
        sentiment: 'positive', // +1 Emotional
        currentDate: new Date()
    };

    // Start from a neutral state
    const result2 = StateEngine.calculateNextState(BASELINE_STATE, inputs2);
    console.log("\nScenario 2: Recovery");
    console.log("Inputs:", { sleep: 9, completion: 0.9, sentiment: 'positive' });
    console.log("Result:", {
        energy: result2.energy_level,
        cognitive: result2.cognitive_load,
        emotional: result2.emotional_bandwidth,
        mode: result2.current_mode
    });

    if (result2.current_mode === 'growth' || result2.energy_level > 3) {
        console.log("✅ PASS: Correctly shifted towards Growth.");
    } else {
        console.error("❌ FAIL: Did not improve state.");
    }

    // Scenario 3: Crisis
    const inputs3: StateInputs = {
        sleepHours: 7,
        missedBlocksCount: 0,
        completionRate: 0.5,
        currentDate: new Date(),
        explicitSignal: 'crisis'
    };

    const result3 = StateEngine.calculateNextState(BASELINE_STATE, inputs3);
    console.log("\nScenario 3: Explicit Crisis");
    console.log("Result Mode:", result3.current_mode);

    if (result3.current_mode === 'survival' && result3.emotional_bandwidth === 1) {
        console.log("✅ PASS: Crisis Override worked.");
    } else {
        console.error("❌ FAIL: Crisis Override failed.");
    }
}

testStateEngine();
