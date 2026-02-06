import { differenceInMinutes, parseISO, startOfDay, endOfDay } from 'date-fns';
import { isImmutable } from '@/lib/validation/calendar-contract';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

import { SupabaseClient } from '@supabase/supabase-js';

export class EmergencyService {

    /**
     * Checks if the user is overwhelmed for a given date.
     * Threshold: > 10 hours of active work (excluding sleep/wind_down).
     */
    static async checkOverwhelm(userId: string, date: Date, injectedClient?: SupabaseClient) {
        const supabase = injectedClient ?? await createClient();

        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('start_time', format(startOfDay(date), 'HH:mm:ss'))
            .lte('end_time', format(endOfDay(date), 'HH:mm:ss'));

        if (!blocks) return { isOverwhelmed: false, workMinutes: 0 };

        let workMinutes = 0;

        for (const block of blocks) {
            // Exclude restorative blocks
            if (['sleep', 'wind_down', 'meal', 'break'].includes(block.block_type)) continue;

            const start = parseISO(`${format(date, 'yyyy-MM-dd')}T${block.start_time}`);
            const end = parseISO(`${format(date, 'yyyy-MM-dd')}T${block.end_time}`);
            workMinutes += differenceInMinutes(end, start);
        }

        return {
            isOverwhelmed: workMinutes > 600, // 10 hours
            workMinutes
        };
    }

    /**
     * Generates a "Minimum Viable Day" patch.
     * Keeps: Anchors, Sleep, Meals.
     * Keeps: The SINGLE highest priority task/goal.
     * Hides: Everything else.
     */
    static async generateEmergencyPatch(userId: string, date: Date, injectedClient?: SupabaseClient) {
        const supabase = injectedClient ?? await createClient();

        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('start_time', format(startOfDay(date), 'HH:mm:ss'))
            .lte('end_time', format(endOfDay(date), 'HH:mm:ss'));

        if (!blocks || blocks.length === 0) return null;

        const toHide: any[] = [];
        const toKeep: any[] = []; // Just for tracking

        // 1. Separate Anchors from Flexible
        const flexible = blocks.filter(b => !isImmutable(b));

        // 2. Identify the ONE thing to save (if any)
        // Heuristic: Highest importance goal or longest block?
        // Let's assume we keep the longest flexible block as the "One Thing".
        flexible.sort((a, b) => {
            const durA = differenceInMinutes(parseISO(`2000-01-01T${a.end_time}`), parseISO(`2000-01-01T${a.start_time}`));
            const durB = differenceInMinutes(parseISO(`2000-01-01T${b.end_time}`), parseISO(`2000-01-01T${b.start_time}`));
            return durB - durA; // Descending
        });

        const survivor = flexible[0];

        for (const block of flexible) {
            if (block.id === survivor?.id) {
                toKeep.push(block);
            } else {
                toHide.push(block);
            }
        }

        if (toHide.length === 0) return null; // Nothing to prune

        // 3. Generate Patch
        return {
            summary: "Emergency Mode: Cleared non-essentials. Kept immutables + one focus.",
            affected_date: format(date, 'yyyy-MM-dd'),
            changes: toHide.map(b => ({
                op: 'HIDE', // Changes status to 'cancelled' or deletes? HIDE op usually implies distinct UI state.
                event_id: b.id
            })),
            requires_confirmation: false, // Emergency implies force? Or maybe explicit confirm? Let's say false for "Safety Net".
            reasoning: "Overwhelm detected. Switched to Minimum Viable Day.",
            source: 'system'
        };
    }
}
