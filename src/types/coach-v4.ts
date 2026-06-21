
// AI Coach V4 — Donna: Super Intelligence Performance Coach

export type CoachMode = 'execute' | 'propose' | 'ask' | 'refuse' | 'choice' | 'refusal' | 'executed' | 'clarify' | 'acknowledge' | 'inform';

interface CalendarPatchOp {
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

export interface MutationLedger {
    ops: CalendarPatchOp[];
    reason?: string;
}

export interface ProposedOption {
    id: string;
    title: string;
    impact: string;
    ledger: MutationLedger;
    recommended?: boolean;
    description?: string;
    tradeoff?: any;
    scenario_analysis?: string;
    preview?: any;
    confidence_score?: 'high' | 'medium' | 'low';
}

export interface ProactiveSuggestion {
    id: string;
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    action: string;
    dismiss_uid?: string;
    query?: string;
}

export interface CoachResponse {
    dialogue_response: string;
    system_state_flag: 'NORMAL' | 'RECOVERY' | 'CASCADE_WARNING';
    execution_mode: 'AUTO_EXECUTE' | 'PROPOSE_OPTIONS';
    executed_ledger: MutationLedger | null;
    proposed_options: ProposedOption[] | null;
    contextual_options: string[];
    focus_node_id: string | null;
}
