// Database entity types matching Supabase schema

export interface Profile {
    id: string;
    created_at: string;
    updated_at: string;
    timezone: string;
    sleep_start: string; // TIME format: "HH:MM"
    sleep_end: string;
    energy_level: number; // 1-5
    stress_level: number; // 1-5
    ai_can_suggest: boolean;
    ai_can_analyze: boolean;
    ai_can_draft: boolean;
    onboarding_complete: boolean;
    low_energy_mode: boolean;
    full_name?: string;
    preferred_name?: string;
}

export type GoalCategory = 'mind' | 'body' | 'future';
export type GoalImportance = 'low' | 'medium' | 'high';

export interface Goal {
    id: string;
    user_id: string;
    created_at: string;
    updated_at: string;
    title: string;
    category: GoalCategory;
    minutes_per_day: number;
    importance: GoalImportance;
    is_paused: boolean;
    // V2 fields - subtasks and AI
    parent_id?: string | null;
    constraints?: Record<string, unknown>;
    non_negotiables?: string[];
    time_commitment_mins?: number;
    ai_plan?: GoalAIPlan; // structured decomposition
    milestone_progress?: number;
    sort_order?: number;
    notes?: string; // User-provided context for AI
    description?: string; // Longer description
}

export interface GoalAIPlan {
    phases: Array<{
        week: number;
        focus: string;
        milestone: string;
    }>;
    daily_routine: {
        name: string;
        total_mins: number;
        blocks: Array<{
            type: 'warmup' | 'core' | 'fun' | 'review';
            name: string;
            duration_mins: number;
            tips: string;
        }>;
    };
    subtasks: string[]; // One-off setup tasks
    advice: string;
}

export interface Commitment {
    id: string;
    user_id: string;
    title: string;
    day_of_week: number[]; // 0=Sun, 6=Sat
    start_time: string;
    end_time: string;
}

export type BlockStatus = 'planned' | 'done' | 'partial' | 'missed';

export interface ScheduleBlock {
    id: string;
    user_id: string;
    goal_id: string | null;
    date: string; // DATE format: "YYYY-MM-DD"
    start_time: string;
    end_time: string;
    status: BlockStatus;
    context: string | null;
    created_at: string;
    // Joined data
    goal?: Goal;
}

export interface BrainDump {
    id: string;
    user_id: string;
    created_at: string;
    content: string;
    extracted_signals: ExtractedSignal[];
    detected_constraints: DetectedConstraint[];
    ai_sentiment?: string;
    processed_data?: any; // strict type: BrainDumpProcessedData
}

export interface ExtractedSignal {
    type: 'stress' | 'priority' | 'emotion' | 'blocker';
    content: string;
    intensity: number; // 1-5
}

export interface DetectedConstraint {
    type: 'time' | 'energy' | 'dependency' | 'external';
    content: string;
}

export interface HiddenGoal {
    content: string;
}

export interface CoachResponse {
    facts: string;
    interpretation: string;
    options: string[];
    permission_check: string;
}

export interface CoachInteraction {
    id: string;
    user_id: string;
    created_at: string;
    user_message: string | null;
    coach_response: CoachResponse | null;
    user_action: string | null;
}

export type TrendDirection = 'improving' | 'stable' | 'declining' | 'increasing';
export type ReviewResponse = 'accepted' | 'edited' | 'ignored';

export interface WeeklyReview {
    id: string;
    user_id: string;
    week_start: string;
    week_end: string;
    planned_minutes: number;
    actual_minutes: number;
    energy_trend: TrendDirection;
    stress_trend: TrendDirection;
    friction_patterns: string[];
    suggested_adjustment: string;
    user_response: ReviewResponse | null;
    created_at: string;
}

// Onboarding types
export interface OnboardingData {
    timezone: string;
    sleep_start: string;
    sleep_end: string;
    commitments: Omit<Commitment, 'id' | 'user_id'>[];
    goals: Omit<Goal, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'is_paused'>[];
    energy_level: number;
    stress_level: number;
    ai_can_suggest: boolean;
    ai_can_analyze: boolean;
    ai_can_draft: boolean;
    full_name: string;
}

// UI types
export interface DailyOverview {
    date: string;
    primaryFocus: ScheduleBlock | null;
    secondaryOptions: ScheduleBlock[];
    plannedMinutes: number;
    completedMinutes: number;
}

// Master Meta Prompt Types
export interface AIProposal {
    id: string; // generated UUID
    type: 'calendar' | 'goal' | 'habit' | 'project';
    action: 'add' | 'modify' | 'delete' | 'reschedule';
    data: Record<string, any>; // The proposed change payload
    reasoning: string;
    confidence: number; // 0.0 to 1.0
    status: 'pending' | 'accepted' | 'rejected' | 'ignored';
    generated_at: string;
}

export interface BrainDumpProcessedData {
    captures: Array<{
        text: string;
        type: 'task' | 'note' | 'idea';
        estimated_mins?: number;
        urgency?: 'high' | 'medium' | 'low';
    }>;
    deviations: Array<{
        type: 'schedule' | 'energy' | 'constraint';
        description: string;
        detected_at: string;
    }>;
    proposals: AIProposal[];
    state_signals: {
        energy: number; // 1-5
        stress: number; // 1-5
        mood?: string;
    };
    impact_summary: string;
}

export interface UserContext {
    id: string;
    user_id: string;
    type: 'fact' | 'preference' | 'pattern' | 'constraint';
    content: string;
    source?: string;
    confidence: number;
    created_at: string;
    last_used_at: string;
}

export interface InterventionLog {
    id: string;
    user_id: string;
    type: 'stagnation' | 'burnout' | 'disengagement' | 'win_streak';
    message: string;
    status: 'pending' | 'dismissed' | 'accepted';
    created_at: string;
    action_taken_at?: string;
}
