
import { SchedulerAgent } from '../src/lib/agents/scheduler/scheduler-agent';
import { AgentContext, PlannerOutput, RegulatorOutput } from '../src/lib/agents/core/types';
import { addHours, startOfDay, addMinutes } from 'date-fns';

async function runTest() {
    const scheduler = new SchedulerAgent();
    const userId = "test-user";
    const now = new Date();
    const todayStart = startOfDay(now);

    const context: AgentContext = {
        userId,
        now: addHours(todayStart, 6), // Current time: 6 AM
        timezone: 'UTC',
        currentSchedule: [],
        userState: {
            current_mode: 'maintenance',
            energy_level: 3,
            cognitive_load: 2,
            emotional_bandwidth: 2,
            emotional_state: 'focused',
            last_updated: new Date()
        },
        // MOCK BEHAVIOR PATTERNS
        behaviorPatterns: {
            preferred_windows: {
                body: ["07:00", "08:00"]
            },
            avoidance_data: {
                resistance_areas: ["morning"] // We mock resistance for "morning" to test conflict?
                // Wait, let's test PREFERENCE first.
            }
        }
    };

    const mockRegulator: RegulatorOutput = {
        response_mode: 'normal',
        max_options: 3,
        language_style: 'direct',
        ask_questions: false,
        warn_user: false
    };

    console.log("--- TEST 4: BEHAVIOR PREFERENCE ---");
    // Intent: "Schedule a workout"
    // Expectation: Should pick 07:00 or 08:00 based on patterns, instead of random or now.

    const workoutPlanner: PlannerOutput = {
        intent: 'add_constraint', // Using add_constraint per logic
        strategy: 'add_constraint',
        scope: 'block',
        urgency: 'medium',
        requires_calendar_change: true,
        entities: {
            new_task_text: "Hit the gym"
        },
        time_refs: [{
            duration_minutes: 60
        }]
    };

    const result = await scheduler.run({ planner: workoutPlanner, regulator: mockRegulator }, context);
    console.log("Workout Options:", JSON.stringify(result.options, null, 2));
}

runTest();
