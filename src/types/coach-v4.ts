
// AI Coach V4 — Donna: Super Intelligence Performance Coach

export type CoachMode = 'execute' | 'propose' | 'ask' | 'refuse';

export interface CalendarPatchOp {
    op: 'create' | 'update' | 'delete' | 'move'
    | 'create_event' | 'update_event' | 'delete_event' | 'move_event'
    | 'update_goal' | 'update_settings'
    | 'create_anchor' | 'delete_anchor';
    event_id?: string;
    goal_id?: string;
    anchor_id?: string;
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
    scope?: 'day' | 'week';
    reason?: string;
}

export interface CoachOption {
    id: string;
    title: string;
    impact: string;
    effort?: 'low' | 'medium' | 'high';
    time_impact_mins?: number;
    patch: CalendarPatch;
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
