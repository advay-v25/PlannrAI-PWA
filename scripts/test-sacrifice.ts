import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ValidatorAgent } from '../src/lib/agents/validator/validator-agent';
import { AgentContext } from '../src/lib/agents/core/types';
import { addHours, startOfHour } from 'date-fns';

dotenv.config({ path: '.env.local' });

async function testSacrificeLogic() {
    console.log("⚖️ Testing Sacrifice Logic...");

    // 1. Mock Context
    // Scenario: User has "Gym" (Flexible) at 3pm-4pm.
    // Patch: "Meeting" (Fixed) at 3:30pm (Overlap).

    const now = new Date();
    const gymStart = startOfHour(addHours(now, 1)); // Next hour
    const gymEnd = addHours(gymStart, 1);

    const context: AgentContext = {
        userId: 'test-user',
        now: now,
        timezone: 'UTC',
        currentSchedule: [{
            id: 'gym-block',
            title: 'Gym Session',
            start_time: gymStart.toISOString(),
            end_time: gymEnd.toISOString(),
            is_fixed: false, // FLEXIBLE!
            type: 'task'
        }]
    };

    console.log(`   Existing Block: Gym (${gymStart.toLocaleTimeString()} - ${gymEnd.toLocaleTimeString()}) [Flexible]`);

    // 2. Mock Patch (The Conflict)
    const meetingStart = addHours(gymStart, 0.5); // Starts 30 mins into Gym
    const meetingEnd = addHours(meetingStart, 1);

    const patch = {
        summary: "Schedule Emergency Meeting",
        changes: [{
            op: 'create' as const,
            data: {
                id: 'new-meeting',
                title: 'Emergency Meeting',
                start_time: meetingStart.toISOString(),
                end_time: meetingEnd.toISOString(),
                is_fixed: true,
                type: 'anchor'
            }
        }],
        requires_confirmation: true,
        warnings: [],
        sacrifices: []
    };

    console.log(`   Proposed Patch: Meeting (${meetingStart.toLocaleTimeString()} - ${meetingEnd.toLocaleTimeString()})`);

    // 3. Run Validator
    const validator = new ValidatorAgent();
    // @ts-ignore - Mocking context strictly
    const result = await validator.run({ patch, currentSchedule: context.currentSchedule }, context);

    console.log("\n🛡️ Validator Result:");
    console.log(`   Valid: ${result.valid}`);
    console.log(`   Action: ${result.required_action}`);
    console.log(`   Sacrifices: ${JSON.stringify(result.sacrifices)}`);
    console.log(`   Reason: ${result.reason}`);

    if (result.valid && result.sacrifices && result.sacrifices.length > 0) {
        console.log("\n✅ SUCCESS: Validator correctly identified a soft conflict (Sacrifice).");
    } else {
        console.error("\n❌ FAILURE: Validator did not handle sacrifice logic as expected.");
    }
}

testSacrificeLogic();
