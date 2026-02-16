
import { SchedulerService } from '../src/lib/scheduler/scheduler-service';
import { addDays, format } from 'date-fns';

console.log('🧪 Verifying Scheduler Service...');

const today = new Date();
const formattedDate = format(today, 'yyyy-MM-dd');

const mockContext: any = {
    startDate: today,
    days: 3,
    profile: {
        sleep_start: '23:00',
        sleep_end: '07:00',
        meal_preferences: { breakfast: '08:00', lunch: '13:00', dinner: '19:00' },
        weekend_intensity: 'light'
    },
    commitments: [
        { id: 'c1', title: 'Work', start_time: '09:00', end_time: '17:00', days_of_week: [1, 2, 3, 4, 5] },
        { id: 'c2', title: 'Gym', start_time: '18:00', end_time: '19:00', days_of_week: [1, 3, 5] }
    ],
    goals: [
        { id: 'g1', title: 'Launch App', is_paused: false, pillar: 'mind' }
    ],
    habitStacks: [
        { id: 'h1', name: 'Morning Routine', preferred_window: 'morning', duration: 30 }
    ],
    existingBlocks: []
};

const service = new SchedulerService(mockContext);
const blocks = service.generateBaseline();

console.log(`✅ Generated ${blocks.length} blocks for 3 days.`);

// Basic assertions
const sleepBlocks = blocks.filter((b: any) => b.title === 'Sleep');
console.log(`- Sleep Blocks: ${sleepBlocks.length} (Expected 6: 2 per day * 3 days)`);

const workBlocks = blocks.filter((b: any) => b.title === 'Work');
console.log(`- Work Commitments found: ${workBlocks.length} (Depends on day of week)`);

const goalBlocks = blocks.filter((b: any) => b.block_type === 'goal');
console.log(`- Goal Blocks: ${goalBlocks.length}`);

if (blocks.length > 0) {
    console.log('Example Day 1 Schedule:');
    blocks.filter((b: any) => b.date === formattedDate).sort((a: any, b: any) => a.start_time.localeCompare(b.start_time)).forEach((b: any) => {
        console.log(`  [${b.start_time} - ${b.end_time}] ${b.title} (${b.block_type})`);
    });
}
