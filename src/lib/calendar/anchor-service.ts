import { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format, parseISO, startOfDay, isSameDay, getDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export class AnchorService {
    /**
     * Materialize an anchor (commitment) into schedule_blocks for a given date range.
     * Use this when creating an anchor or when the week is generated.
     */
    static async materialize(
        userId: string,
        commitment: any,
        startDate: Date,
        endDate: Date,
        supabase: SupabaseClient
    ) {
        // 1. Identify valid dates in range matching days_of_week
        const validDates: Date[] = [];
        let curr = startOfDay(startDate);
        const end = startOfDay(endDate);

        while (curr <= end) {
            // Monday = 1 ... Sunday = 0 in JS getDay()
            // In PlannrAI, let's assume standard JS getDay() 0=Sun, 1=Mon
            // Check if commitment.days_of_week includes this day
            // commitment.days_of_week is typically [1, 3, 5] for Mon,Wed,Fri
            const day = getDay(curr);
            if (commitment.days_of_week.includes(day)) {
                validDates.push(new Date(curr));
            }
            curr = addDays(curr, 1);
        }

        if (validDates.length === 0) return;

        // 2. Prepare blocks to simple insert
        const blocks = validDates.map(date => ({
            user_id: userId,
            date: format(date, 'yyyy-MM-dd'),
            start_time: commitment.start_time,
            end_time: commitment.end_time,
            title: commitment.title,
            block_type: 'anchor',
            status: 'planned',
            is_fixed: true,
            is_locked: true,
            commitment_id: commitment.id,
            source: 'anchor',
            meta: { original_anchor_title: commitment.title }
        }));

        // 3. Delete existing blocks for this commitment in this range (idempotency)
        // This prevents duplicates if we re-materialize.
        const minDate = format(startDate, 'yyyy-MM-dd');
        const maxDate = format(endDate, 'yyyy-MM-dd');

        await supabase
            .from('schedule_blocks')
            .delete()
            .eq('user_id', userId)
            .eq('commitment_id', commitment.id)
            .gte('date', minDate)
            .lte('date', maxDate);

        // 4. Insert new blocks
        const { error } = await supabase
            .from('schedule_blocks')
            .insert(blocks);

        if (error) {
            console.error("AnchorService.materialize error", error);
            throw error;
        }
    }

    /**
     * Expand anchors for a given range without inserting them into DB.
     * Useful for looking ahead or planning without side effects.
     */
    static async expandAnchors(
        userId: string,
        startDate: Date,
        days: number,
        commitments: any[]
    ) {
        const expanded: any[] = [];
        const start = startOfDay(startDate);
        const end = addDays(start, days);

        for (const comm of commitments) {
            let curr = new Date(start);
            while (curr < end) {
                const day = getDay(curr);
                if (comm.days_of_week && comm.days_of_week.includes(day)) {
                    expanded.push({
                        user_id: userId,
                        date: format(curr, 'yyyy-MM-dd'),
                        start_time: comm.start_time,
                        end_time: comm.end_time,
                        title: comm.title,
                        block_type: 'anchor',
                        status: 'planned',
                        is_fixed: true,
                        is_locked: true,
                        commitment_id: comm.id,
                        source: 'anchor',
                        meta: { original_anchor_title: comm.title }
                    });
                }
                curr = addDays(curr, 1);
            }
        }
        return expanded;
    }
}
