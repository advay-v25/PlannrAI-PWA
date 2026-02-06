
import { SchedulerAgent } from '../src/lib/agents/scheduler/scheduler-agent';
import { AgentContext, PlannerOutput, RegulatorOutput } from '../src/lib/agents/core/types';
import { addHours, startOfDay, addMinutes } from 'date-fns';

async function runTest() {
    const scheduler = new SchedulerAgent();
    const userId = "test-user";
    const now = new Date();
    const todayStart = startOfDay(now);

    // Mock Schedule
    // 07:00 - 08:00 Fixed (Workout)
    // 09:00 - 11:00 Flexible (Deep Work)
    // 12:00 - 13:00 Fixed (Lunch)
    const mockSchedule = [
        {
            id: 'block-1',
            title: 'Morning Workout',
            start_time: addHours(todayStart, 7).toISOString(),
            end_time: addHours(todayStart, 8).toISOString(),
            is_fixed: true,
            context: 'Morning Workout'
        },
        {
            id: 'block-2',
            title: 'Deep Work',
            start_time: addHours(todayStart, 9).toISOString(),
            end_time: addHours(todayStart, 11).toISOString(),
            is_fixed: false,
            context: 'Deep Work'
        },
        {
            id: 'block-3',
            title: 'Lunch',
            start_time: addHours(todayStart, 12).toISOString(),
            end_time: addHours(todayStart, 13).toISOString(),
            is_fixed: true,
            context: 'Lunch'
        }
    ];

    const context: AgentContext = {
        userId,
        now: addHours(todayStart, 8), // Current time: 8 AM
        timezone: 'UTC',
        currentSchedule: mockSchedule,
        userState: {
            current_mode: 'maintenance',
            energy_level: 3,
            cognitive_load: 2,
            emotional_bandwidth: 2,
            emotional_state: 'focused',
            last_updated: new Date()
        }
    };

    const mockRegulator: RegulatorOutput = {
        response_mode: 'normal',
        max_options: 3,
        language_style: 'direct',
        ask_questions: false,
        warn_user: false
    };

    console.log("--- TEST 1: MOVE STRATEGY ---");
    const movePlanner: PlannerOutput = {
        intent: 'reschedule',
        strategy: 'move',
        scope: 'block',
        urgency: 'medium',
        requires_calendar_change: true,
        entities: {
            target_event_hint: 'deep work'
        }
    };

    const result1 = await scheduler.run({ planner: movePlanner, regulator: mockRegulator }, context);
    console.log("Move Options:", JSON.stringify(result1.options, null, 2));

    // DEBUG: Direct Solver Check logic
    // We check if Solver can find a slot for 120 mins starting from 8 AM
    const { findNextAvailableSlot } = await import('../src/lib/scheduling/solver');
    const target = mockSchedule.find(b => b.title === 'Deep Work');

    if (target) {
        const otherItems = mockSchedule.filter(b => b.id !== target.id).map(s => ({
            id: s.id,
            start: new Date(s.start_time),
            end: new Date(s.end_time),
            type: s.is_fixed ? 'fixed' : 'flexible' as any
        }));

        console.log("DEBUG: Solving for 120 mins from", context.now.toISOString());

        const slot = findNextAvailableSlot(
            otherItems,
            120,
            context.now,
            { workStartHour: 8, workEndHour: 22 }
        );
        console.log("DEBUG: Solver result:", slot);
    }

    console.log("\n--- TEST 2: SHORTEN STRATEGY ---");
    const shortenPlanner: PlannerOutput = {
        intent: 'reduce_intensity',
        strategy: 'shorten',
        scope: 'block',
        urgency: 'medium',
        requires_calendar_change: true,
        entities: {
            target_event_hint: 'deep work'
        }
    };

    const result2 = await scheduler.run({ planner: shortenPlanner, regulator: mockRegulator }, context);
    console.log("Shorten Options:", JSON.stringify(result2.options, null, 2));

    console.log("\n--- TEST 3: CANCEL STRATEGY ---");
    const cancelPlanner: PlannerOutput = {
        intent: 'reduce_intensity',
        strategy: 'cancel',
        scope: 'block',
        urgency: 'high',
        requires_calendar_change: true,
        entities: {
            target_event_hint: 'deep work'
        }
    };

    const result3 = await scheduler.run({ planner: cancelPlanner, regulator: mockRegulator }, context);
    console.log("Cancel Options:", JSON.stringify(result3.options, null, 2));
}

runTest();
