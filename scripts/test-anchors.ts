
import { SchedulerAgent } from '../src/lib/agents/scheduler/scheduler-agent';
import { AgentContext, PlannerOutput, RegulatorOutput } from '../src/lib/agents/core/types';
import { addHours, startOfDay } from 'date-fns';

async function runTest() {
    console.log("--- TEST ANCHOR EXCLUSIVITY ---");
    const scheduler = new SchedulerAgent();
    const userId = "test-user";
    const now = new Date();
    const todayStart = startOfDay(now);

    // Mock an Anchor directly in the schedule (simulating what ContextBuilder now does)
    const mockScheduleWithAnchor = [
        {
            id: 'anchor-1',
            title: 'Work Block (Anchor)',
            start_time: addHours(todayStart, 9).toISOString(), // 09:00
            end_time: addHours(todayStart, 17).toISOString(),  // 17:00
            is_fixed: true, // EXCLUSIVE
            block_type: 'anchor',
            context: 'Work'
        }
    ];

    const context: AgentContext = {
        userId,
        now: addHours(todayStart, 8), // 08:00 AM
        timezone: 'UTC',
        currentSchedule: mockScheduleWithAnchor,
        userState: { current_mode: 'normal' } as any
    };

    const mockRegulator: RegulatorOutput = {
        response_mode: 'normal',
        max_options: 3,
        language_style: 'direct',
        ask_questions: false,
        warn_user: false
    };

    // Attempt to schedule something at 10:00 AM (Conflict with Anchor)
    const planner: PlannerOutput = {
        intent: 'add_constraint',
        strategy: 'add_constraint',
        scope: 'block',
        urgency: 'medium',
        requires_calendar_change: true,
        entities: {
            new_task_text: "Doctor Appointment"
        },
        time_refs: [{
            start: addHours(todayStart, 10).toISOString(),
            duration_minutes: 60
        }]
    };

    console.log("Attempting to schedule 'Doctor Appointment' at 10:00 AM (Inside Anchor 09-17)...");
    const result = await scheduler.run({ planner, regulator: mockRegulator }, context);

    // We expect the result to handle the conflict (warn or fail), OR force it if strategy is force.
    // The current Scheduler might 'create' it anyway but let's see if it Detects overlaps.
    // Wait, 'add_constraint' usually FORCES.
    // But if we want exclusivity, we should verify if the SOLVER (used in other strategies) avoids it.

    console.log("Result Options:", JSON.stringify(result.options, null, 2));

    // TEST 2: Move Strategy (Should avoid Anchor)
    console.log("\n--- TEST 2: FIND SLOT (Move) ---");
    const movePlanner: PlannerOutput = {
        intent: 'reschedule',
        strategy: 'move',
        scope: 'block',
        urgency: 'medium',
        requires_calendar_change: true,
        entities: { target_event_hint: 'workout' } // dummy
    };

    // Check internal solver logic for finding slot
    const { findNextAvailableSlot } = await import('../src/lib/scheduling/solver');
    const items = mockScheduleWithAnchor.map(s => ({
        id: s.id,
        start: new Date(s.start_time),
        end: new Date(s.end_time),
        type: 'fixed' as const
    }));

    // Find slot for 60 mins starting at 09:00
    const slot = findNextAvailableSlot(items, 60, addHours(todayStart, 9), { workStartHour: 8, workEndHour: 22 });
    console.log("Solver suggested slot starting search at 09:00:", slot ? slot.start.toISOString() : "None");

    // Expectation: Should be AFTER 17:00
    if (slot && slot.start >= new Date(mockScheduleWithAnchor[0].end_time)) {
        console.log("PASS: Solver skipped the anchor.");
    } else {
        console.log("FAIL: Solver overlapped or failed.");
    }
}

runTest();
