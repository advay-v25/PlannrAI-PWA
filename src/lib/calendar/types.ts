import { Database } from '@/types/database';

export type ScheduleBlock = Database['public']['Tables']['schedule_blocks']['Row'];

export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}

export interface ConflictResult {
    hasConflict: boolean;
    type?: 'overlap' | 'anchor';
    message?: string;
    conflictingBlocks?: ScheduleBlock[];
    resolutions?: ResolutionOption[];
}

export interface ResolutionOption {
    id: string;
    label: string;
    description: string;
    patch: SchedulePatch;
}

export interface SchedulePatch {
    add?: Omit<ScheduleBlock, 'id' | 'user_id' | 'created_at' | 'updated_at'>[];
    update?: { block_id: string; changes: Partial<ScheduleBlock> }[];
    remove?: string[];
}
