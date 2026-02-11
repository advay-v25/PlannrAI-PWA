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

        // 2. Conflict Check
        const currentSchedule = await this.fetchDaySchedule(userId, block.date, supabase);

        const proposal = {
            start: parseISO(`${block.date}T${block.start_time}`),
            end: parseISO(`${block.date}T${block.end_time}`),
            title: block.title || undefined,
            priority: block.priority || undefined,
            is_fixed: block.is_fixed || undefined
        };

        const verdict = ConflictService.solve(currentSchedule, proposal);

        if (verdict.status === 'requires_choice') {
            const error = new Error(`Conflict detected: ${verdict.reason}`);
            (error as any).code = 'CONFLICT_REQUIRES_CHOICE';
            (error as any).options = verdict.options;
            throw error;
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
                title: updates.title || original.title || undefined,
                priority: updates.priority || original.priority || undefined,
                is_fixed: updates.is_fixed || original.is_fixed || undefined
            };

            const verdict = ConflictService.solve(currentSchedule, proposal);

            if (verdict.status === 'requires_choice') {
                const error = new Error(`Conflict detected: ${verdict.reason}`);
                (error as any).code = 'CONFLICT_REQUIRES_CHOICE';
                (error as any).options = verdict.options;
                throw error;
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

    /**
     * Specialized Move Block (Drag & Drop wrapper for updateBlock)
     */
    static async moveBlock(userId: string, blockId: string, newDate: string, newStart: string, newEnd: string, supabase: SupabaseClient) {
        return this.updateBlock(userId, blockId, {
            date: newDate,
            start_time: newStart,
            end_time: newEnd
        }, supabase);
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
        // 1. Versioning Snapshot (Optional for MVP, but recommended)
        if (!patch.changes) return { success: false };

        const inverseChanges: any[] = [];

        for (const change of patch.changes) {
            // A. CREATE
            if (change.op === 'create_event') {
                const payload = change.payload;
                // Ensure required fields
                if (!payload.date || !payload.start_time || !payload.end_time) continue;

                const { data: newBlock, error } = await supabase.from('schedule_blocks').insert({
                    ...payload,
                    user_id: userId, // Enforce ID
                    id: undefined,   // Let DB generate ID
                    created_at: undefined,
                    updated_at: undefined
                }).select().single();

                if (newBlock) {
                    inverseChanges.unshift({
                        op: 'delete_event',
                        event_id: newBlock.id
                    });
                }
            }

            // B. UPDATE (MOVE/RESIZE)
            else if (change.op === 'update_event') {
                const blockId = change.event_id || change.id; // Support both formats
                if (!blockId) continue;

                // Fetch original state for Undo
                const { data: original } = await supabase.from('schedule_blocks').select('*').eq('id', blockId).single();

                const updates: any = {};
                // Handle various payload formats (coach vs engine)
                if (change.payload) {
                    // Engine format
                    if (change.payload.start_time) updates.start_time = change.payload.start_time;
                    if (change.payload.end_time) updates.end_time = change.payload.end_time;
                    if (change.payload.date) updates.date = change.payload.date;
                } else {
                    // Legacy Coach format?
                    if (change.new_start_ts) {
                        const s = new Date(change.new_start_ts);
                        const e = new Date(change.new_end_ts);
                        updates.start_time = s.toISOString().split('T')[1].substring(0, 5);
                        updates.end_time = e.toISOString().split('T')[1].substring(0, 5);
                        // Date might change too if moved across days?
                        updates.date = s.toISOString().split('T')[0];
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await supabase
                        .from('schedule_blocks')
                        .update(updates)
                        .eq('id', blockId)
                        .eq('user_id', userId); // Security

                    if (original) {
                        inverseChanges.unshift({
                            op: 'update_event',
                            event_id: blockId,
                            payload: {
                                start_time: original.start_time,
                                end_time: original.end_time,
                                date: original.date
                            }
                        });
                    }
                }
            }

            // C. DELETE
            else if (change.op === 'delete_event') {
                const blockId = change.event_id || change.id;
                if (!blockId) continue;

                // Fetch original for Undo
                const { data: original } = await supabase.from('schedule_blocks').select('*').eq('id', blockId).single();

                // Check lock status? Engine should have checked. 
                // DB RLS or Constraint might block deletion if anchors.
                await supabase
                    .from('schedule_blocks')
                    .delete()
                    .eq('id', blockId);

                if (original) {
                    inverseChanges.unshift({
                        op: 'create_event',
                        payload: {
                            ...original,
                            id: undefined, // Let DB generate new ID or force? forcing might fail on PK collision if not careful. Let's act like a new block.
                            created_at: undefined,
                            updated_at: undefined
                        }
                    });
                }
            }
        }

        return { success: true, undoPatch: { changes: inverseChanges } };
    }
}
