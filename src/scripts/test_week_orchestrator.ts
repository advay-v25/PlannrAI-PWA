import { WeekOrchestrator, ProfilePrefs, Goal, ScheduleBlockRow } from '../lib/calendar/week-orchestrator';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase Client
const mockSupabase = {
    from: (table: string) => ({
        select: (cols: string) => ({
            eq: (col: string, val: string) => ({
                single: async () => {
                    if (table === 'profiles') return { data: mockProfile, error: null };
                    return { data: null, error: null };
                },
                lte: (col: string, val: string) => Promise.resolve({ data: (table === 'schedule_blocks' ? [] : []), error: null })
            }),
            gte: (col: string, val: string) => ({
                lte: (c2: string, v2: string) => Promise.resolve({ data: [], error: null }) // anchors/schedule
            })
        })
    })
} as unknown as SupabaseClient;

// Mock Data
const mockProfile = {
    timezone: 'UTC',
    sleep_start: '23:00',
    sleep_end: '07:00',
    winddown_mins: 30,
    buffer_minutes: 10,
    meal_duration_minutes: 30,
    meals_per_day: 3,
    weekend_intensity: 'normal',
    preferred_workdays: [0, 1, 2, 3, 4, 5, 6],
    meal_windows: {
        breakfast: { start: '07:00', end: '10:00' },
        lunch: { start: '12:00', end: '15:00' },
        dinner: { start: '20:00', end: '21:30' },
    },
    energy_level: 2, // Low
    stress_level: 8, // High
    body_preferences: { chronotype: 'wolf' } // Wolf
};

// We need to inject goals too, but WeekOrchestrator loads them internally via Supabase.
// I need to patch the mock to return goals.

const mockGoals = [
    {
        id: 'g1',
        title: 'Deep Work',
        pillar: 'mind',
        minutes_per_day: 60,
        days_per_week: 5,
        priority: 'high',
        energy: 'heavy',
        preferred_windows: ['morning'], // Wolf prefers late, but let's see if bio overrides
        status: 'active'
    }
];

// Update mock to handle goals
const mockSupabaseWithGoals = {
    from: (table: string) => {
        return {
            select: (cols: string) => {
                return {
                    eq: (col: string, val: string) => {
                        if (table === 'goals' && col === 'user_id') {
                            return {
                                eq: (c2: string, v2: string) => Promise.resolve({ data: mockGoals, error: null })
                            };
                        }
                        if (table === 'profiles') return { single: async () => ({ data: mockProfile, error: null }) };
                        if (table === 'schedule_blocks') return {
                            or: () => ({ gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }) }),
                            gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) })
                        };
                        return { single: async () => ({ data: null, error: null }) };
                    }
                };
            }
        };
    }
} as unknown as SupabaseClient;

async function runTest() {
    console.log('--- Testing WeekOrchestrator Logic ---');
    console.log('Profile: Low Energy, High Stress, Wolf Chronotype');
    console.log('Goal: High Priority, Heavy Energy, Preferred Morning');

    const result = await WeekOrchestrator.generateWeek({
        userId: 'test-user',
        weekStartISO: '2025-01-06', // Monday
        mode: 'plan',
        supabase: mockSupabaseWithGoals
    });

    console.log('Generated Blocks:', result.previewBlocks.length);
    const goalBlocks = result.previewBlocks.filter(b => b.block_type === 'goal');
    console.log('Goal Blocks Placed:', goalBlocks.length);

    if (goalBlocks.length > 0) {
        console.log('Sample Block:', goalBlocks[0]);
        console.log('Start Time:', goalBlocks[0].start_time);

        // Analyze placement
        // Wolf peak is 13:00-20:00.
        // Provided Preference is "Morning" (< 12:00).
        // Bio (Low Energy) penalizes High Energy tasks.
        // Bio (High Stress) penalizes High Priority tasks.

        // If it scheduled it in the morning, it followed explicit preference but might have low score.
        // If it scheduled it afternoon, it followed bio (Wolf).

        const startHour = parseInt(goalBlocks[0].start_time.split(':')[0]);
        console.log(`Placed at hour: ${startHour}`);

        if (startHour >= 13) {
            console.log('✅ Placed in Wolf peak hours (Bio won/matched)');
        } else {
            console.log('ℹ️ Placed in Morning (Preference won over Bio?)');
        }
    } else {
        console.log('❌ No goals placed. Maybe constraints too tight?');
    }
}

runTest().catch(console.error);
