import { createClient } from '@/lib/supabase/server';
import { ScheduleBlock } from '@/types/database';
import { ConflictService } from '@/lib/scheduling/conflict-service';
import { SupabaseClient } from '@supabase/supabase-js';
import { addMinutes, parseISO, format, startOfDay } from 'date-fns';

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

    private static parseOpTime(op: any): { start: Date, end: Date, date: string } | null {
        if (!op) return null;
        const payload = op.payload || op;
        const date = payload.date || op.date;
        const start_time = payload.start_time || payload.start || op.to_start;
        const end_time = payload.end_time || payload.end || op.to_end;

        if (!date || !start_time || !end_time) return null;

        try {
            return {
                date,
                start: parseISO(`${date}T${start_time}`),
                end: parseISO(`${date}T${end_time}`)
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Validates a patch by simulating its application in memory against the DB schedule.
     * Throws an error if any operation results in a deterministic constraint violation (e.g. moving an anchor)
     * or causes an overlap.
     */
    static async validatePatch(userId: string, patch: any, supabase: SupabaseClient): Promise<{ valid: boolean, errors: string[] }> {
        const errors: string[] = [];
        if (!patch?.ops || !Array.isArray(patch.ops)) return { valid: true, errors: [] };

        // 1. Gather all affected dates
        const dateSet = new Set<string>();
        for (const op of patch.ops) {
            const time = this.parseOpTime(op);
            if (time) dateSet.add(time.date);

            // For updates/moves/deletes, we also need to check the original block's date
            if (op.event_id && (op.op === 'update_event' || op.op === 'move_event' || op.op === 'delete_event' || op.op === 'update' || op.op === 'move' || op.op === 'delete')) {
                const { data: orig } = await supabase.from('schedule_blocks').select('date').eq('id', op.event_id).single();
                if (orig?.date) dateSet.add(orig.date);
            }
        }

        if (dateSet.size === 0) return { valid: true, errors: [] };

        // 2. Fetch all relevant blocks for those dates
        const existingBlocks: ScheduleBlock[] = [];
        for (const date of dateSet) {
            const blocks = await this.fetchDaySchedule(userId, date, supabase);
            existingBlocks.push(...blocks);
        }

        // 3. Simulate Operations In-Memory
        let simulatedSchedule = [...existingBlocks];

        for (const op of patch.ops) {
            const opType = op.op;

            if (opType === 'create_event' || opType === 'create') {
                const event = op.event || op.payload || {};
                const time = this.parseOpTime(op);
                if (!time) {
                    errors.push(`Create op missing time constraints.`);
                    continue;
                }
                simulatedSchedule.push({
                    id: `sim_${Math.random()}`,
                    ...event,
                    date: time.date,
                    start_time: format(time.start, 'HH:mm'),
                    end_time: format(time.end, 'HH:mm'),
                    user_id: userId
                } as unknown as ScheduleBlock);

            } else if (opType === 'update_event' || opType === 'move_event' || opType === 'update' || opType === 'move') {
                const blockIndex = simulatedSchedule.findIndex(b => b.id === op.event_id);
                if (blockIndex === -1) {
                    errors.push(`Block ${op.event_id} not found for update.`);
                    continue;
                }
                const orig = simulatedSchedule[blockIndex];

                // Enforce deterministic rules: anchors cannot CHANGE their time
                const updates = op.fields || op.payload || {};
                let newStart = orig.start_time;
                let newEnd = orig.end_time;
                let newDate = orig.date;

                if (op.to_start) newStart = op.to_start;
                if (op.to_end) newEnd = op.to_end;
                if (op.date) newDate = op.date;

                if (updates.start_time) newStart = updates.start_time;
                if (updates.end_time) newEnd = updates.end_time;
                if (updates.date) newDate = updates.date;

                const isTimeChanged = newStart !== orig.start_time || newEnd !== orig.end_time || newDate !== orig.date;
                if ((orig.is_fixed || orig.commitment_id) && (opType.includes('move') || isTimeChanged)) {
                    errors.push(`Cannot move locked anchor block: ${orig.title}`);
                    continue;
                }

                simulatedSchedule[blockIndex] = {
                    ...orig,
                    ...updates,
                    date: newDate,
                    start_time: newStart,
                    end_time: newEnd
                };

            } else if (opType === 'delete_event' || opType === 'delete') {
                const block = simulatedSchedule.find(b => b.id === op.event_id);
                if (block && (block.is_fixed || block.commitment_id)) {
                    errors.push(`Cannot delete locked anchor block: ${block.title}`);
                    continue;
                }
                simulatedSchedule = simulatedSchedule.filter(b => b.id !== op.event_id);
            }
        }

        if (errors.length > 0) return { valid: false, errors };

        // 4. Verify no overlaps after simulation
        // Group by day to check efficiently
        const groupedByDay: Record<string, ScheduleBlock[]> = {};
        for (const b of simulatedSchedule) {
            if (!groupedByDay[b.date]) groupedByDay[b.date] = [];
            groupedByDay[b.date].push(b);
        }

        for (const [date, blocks] of Object.entries(groupedByDay)) {
            // Sort by start time
            const sorted = blocks.sort((a, b) => {
                const sA = parseISO(`${a.date}T${a.start_time}`).getTime();
                const sB = parseISO(`${b.date}T${b.start_time}`).getTime();
                return sA - sB;
            });

            for (let i = 0; i < sorted.length - 1; i++) {
                const b1 = sorted[i];
                const b2 = sorted[i + 1];

                const b1End = parseISO(`${b1.date}T${b1.end_time}`).getTime();
                const b2Start = parseISO(`${b2.date}T${b2.start_time}`).getTime();

                if (b1End > b2Start) {
                    errors.push(`Overlap detected on ${date} between "${b1.title}" (${b1.start_time}-${b1.end_time}) and "${b2.title}" (${b2.start_time}-${b2.end_time}).`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
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
                    if (change.payload.status) updates.status = change.payload.status;
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

    // --- Proactive Inbox (Staging Area) ---

    static async addInboxItem(userId: string, title: string, estimatedMinutes: number = 30, supabase: SupabaseClient) {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('schedule_blocks')
            .insert({
                user_id: userId,
                title,
                date: today,
                start_time: '00:00', // Pseudo-time for Inbox items
                end_time: '00:00',
                status: 'inbox',
                block_type: 'task',
                meta: { estimated_minutes: estimatedMinutes }
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async fetchInbox(userId: string, supabase: SupabaseClient) {
        const { data } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'inbox')
            .order('created_at', { ascending: false });
        return data || [];
    }

    static async autoPlace(userId: string, blockId: string, durationMinutes: number, targetDate: string, supabase: SupabaseClient) {
        const { data: original } = await supabase.from('schedule_blocks').select('*').eq('id', blockId).single();
        if (!original) throw new Error("Inbox item not found");

        const currentSchedule = await this.fetchDaySchedule(userId, targetDate, supabase);
        // Exclude inbox items from whitespace calculation
        const actualSchedule = currentSchedule.filter(b => b.status !== 'inbox');

        const now = new Date();
        const startSearch = targetDate === now.toISOString().split('T')[0] ? new Date() : startOfDay(parseISO(targetDate));

        const proposal = { start: startSearch, end: addMinutes(startSearch, durationMinutes) };
        const gap = ConflictService.findNextGap(proposal, actualSchedule);

        if (!gap) {
            throw new Error(`Could not find a ${durationMinutes}m gap on ${targetDate}.`);
        }

        const updates = {
            date: targetDate,
            start_time: format(gap.start, 'HH:mm'),
            end_time: format(gap.end, 'HH:mm'),
            status: 'planned'
        };

        const { data, error } = await supabase
            .from('schedule_blocks')
            .update(updates)
            .eq('id', blockId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
