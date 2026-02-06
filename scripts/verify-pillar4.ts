import { ValidatorAgent } from '../src/lib/agents/validator/validator-agent';
import { AgentContext, CalendarPatch } from '../src/lib/agents/core/types';
import { addHours, subHours } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

async function verifyPillar4() {
    console.log("🤝 Verifying Pillar 4: Trust (Anchor + Sacrifice)...");

    // 1. Setup Mock Schedule
    const now = new Date();
    const anchorBlock = {
        id: 'anchor-1',
        title: 'Board Meeting',
        start_time: now.toISOString(),
        end_time: addHours(now, 1).toISOString(),
        is_fixed: true, // ANCHOR
        block_type: 'anchor'
    };

    const flexibleBlock = {
        id: 'flex-1',
        title: 'Gym Session',
        start_time: addHours(now, 2).toISOString(),
        end_time: addHours(now, 3).toISOString(), // 60 mins
        is_fixed: false, // FLEXIBLE
        block_type: 'body'
    };

    const context: AgentContext = {
        userId: 'test-user',
        now: now,
        timezone: 'UTC',
        currentSchedule: [anchorBlock, flexibleBlock]
    };

    const validator = new ValidatorAgent();

    // TEST A: Conflict with ANCHOR (Should Fail)
    console.log("\n🧪 Test A: Conflict with ANCHOR");
    const patchA: CalendarPatch = {
        summary: "Try to overwrite meeting",
        changes: [{
            op: 'create',
            data: {
                id: uuidv4(),
                title: 'Emergency Call',
                start_time: anchorBlock.start_time,
                end_time: anchorBlock.end_time,
                is_fixed: true
            }
        }],
        requires_confirmation: true
    };

    const resultA = await validator.run({ patch: patchA, currentSchedule: context.currentSchedule! }, context);
    if (!resultA.valid && resultA.reason?.includes('locked anchor')) {
        console.log("✅ PASS: Validator protected the Anchor.");
    } else {
        console.error("❌ FAIL: Anchor was not protected.", resultA);
    }


    // TEST B: Conflict with FLEXIBLE (Should Suggest Sacrifice)
    console.log("\n🧪 Test B: Conflict with FLEXIBLE (Trust)");
    const patchB: CalendarPatch = {
        summary: "Overwrite Gym",
        changes: [{
            op: 'create',
            data: {
                id: uuidv4(),
                title: 'Client Call',
                start_time: flexibleBlock.start_time,
                end_time: flexibleBlock.end_time,
                is_fixed: true
            }
        }],
        requires_confirmation: true
    };

    const resultB = await validator.run({ patch: patchB, currentSchedule: context.currentSchedule! }, context);

    // Check Validity (Should be valid WITH sacrifices)
    // Actually, Validator logic returns valid=true if sacrifices are found, but required_action='sacrifice'.

    if (resultB.valid && resultB.required_action === 'sacrifice') {
        console.log("✅ PASS: Validator identified trade-off.");

        // Check Sacrifice Data
        const sacrifice = resultB.sacrifices?.[0];
        if (sacrifice && sacrifice.title === 'Gym Session' && sacrifice.description.includes('60 min')) {
            console.log("✅ PASS: Sacrifice details correct (Trust verified).");
            console.log("   Sacrifice:", sacrifice);
        } else {
            console.error("❌ FAIL: Sacrifice metadata incorrect.", resultB.sacrifices);
        }
    } else {
        console.error("❌ FAIL: Did not suggest sacrifice.", resultB);
    }
}

verifyPillar4();
