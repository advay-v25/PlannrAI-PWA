import { ScheduleBlock, ValidationResult } from './types';
import { timeToMinutes } from './utils';

export class ValidationService {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

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
}
