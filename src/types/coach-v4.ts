
// AI Coach V4 - Chief of Staff Types

export type CoachMode = 'executed' | 'choice' | 'refusal';

export interface CalendarPatchOp {
    op: 'create' | 'update' | 'delete' | 'move';
    event_id?: string; // Required for update/delete/move
    event?: any; // Required for create (Partial<ScheduleBlock>)
    fields?: Record<string, any>; // Required for update
    to_start?: string; // Required for move (ISO)
    to_end?: string; // Required for move (ISO)
}

export interface CalendarPatch {
    ops: CalendarPatchOp[];
    scope: 'day' | 'week';
    reason: string;
}

export interface CoachOption {
    id: string; // "opt_1"
    title: string; // Max 40 chars
    impact: string; // Max 60 chars ("Moves Gym to 6pm")
    patch: CalendarPatch;
}

export interface CoachRefusal {
    reason: string;
    question?: string | null;
}

export interface CoachResponse {
    mode: CoachMode;
    summary: string; // Max 140 chars
    options?: CoachOption[]; // Present if mode='choice'
    refusal?: CoachRefusal; // Present if mode='refusal'
    undo_token?: string | null; // Present if mode='executed'
    // Legacy support for UI transition
    formatted?: string;
}
