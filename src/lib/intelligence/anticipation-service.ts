import { createClient } from '@/lib/supabase/server';
import { addDays, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { StateService } from '@/lib/user-state/state-service';

export interface AnticipationSignal {
    type: 'overload' | 'unrealistic' | 'slippage' | 'clear';
    message: string | null;
    severity: 'info' | 'warn' | 'none';
}

export class AnticipationService {
    static async analyzeTomorrow(userId: string): Promise<AnticipationSignal> {
        const supabase = await createClient();
        const tomorrow = addDays(new Date(), 1);
        const start = startOfDay(tomorrow);
        const end = endOfDay(tomorrow);

        // 1. Fetch Tomorrow's Schedule
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('start_time', start.toISOString())
            .lte('end_time', end.toISOString());

        if (!blocks || blocks.length === 0) {
            return { type: 'clear', message: null, severity: 'none' };
        }

        // 2. Calculate Load
        // Assume active day is ~16 hours (960 mins) or use user preferences if available
        // For now, use a safe default or get from StateEngine constraints? 
        // Let's use StateEngine constraints for "Maintenance" mode as a baseline capacity.
        const userState = await StateService.getState(userId, supabase);
        // Note: constraint getter is static logic, doesn't need DB.
        // But we import the Class to get static method. 
        // Actually, let's hardcode a standard capacity for "Anticipation" to keep it independent of today's state
        // because we are looking at *tomorrow*. Use 10 hours (600m) of work as "Heavy".

        const totalDuration = blocks.reduce((acc, b) => {
            const duration = differenceInMinutes(new Date(b.end_time), new Date(b.start_time));
            return acc + duration;
        }, 0);

        const WORK_CAPACITY_MINS = 540; // 9 hours

        // 3. Check Overload
        if (totalDuration > WORK_CAPACITY_MINS) {
            return {
                type: 'overload',
                message: "Tomorrow looks tighter than usual.",
                severity: 'info' // "warn" might be too loud
            };
        }

        // 4. Check Conflicts (Unrealistic)
        // Simple overlap check? Validator does this. 
        // Let's look for "Double Bookings" flag if we had it.
        // Or just high density of "fixed" blocks.
        const fixedBlocks = blocks.filter(b => b.is_fixed);
        if (fixedBlocks.length > 5) {
            return {
                type: 'unrealistic',
                message: "Tomorrow has a lot of fixed commitments.",
                severity: 'info'
            };
        }

        return { type: 'clear', message: null, severity: 'none' };
    }
}
