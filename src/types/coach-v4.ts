
// AI Coach V4 — Donna: Super Intelligence Performance Coach

export type CoachMode = 'execute' | 'propose' | 'ask' | 'refuse' | 'choice' | 'refusal' | 'executed';

export interface CalendarPatchOp {
    op: 'create' | 'update' | 'delete' | 'move'
    | 'create_event' | 'update_event' | 'delete_event' | 'move_event'
    | 'update_goal' | 'update_settings'
    | 'create_anchor' | 'delete_anchor'
    | 'create_todo' | 'update_todo' | 'delete_todo';
    event_id?: string;
    goal_id?: string;
    anchor_id?: string;
    todo_id?: string;
    event?: any;
    payload?: any;
    fields?: Record<string, any>;
    to_start?: string;
    to_end?: string;
    title?: string;
    start_time?: string;
    end_time?: string;
    days_of_week?: number[];
    date?: string;
}

export interface CalendarPatch {
    ops: CalendarPatchOp[];
    undoable?: boolean;
    requires_confirmation?: boolean;
    scope?: 'day' | 'week';
    reason?: string;
}


export interface CoachOption {
    id: string;
    title: string;
    description?: string;
    impact: string;
    tradeoff?: {
        warning: string;
        severity: 'info' | 'caution' | 'warning';
    };
    effort?: 'low' | 'medium' | 'high';
    time_impact_mins?: number;
    patch: CalendarPatch;
    preview?: {
        blocks_added: number;
        blocks_modified: number;
        blocks_removed: number;
        affected_dates: string[];
    };
    recommended?: boolean;
}


export interface CoachQuestion {
    prompt: string;
    type: 'text' | 'confirm' | 'choice';
    choices?: string[];
}

export interface CoachRefusal {
    reason: string;
    next_best?: string;
}

export interface ProactiveSuggestion {
    id: string;
    title: string;
    message: string;
    priority: 'high' | 'medium' | 'low';
    action_label: string;
    trigger_type?: string;
}

export interface CoachResponse {

    mode: CoachMode;
    thinking?: string[];
    summary: string;
    context_used?: string[];
    options?: CoachOption[];
    question?: CoachQuestion;
    refusal?: CoachRefusal;
    suggested_actions?: string[];
    undo_token?: string | null;
}
