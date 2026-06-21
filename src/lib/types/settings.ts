

interface MealWindow {


    start: string;
    end: string;
}

interface PillarWindow {
    preferred: string[]; // ["09:00-12:00"]
    avoid?: string[];
}

export interface ProfilePreferences {
    user_id: string;

    // Core Constraints
    sleep_start: string;
    wake_time: string;
    wind_down_min: number;
    morning_routine_min: number;
    meals_per_day: 2 | 3;
    meal_windows: {
        breakfast?: MealWindow;
        lunch?: MealWindow;
        dinner?: MealWindow;
    };
    buffer_min: 5 | 10 | 15;
    allow_weekend_work: boolean;
    weekend_intensity: 'off' | 'light' | 'normal';

    // Work Preferences
    preferred_windows: {
        mind?: string[];
        body?: string[];
        craft?: string[];
    };
    pillar_spacing_preference: 'alternate' | 'cluster_ok';
    max_daily_load_min?: number;

    // AI Behavior
    proactive_level: 'off' | 'low' | 'standard';
    ask_before_changes: boolean;
    max_ai_options: 1 | 2 | 3;
    low_energy_mode: boolean;
    overwhelm_mode: boolean;
    weekly_review_enabled: boolean;

    // Permissions
    calendar_integration_enabled: boolean;
    notifications_enabled: boolean;
    notification_times: string[];

    // Body & Diet
    diet_type: 'veg' | 'vegan' | 'eggetarian' | 'other';
    allergies: string[];
    workout_preference: 'gym' | 'sports' | 'walk' | 'mixed';
    workout_min_per_day: number;
    is_workout_protected: boolean;

    // Routines
    default_morning_stack_id?: string;
    default_night_stack_id?: string;

    updated_at: string;
}

export const DEFAULT_PREFERENCES: Omit<ProfilePreferences, 'user_id' | 'updated_at'> = {
    sleep_start: '23:00',
    wake_time: '07:00',
    wind_down_min: 30,
    morning_routine_min: 0,
    meals_per_day: 3,
    meal_windows: {
        breakfast: { start: "07:00", end: "10:00" },
        lunch: { start: "12:00", end: "15:00" },
        dinner: { start: "20:00", end: "21:30" }
    },
    buffer_min: 10,
    allow_weekend_work: true,
    weekend_intensity: 'light',

    preferred_windows: {
        mind: ["09:00-12:00"],
        body: ["17:00-19:00"],
        craft: ["13:00-16:00"]
    },
    pillar_spacing_preference: 'cluster_ok',

    proactive_level: 'standard',
    ask_before_changes: true,
    max_ai_options: 3,
    low_energy_mode: false,
    overwhelm_mode: false,
    weekly_review_enabled: true,

    calendar_integration_enabled: false,
    notifications_enabled: false,
    notification_times: [],

    diet_type: 'other',
    allergies: [],
    workout_preference: 'mixed',
    workout_min_per_day: 30,
    is_workout_protected: true
};
