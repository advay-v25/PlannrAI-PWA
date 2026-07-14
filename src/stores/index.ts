import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, Goal, Commitment } from '@/types/database';

export interface OnboardingGoal {
    title: string;
    pillar: 'mind' | 'body' | 'craft';
    current_minutes_per_day: number;
    target_minutes_per_day: number;
    days_per_week?: number;
    energy_demand?: 'light' | 'medium' | 'heavy';
    preferred_time_of_day: 'morning' | 'afternoon' | 'evening' | 'flexible';
    importance: 'low' | 'medium' | 'high';
}

export interface OnboardingCommitment {
    title: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
    is_active?: boolean;
}

export type FailureMode =
    | 'unexpected_meetings'
    | 'low_afternoon_energy'
    | 'social_commitments'
    | 'procrastination'
    | 'overcommitting'
    | 'no_buffer_time'
    | 'distractions'
    | 'underestimating_time'
    | 'sleep_deprivation'
    | 'none';

export interface OnboardingData {
    // Step 1: Identity
    full_name: string;
    timezone: string;

    // Step 2: Daily Rhythm
    sleep_start: string;
    sleep_end: string;
    chronotype: 'lark' | 'bear' | 'owl' | 'wolf';
    wind_down_mins: number;
    morning_routine_mins: number;
    meals_per_day: number;
    two_meals_selection: 'breakfast_lunch' | 'lunch_dinner' | 'breakfast_dinner' | null;
    custom_meal_times: {
        breakfast?: string;
        lunch?: string;
        dinner?: string;
    };
    default_buffer_duration: number;

    // Step 3: Anchors
    commitments: OnboardingCommitment[];

    // Step 4: Goals
    goals: OnboardingGoal[];

    // Step 5: Failure Modes & Permissions
    failure_modes: FailureMode[];
    ai_can_suggest?: boolean;
    ai_can_analyze?: boolean;
    ai_can_draft?: boolean;

    // Step 6: Generation
    selected_variant_id: string | null;

    // Step 7: Scan
    scan_skipped?: boolean;
    bio_scan_url?: string;

    // Legacy compat (kept for API)
    meals_per_day_num?: number;
    meal_windows: Record<string, any>;
    peak_windows: any[];
    low_windows: any[];
    work_style: string | null;
    energy_level?: number;
    stress_level?: number;
    body_preferences?: Record<string, any>;
    buffer_config?: Record<string, any>;
    ai_profile?: Record<string, any>;
}

// User Store
interface UserState {
    profile: Profile | null;
    isLoading: boolean;
    setProfile: (profile: Profile | null) => void;
    setLoading: (loading: boolean) => void;
    toggleLowEnergyMode: () => void;
    updateProfile: (updates: Partial<Profile>) => void;
}

export const useUserStore = create<UserState>((set) => ({
    profile: null,
    isLoading: true,
    setProfile: (profile) => set({ profile }),
    setLoading: (isLoading) => set({ isLoading }),
    toggleLowEnergyMode: () =>
        set((state) => ({
            profile: state.profile
                ? { ...state.profile, low_energy_mode: !state.profile.low_energy_mode }
                : null,
        })),
    updateProfile: (updates) =>
        set((state) => ({
            profile: state.profile ? { ...state.profile, ...updates } : null,
        })),
}));

// Onboarding Store
interface OnboardingState {
    currentStep: number;
    data: OnboardingData;
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    updateData: (updates: Partial<OnboardingData>) => void;
    addGoal: (goal: OnboardingData['goals'][0]) => void;
    removeGoal: (index: number) => void;
    addCommitment: (commitment: OnboardingData['commitments'][0]) => void;
    removeCommitment: (index: number) => void;
    reset: () => void;
}

const defaultOnboardingData: OnboardingData = {
    full_name: '',
    // PlannrAI is currently sold only in India — default new signups to IST
    // rather than trusting browser auto-detection (VPNs, misconfigured devices).
    timezone: 'Asia/Kolkata',

    // Step 2: Daily Rhythm
    sleep_start: '23:00',
    sleep_end: '07:00',
    chronotype: 'bear',
    wind_down_mins: 30,
    morning_routine_mins: 0,
    meals_per_day: 3,
    two_meals_selection: null,
    custom_meal_times: {
        breakfast: '08:00',
        lunch: '13:00',
        dinner: '19:30',
    },
    default_buffer_duration: 10,

    // Step 3: Anchors
    commitments: [],

    // Step 4: Goals
    goals: [],

    // Step 5: Failure Modes
    failure_modes: [],

    // Step 6: Options
    selected_variant_id: null,

    // Legacy compat
    meal_windows: {},
    peak_windows: [],
    low_windows: [],
    work_style: null,
};

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set) => ({
            currentStep: 0,
            data: defaultOnboardingData,
            setStep: (step) => set({ currentStep: step }),
            nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
            prevStep: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),
            updateData: (updates) =>
                set((state) => ({
                    data: { ...state.data, ...updates },
                })),
            addGoal: (goal) =>
                set((state) => ({
                    data: { ...state.data, goals: [...state.data.goals, goal] },
                })),
            removeGoal: (index: number) =>
                set((state) => ({
                    data: {
                        ...state.data,
                        goals: state.data.goals.filter((_: any, i: number) => i !== index),
                    },
                })),
            addCommitment: (commitment) =>
                set((state) => ({
                    data: { ...state.data, commitments: [...state.data.commitments, commitment] },
                })),
            removeCommitment: (index: number) =>
                set((state) => ({
                    data: {
                        ...state.data,
                        commitments: state.data.commitments.filter((_: any, i: number) => i !== index),
                    },
                })),
            reset: () => set({ currentStep: 0, data: defaultOnboardingData }),
        }),
        {
            name: 'plannrai-onboarding',
            merge: (persisted: any, current) => ({
                ...current,
                ...persisted,
                data: { ...defaultOnboardingData, ...(persisted?.data ?? {}) },
            }),
        }
    )
);

// Goals Store
interface GoalsState {
    goals: Goal[];
    isLoading: boolean;
    setGoals: (goals: Goal[]) => void;
    addGoal: (goal: Goal) => void;
    updateGoal: (id: string, updates: Partial<Goal>) => void;
    removeGoal: (id: string) => void;
    togglePause: (id: string) => void;
    setLoading: (loading: boolean) => void;
}

export const useGoalsStore = create<GoalsState>((set) => ({
    goals: [],
    isLoading: true,
    setGoals: (goals) => set({ goals }),
    addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
    updateGoal: (id, updates) =>
        set((state) => ({
            goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),
    removeGoal: (id) =>
        set((state) => ({
            goals: state.goals.filter((g) => g.id !== id),
        })),
    togglePause: (id) =>
        set((state) => ({
            goals: state.goals.map((g) =>
                g.id === id ? { ...g, is_paused: !g.is_paused } : g
            ),
        })),
    setLoading: (isLoading) => set({ isLoading }),
}));

// Coach Store
interface CoachMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    response?: {
        facts: string;
        interpretation: string;
        options: string[];
        permissionCheck: string;
    };
    timestamp: Date;
}

interface CoachState {
    messages: CoachMessage[];
    isLoading: boolean;
    addMessage: (message: Omit<CoachMessage, 'id' | 'timestamp'>) => void;
    setLoading: (loading: boolean) => void;
    clearMessages: () => void;
}

export const useCoachStore = create<CoachState>((set) => ({
    messages: [],
    isLoading: false,
    addMessage: (message) =>
        set((state) => ({
            messages: [
                ...state.messages,
                {
                    ...message,
                    id: crypto.randomUUID(),
                    timestamp: new Date(),
                },
            ],
        })),
    setLoading: (isLoading) => set({ isLoading }),
    clearMessages: () => set({ messages: [] }),
}));

// Habit Stacks Store
interface HabitStack {
    id: string;
    user_id: string;
    goal_id: string | null;
    trigger_habit: string;
    action_habit: string;
    trigger_time: string | null;
    action_duration_mins: number;
    current_streak: number;
    longest_streak: number;
    last_completed: string | null;
    total_completions: number;
    grace_days_used: number;
    max_grace_days: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface HabitStacksState {
    stacks: HabitStack[];
    isLoading: boolean;
    setStacks: (stacks: HabitStack[]) => void;
    addStack: (stack: HabitStack) => void;
    updateStack: (id: string, updates: Partial<HabitStack>) => void;
    removeStack: (id: string) => void;
    completeStack: (id: string) => void;
    setLoading: (loading: boolean) => void;
}

export const useHabitStacksStore = create<HabitStacksState>((set) => ({
    stacks: [],
    isLoading: true,
    setStacks: (stacks) => set({ stacks }),
    addStack: (stack) => set((state) => ({ stacks: [...state.stacks, stack] })),
    updateStack: (id, updates) =>
        set((state) => ({
            stacks: state.stacks.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),
    removeStack: (id) =>
        set((state) => ({
            stacks: state.stacks.filter((s) => s.id !== id),
        })),
    completeStack: (id) =>
        set((state) => ({
            stacks: state.stacks.map((s) =>
                s.id === id
                    ? {
                        ...s,
                        current_streak: s.current_streak + 1,
                        total_completions: s.total_completions + 1,
                        last_completed: new Date().toISOString().split('T')[0],
                    }
                    : s
            ),
        })),
    setLoading: (isLoading) => set({ isLoading }),
}));

// Daily Log Store - Reality Intake
interface DailyLogState {
    todayLog: {
        energy_level: number;
        mood: string;
        wins: string[];
        challenges: string[];
    } | null;
    blockStatuses: Map<string, 'done' | 'partial' | 'missed' | 'skipped'>;
    setTodayLog: (log: DailyLogState['todayLog']) => void;
    updateEnergy: (level: number) => void;
    updateMood: (mood: string) => void;
    addWin: (win: string) => void;
    setBlockStatus: (blockId: string, status: 'done' | 'partial' | 'missed' | 'skipped') => void;
}

export const useDailyLogStore = create<DailyLogState>((set) => ({
    todayLog: null,
    blockStatuses: new Map(),
    setTodayLog: (todayLog) => set({ todayLog }),
    updateEnergy: (level) =>
        set((state) => ({
            todayLog: state.todayLog
                ? { ...state.todayLog, energy_level: level }
                : { energy_level: level, mood: '', wins: [], challenges: [] },
        })),
    updateMood: (mood) =>
        set((state) => ({
            todayLog: state.todayLog
                ? { ...state.todayLog, mood }
                : { energy_level: 3, mood, wins: [], challenges: [] },
        })),
    addWin: (win) =>
        set((state) => ({
            todayLog: state.todayLog
                ? { ...state.todayLog, wins: [...state.todayLog.wins, win] }
                : { energy_level: 3, mood: '', wins: [win], challenges: [] },
        })),
    setBlockStatus: (blockId, status) =>
        set((state) => {
            const newStatuses = new Map(state.blockStatuses);
            newStatuses.set(blockId, status);
            return { blockStatuses: newStatuses };
        }),
}));

// Global Sync Store for Event-Driven Architecture
interface SyncState {
    graphVersion: number;
    incrementGraphVersion: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
    graphVersion: 0,
    incrementGraphVersion: () => set((state) => ({ graphVersion: state.graphVersion + 1 })),
}));

