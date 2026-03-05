import { ScheduleBlock, ValidationResult } from './types';
import { timeToMinutes } from './utils';

/**
 * PRD-compliant user preferences for validation.
 * In PlannrAI, these live on the `profiles` table.
 */
export interface UserConstraints {
    sleep_start: string;   // e.g. "23:00"
    sleep_end: string;     // e.g. "07:00"  (wake time)
    wind_down_mins: number; // e.g. 30
    buffer_minutes?: number;
}

/**
 * Patch operation for validation context.
 */
export interface PatchOpForValidation {
    op: 'add' | 'update' | 'delete';
    block: Partial<ScheduleBlock>;
    existingBlock?: ScheduleBlock; // populated for update/delete ops
}

/**
 * Calendar Validation Service — PRD-compliant
 *
 * Responsibilities:
 * 1. Basic field validation (title, date, time range, min duration)
 * 2. Anchor immutability enforcement
 * 3. Constraint checking (awake hours)
 * 4. Biology/sleep protection (wind-down window)
 * 5. Patch-level validation (multiple ops)
 */
export class ValidationService {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    // ── 1. Basic Block Validation ────────────────────────────────────

    validateBlock(block: Partial<ScheduleBlock>): ValidationResult {
        const errors: string[] = [];

        if (!block.title?.trim()) {
            errors.push('Block title is required');
        }

        if (!block.date) {
            errors.push('Block date is required');
        }

        if (!block.start_time) {
            errors.push('Start time is required');
        }

        if (!block.end_time) {
            errors.push('End time is required');
        }

        if (block.start_time && block.end_time) {
            const startMins = timeToMinutes(block.start_time);
            const endMins = timeToMinutes(block.end_time);

            if (startMins >= endMins) {
                errors.push('End time must be after start time');
            }

            const duration = endMins - startMins;
            if (duration < 5) {
                errors.push('Block must be at least 5 minutes long');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    // ── 2. Anchor Immutability ───────────────────────────────────────

    /**
     * Validates that anchor blocks are not illegally modified.
     * Anchors cannot be deleted or have their time changed.
     * Non-time fields (title, description) CAN be edited.
     */
    validateAnchorImmutability(
        op: 'add' | 'update' | 'delete',
        existingBlock?: ScheduleBlock,
        proposedChanges?: Partial<ScheduleBlock>
    ): ValidationResult {
        const errors: string[] = [];

        if (!existingBlock) {
            return { valid: true };
        }

        const isAnchor =
            existingBlock.block_type === 'anchor' ||
            existingBlock.is_locked ||
            !!existingBlock.commitment_id;

        if (!isAnchor) {
            return { valid: true };
        }

        if (op === 'delete') {
            errors.push(
                `Cannot delete anchor block "${existingBlock.title}". Delete the commitment instead.`
            );
        }

        if (op === 'update' && proposedChanges) {
            // Check if time is being changed
            if (
                (proposedChanges.start_time && proposedChanges.start_time !== existingBlock.start_time) ||
                (proposedChanges.end_time && proposedChanges.end_time !== existingBlock.end_time) ||
                (proposedChanges.date && proposedChanges.date !== existingBlock.date)
            ) {
                errors.push(
                    `Cannot change time of anchor block "${existingBlock.title}". Edit the commitment instead.`
                );
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    // ── 3. Constraint Checking (Awake Hours) ─────────────────────────

    /**
     * Validates that a block falls within the user's awake hours.
     * Uses sleep_end (wake time) and sleep_start (bedtime).
     */
    validateConstraints(
        block: Partial<ScheduleBlock>,
        constraints: UserConstraints
    ): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!block.start_time || !block.end_time) {
            return { valid: true };
        }

        // Skip constraint checks for sleep blocks themselves
        if (block.block_type === 'sleep' || block.source === 'sleep') {
            return { valid: true };
        }

        const blockStart = timeToMinutes(block.start_time);
        const blockEnd = timeToMinutes(block.end_time);
        const wakeTime = timeToMinutes(constraints.sleep_end);    // e.g. 07:00 → 420
        const sleepTime = timeToMinutes(constraints.sleep_start); // e.g. 23:00 → 1380

        // Check if block is before wake time
        if (blockStart < wakeTime) {
            errors.push(
                `Block starts at ${block.start_time} but wake time is ${constraints.sleep_end}`
            );
        }

        // Check if block extends past sleep time
        if (blockEnd > sleepTime) {
            errors.push(
                `Block ends at ${block.end_time} but sleep time is ${constraints.sleep_start}`
            );
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    // ── 4. Biology / Sleep Protection ────────────────────────────────

    /**
     * Validates that a block does not conflict with the wind-down period.
     * Wind-down starts `wind_down_mins` before sleep_start.
     */
    validateBiology(
        block: Partial<ScheduleBlock>,
        constraints: UserConstraints
    ): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!block.start_time || !block.end_time) {
            return { valid: true };
        }

        // Skip for sleep/wind-down blocks themselves
        if (
            block.block_type === 'sleep' ||
            block.block_type === 'wind_down' ||
            block.source === 'sleep'
        ) {
            return { valid: true };
        }

        const blockEnd = timeToMinutes(block.end_time);
        const sleepTime = timeToMinutes(constraints.sleep_start);
        const windDownStart = sleepTime - (constraints.wind_down_mins || 30);

        // Hard error: block extends into wind-down
        if (blockEnd > windDownStart) {
            errors.push(
                `Block conflicts with wind-down period (starts at ${minutesToTimeStr(windDownStart)})`
            );
        }

        // Soft warning: block ends very close to wind-down (within 15 min)
        if (blockEnd > windDownStart - 15 && blockEnd <= windDownStart) {
            warnings.push(
                `Block ends close to wind-down period — consider earlier scheduling`
            );
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    // ── 5. Full Patch Validation ─────────────────────────────────────

    /**
     * Validates an entire set of patch operations against all rules.
     * Combines basic, anchor, constraint, and biology checks.
     */
    validatePatch(
        ops: PatchOpForValidation[],
        constraints?: UserConstraints
    ): ValidationResult {
        const allErrors: string[] = [];
        const allWarnings: string[] = [];

        for (const { op, block, existingBlock } of ops) {
            // 1. Basic validation for add/update
            if (op === 'add' || op === 'update') {
                const basic = this.validateBlock(block);
                if (basic.errors) allErrors.push(...basic.errors);
            }

            // 2. Anchor immutability for update/delete
            if (op === 'update' || op === 'delete') {
                const anchor = this.validateAnchorImmutability(op, existingBlock, block);
                if (anchor.errors) allErrors.push(...anchor.errors);
            }

            // 3. Constraint checks (if user prefs available)
            if (constraints && (op === 'add' || op === 'update')) {
                const constraint = this.validateConstraints(block, constraints);
                if (constraint.errors) allErrors.push(...constraint.errors);
                if (constraint.warnings) allWarnings.push(...constraint.warnings);

                const biology = this.validateBiology(block, constraints);
                if (biology.errors) allErrors.push(...biology.errors);
                if (biology.warnings) allWarnings.push(...biology.warnings);
            }
        }

        return {
            valid: allErrors.length === 0,
            errors: allErrors.length > 0 ? allErrors : undefined,
            warnings: allWarnings.length > 0 ? allWarnings : undefined
        };
    }
}

// ── Helper ───────────────────────────────────────────────────────

function minutesToTimeStr(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
