
import { createClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { resolveOverlaps, ScheduleItem } from '@/lib/scheduling/solver';
import { ScheduleBlock } from '@/types/database';
import { CalendarEngine } from '@/lib/calendar/calendar-engine';
import { parseISO, startOfDay } from 'date-fns';

export class OptimizationService {

    /**
     * Optimizes the schedule for a specific day or entire week.
     * Focus: Reduce fragmentation, ensure gaps, respect anchors.
     */
    static async optimizeWeek(userId: string, weekStart: string, supabase: SupabaseClient) {
        // For MVP V5, we stick to Day-by-Day optimization to be safe.
        // We iterate through the week.
        const start = new Date(weekStart);
        const results = [];

        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            try {
                const res = await this.optimizeDay(userId, dateStr, supabase);
                results.push({ date: dateStr, status: res.status });
            } catch (e) {
                console.error(`Optimization failed for ${dateStr}`, e);
                results.push({ date: dateStr, status: 'failed' });
            }
        }
        return results;
    }

    static async optimizeDay(userId: string, date: string, supabase: SupabaseClient) {

        // 0. Context Intelligence
        const { ContextEngine } = await import('@/lib/intelligence/context-engine');
        const context = await ContextEngine.build(userId, date, supabase);

        console.log(`[Optimization] Optimizing ${date} in ${context.computedMode} mode. Buffer: ${context.suggestedBufferMins}m`);

        // 1. Fetch Blocks
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date);

        if (!blocks || blocks.length === 0) return { status: 'empty' };

        // 2. Convert to Solver Items
        const items: ScheduleItem[] = blocks.map(b => ({
            id: b.id,
            start: parseISO(`${b.date}T${b.start_time}`),
            end: parseISO(`${b.date}T${b.end_time}`),
            type: (b.is_fixed || b.block_type === 'anchor' || b.block_type === 'routine' || b.status === 'done' || b.block_type === 'flex')
                ? 'fixed'
                : 'flexible'
        }));

        // 3. Run Solver with Context Params
        // We pass the context buffer as a "padding" requirement to the solver?
        // Current Solver doesn't support padding param yet. 
        // We can simulate it by expanding block duration during solve, or checking gaps.

        // For now, simpler: Use density limit to DROP low priority blocks if needed.
        const totalDuration = items.reduce((sum, i) => sum + (i.end.getTime() - i.start.getTime()) / (1000 * 60), 0);
        const dayLength = 16 * 60; // Approx 16h awake
        const currentDensity = totalDuration / dayLength;

        if (currentDensity > context.densityLimit && context.computedMode === 'survival') {
            // DANGER: We are over capacity.
            // Strategy: Unschedule flexible blocks until we fit?
            // "Soft Rescheduling" -> push to tomorrow?
            return { status: 'overloaded', message: "Density limit exceeded, suggest moving tasks." };
        }

        // Proceed with standard optimize (resolve overlaps)
        // Current solver only resolves overlaps. We might need a "Compactor" logic.
        // For V5, simply ensuring no overlaps and basic flow is "optimization" enough 
        // if the solver pushes things to next available slots (clustering).

        // We treat the *flexible* items as "Proposed" to be re-inserted?
        // Actually, `resolveOverlaps` takes a list and a "new item".
        // Use `rebuildSchedule` pattern if we had one.
        // Let's use `resolveOverlaps` iteratively or a custom logic here.

        // Simplified Logic:
        // - Specific Fixed items are anchors.
        // - Flexible items are goals.
        // - Remove all flexible items from the board.
        // - Re-insert them one by one using `findNextAvailableSlot` (from solver).
        // - This effectively clusters them and removes gaps if we search from start of day.

        const fixed = items.filter(i => i.type === 'fixed');
        const flexible = items.filter(i => i.type === 'flexible');

        // Sort flexible by "Priority" or just original time?
        // Let's keep original time order to minimize disruption.
        flexible.sort((a, b) => a.start.getTime() - b.start.getTime());

        const { findNextAvailableSlot } = await import('@/lib/scheduling/solver');
        const resolvedMap = new Map<string, { start: Date, end: Date }>();

        // Simulation board
        const placedItems = [...fixed];

        // Sort fixed items
        placedItems.sort((a, b) => a.start.getTime() - b.start.getTime());

        let movedCount = 0;

        for (const flex of flexible) {
            const duration = (flex.end.getTime() - flex.start.getTime()) / (1000 * 60);

            // Search for slot starting from Work Start (e.g. 8am) or just finding free space?
            // To "Optimize", we want to maybe preserve approximate time but fix overlaps.
            // But checking overlaps is easy. Compacting is harder.
            // Let's try to fit it as close to original time as possible, but strictly avoiding overlaps.

            const slot = findNextAvailableSlot(
                placedItems,
                duration,
                flex.start, // Reference: original start time
                { workStartHour: 6, workEndHour: 23 }
            );

            if (slot) {
                // Check if it moved
                if (slot.start.getTime() !== flex.start.getTime()) {
                    movedCount++;
                    resolvedMap.set(flex.id as string, slot);
                }

                placedItems.push({
                    id: flex.id,
                    start: slot.start,
                    end: slot.end,
                    type: 'flexible'
                });
                placedItems.sort((a, b) => a.start.getTime() - b.start.getTime());
            } else {
                console.warn(`Could not fit block ${flex.id}`);
            }
        }

        if (movedCount === 0) return { status: 'no_change' };

        // 4. Apply Updates via Engine
        // (Batch update ideally, but loop for now)
        for (const [id, slot] of resolvedMap.entries()) {
            const start_time = slot.start.toISOString().split('T')[1].substring(0, 5);
            const end_time = slot.end.toISOString().split('T')[1].substring(0, 5);

            // Direct update to avoid conflict check overhead for "Optimization" which IS the conflict check
            await supabase
                .from('schedule_blocks')
                .update({ start_time, end_time })
                .eq('id', id);
        }

        return { status: 'optimized', moves: movedCount };
    }
}
