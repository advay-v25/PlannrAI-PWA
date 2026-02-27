import type { Database, Json } from './database';

export type GoalRow = Database['public']['Tables']['goals']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ScheduleBlockRow = Database['public']['Tables']['schedule_blocks']['Row'];

// --- V1 Extended Types ---

export interface V1Goal extends GoalRow {
    weekly_target_minutes: number;
    cycle_start_date: string;
    cycle_end_date: string;
    level: number;
    current_streak_days: number;
    longest_streak_days: number;
    total_completed_minutes: number;
}

export interface V1Profile extends ProfileRow {
    peak_windows: string[];
    low_windows: string[];
    work_style: 'sprinter' | 'marathoner';
}

export interface V1ScheduleBlock extends ScheduleBlockRow {
    energy_level_required: number | null;
    original_start_time: string | null;
    original_date: string | null;
    deviation_reason: string | null;
}

// --- New V1 Tables ---

export interface EnergyCheckin {
    id: string;
    user_id: string;
    level: 'great' | 'good' | 'okay' | 'low';
    checked_at: string;
    day_date: string;
    time_of_day: 'morning' | 'afternoon' | 'evening';
    schedule_adjusted: boolean;
    adjustment_summary: string | null;
    created_at: string;
}

export interface AIInsight {
    id: string;
    user_id: string;
    category: string;
    priority: number;
    title: string;
    message: string;
    actions: Json;
    created_at: string;
    expires_at: string;
    dismissed_at: string | null;
    acted_on_at: string | null;
    action_taken: string | null;
    context_data: Json | null;
}

export interface BlockCompletion {
    id: string;
    user_id: string;
    block_id: string;
    action: 'completed' | 'skipped' | 'partial';
    scheduled_start: string;
    scheduled_end: string;
    actual_start: string | null;
    actual_end: string | null;
    energy_level: string | null;
    skip_reason: string | null;
    notes: string | null;
    deviation_minutes: number | null;
    on_time: boolean | null;
    created_at: string;
}
