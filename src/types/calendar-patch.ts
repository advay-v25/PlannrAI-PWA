/**
 * Calendar Patch Types (Legacy Shim)
 * This file now re-exports types from the strict Zod validation layer.
 */

import {
    PatchOp,
    PatchChange,
    CalendarPatch,
    CoachOption,
    CoachPlanResponse,
    Sacrifice,
    isImmutable as isBlockImmutable
} from '@/lib/validation/calendar-contract';

export type {
    PatchOp as PatchOpType, // Alias for backward compat if needed
    PatchChange,
    CalendarPatch,
    CoachOption,
    CoachPlanResponse,
    Sacrifice
};

export type CoachActionType = CoachOption['action_type'];

export interface ApplyPatchRequest {
    patch: CalendarPatch;
}

export interface ApplyPatchResponse {
    success: boolean;
    applied_changes: number;
    updated_blocks: Array<{
        id: string;
        date: string;
        start_time: string;
        end_time: string;
        context: string | null;
        block_type: string | null;
        status: string;
    }>;
    errors?: string[];
}

// Re-export validation logic
export { isBlockImmutable };

/**
 * Legacy validator (deprecated in favor of Zod, but kept for now)
 */
export function validatePatchChange(
    change: PatchChange,
    existingBlocks: any[]
): { valid: boolean; error?: string } {
    // Logic moved to Zod, but for API compat we'll kept this simple check
    if (change.op === 'CREATE_ANCHOR' || change.op === 'CREATE_BLOCK') return { valid: true };

    const target = existingBlocks.find(b => b.id === change.event_id);
    if (!target) return { valid: false, error: 'Block not found' };

    if (isBlockImmutable(target)) {
        return { valid: false, error: 'Target is immutable' };
    }

    return { valid: true };
}
