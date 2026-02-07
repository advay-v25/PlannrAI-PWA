
import { createClient } from '@/lib/supabase/server';
import { ScheduleBlock } from '@/types/database';
import { ConflictService } from '@/lib/scheduling/conflict-service';
import { SupabaseClient } from '@supabase/supabase-js';
import { addMinutes, parseISO } from 'date-fns';

export class CalendarEngine {

    /**
     * The Single Source of Truth for Adding Blocks.
     * Enforces: Conflicts, Valid Data, Persistence.
     */
    static async addBlock(userId: string, block: Partial<ScheduleBlock>, supabase: SupabaseClient) {
        // 1. Validation
        if (!block.start_time || !block.end_time || !block.date) {
            throw new Error("Missing required fields: date, start_time, end_time");
        }

        // 2. Conflict Check (Simulate the state)
        // We need the current schedule to judge.
        const currentSchedule = await this.fetchDaySchedule(userId, block.date, supabase);

        // Construct proposal for judge
        const proposal = {
            start: parseISO(`${block.date}T${block.start_time}`),
            end: parseISO(`${block.date}T${block.end_time}`),
            type: (block.is_fixed ? 'fixed' : 'flexible') as 'fixed' | 'flexible'
        };

        const verdict = ConflictService.judgeChange(currentSchedule, proposal);

        if (verdict.status === 'rejected') {
            throw new Error(`Conflict: ${verdict.reason}`);
        }

        if (verdict.status === 'requires_choice') {
            // For V5 Manual Add, we might auto-reject or require UI to handle.
            // For now, strict mode -> reject.
            throw new Error(`Not enough space. ${verdict.reason}`);
        }

        // 3. Auto-Resolution Application (if items moved)
        if (verdict.status === 'resolved' && verdict.resolved_patch) {
            await this.applyPatch(userId, verdict.resolved_patch, supabase);
        }

        // 4. Persist the New Block
        const { data, error } = await supabase
            .from('schedule_blocks')
            .insert({
                user_id: userId,
                date: block.date,
                start_time: block.start_time,
                end_time: block.end_time,
                title: block.title || block.context || 'Untitled',
                block_type: block.block_type || 'adhoc',
                is_fixed: block.is_fixed || false,
                status: 'planned'
            })
            .select()
            .single();

        if (error) throw error;

        // Post-MVP: Trigger Load Analysis (Fire-and-forget)
        import('@/lib/intelligence/analysis-service').then(({ AnalysisService }) => {
            AnalysisService.computeDailyLoad(userId, block.date!, supabase).catch(console.error);
        });

        return data;
    }

    /**
     * The Single Source of Truth for Updates (Move/Resize).
     */
    static async updateBlock(userId: string, blockId: string, updates: Partial<ScheduleBlock>, supabase: SupabaseClient) {
        // 1. Fetch Original
        const { data: original } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('id', blockId)
            .single();

        if (!original) throw new Error("Block not found");
        if (original.commitment_id && (updates.start_time !== original.start_time || updates.end_time !== original.end_time)) {
            // V5: Anchors are locked!
            throw new Error("Cannot move a locked Anchor. Edit the Commitment instead.");
        }

        // 2. Conflict Check (if moving)
        if (updates.start_time || updates.end_time || updates.date) {
            const targetDate = updates.date || original.date;
            const targetStart = updates.start_time || original.start_time;
            const targetEnd = updates.end_time || original.end_time;

            const currentSchedule = await this.fetchDaySchedule(userId, targetDate, supabase);

            const proposal = {
                id: blockId, // Pass ID so we ignore self-collision
                start: parseISO(`${targetDate}T${targetStart}`),
                end: parseISO(`${targetDate}T${targetEnd}`),
                type: (original.is_fixed ? 'fixed' : 'flexible') as 'fixed' | 'flexible'
            };

            const verdict = ConflictService.judgeChange(currentSchedule, proposal);

            if (verdict.status === 'rejected') throw new Error(verdict.reason);
            if (verdict.status === 'requires_choice') throw new Error(verdict.reason);

            if (verdict.status === 'resolved' && verdict.resolved_patch) {
                await this.applyPatch(userId, verdict.resolved_patch, supabase);
            }
        }

        // 3. Persist
        const { data, error } = await supabase
            .from('schedule_blocks')
            .update(updates)
            .eq('id', blockId)
            .select()
            .single();

        if (error) throw error;

        // Post-MVP: Trigger Load Analysis
        const targetDate = updates.date || original.date;
        import('@/lib/intelligence/analysis-service').then(({ AnalysisService }) => {
            AnalysisService.computeDailyLoad(userId, targetDate, supabase).catch(console.error);
        });

        return data;
    }

    static async deleteBlock(userId: string, blockId: string, supabase: SupabaseClient) {
        const { data: original } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('id', blockId)
            .single();

        if (original?.commitment_id) {
            throw new Error("Cannot delete a locked Anchor. Edit the Commitment.");
        }

        await supabase.from('schedule_blocks').delete().eq('id', blockId);
    }

    // --- Internal Schema Helpers ---

    private static async fetchDaySchedule(userId: string, date: string, supabase: SupabaseClient) {
        const { data } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date);
        return data || [];
    }

    // --- Patch Application (Shared with Coach) ---
    static async applyPatch(userId: string, patch: any, supabase: SupabaseClient) {
        // This reuses the CoachActionService logic essentially, but purely.
        // For MVP V5, we can just execute the moves from the resolution.
        if (patch.changes) {
            for (const change of patch.changes) {
                if (change.op === 'MOVE') {
                    // Convert TS to HH:MM
                    const s = new Date(change.new_start_ts);
                    const e = new Date(change.new_end_ts);
                    const start_time = s.toISOString().split('T')[1].substring(0, 5);
                    const end_time = e.toISOString().split('T')[1].substring(0, 5);

                    await supabase
                        .from('schedule_blocks')
                        .update({ start_time, end_time })
                        .eq('id', change.event_id);
                }
            }
        }
    }
}
