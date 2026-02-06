import { createClient } from '@/lib/supabase/server';
import { PatchRun } from '@/types/database';

export class PatchService {
    /**
     * Log a patch run (reversible action)
     */
    static async logRun(userId: string, data: {
        patch: any;
        inverse_patch: any;
        source: 'coach' | 'calendar' | 'brain_dump' | 'system';
        applied?: boolean;
    }) {
        const supabase = await createClient();

        const { data: run, error } = await supabase
            .from('patch_runs')
            .insert({
                user_id: userId,
                patch: data.patch,
                inverse_patch: data.inverse_patch,
                source: data.source,
                applied: data.applied ?? true
            })
            .select()
            .single();

        if (error) throw error;
        return run;
    }

    /**
     * Undo the last action
     */
    static async undoLast(userId: string) {
        const supabase = await createClient();

        // 1. Get last run
        const { data: lastRun } = await supabase
            .from('patch_runs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!lastRun) return { success: false, message: 'Nothing to undo' };

        // 2. Return Inverse Patch
        return { success: true, patch: lastRun.inverse_patch, sourceId: lastRun.id };
    }

    /**
     * Apply a patch to the calendar
     */
    static async applyPatch(userId: string, patch: any) {
        const supabase = await createClient();
        const results = {
            created: 0,
            updated: 0,
            deleted: 0,
            errors: [] as string[]
        };

        for (const change of patch.changes) {
            try {
                if (change.op === 'create') {
                    // Normalize data
                    const block = {
                        user_id: userId,
                        title: change.data.title || 'New Task',
                        start_time: change.data.start_time,
                        end_time: change.data.end_time,
                        block_type: change.data.block_type || 'craft',
                        status: 'planned',
                        context: change.data.context || change.data.title,
                        is_fixed: change.data.is_fixed || false,
                        goal_id: change.data.goal_id || null,
                        priority: change.data.priority || 3
                    };

                    const { error } = await supabase.from('schedule_blocks').insert(block);
                    if (error) throw error;
                    results.created++;

                } else if (change.op === 'update' || change.op === 'move' || change.op === 'resize') {
                    const id = change.event_id || change.block_id;
                    if (!id) throw new Error("Missing ID for update");

                    // Construct update payload
                    const updateData: any = {};
                    if (change.data?.start_time) updateData.start_time = change.data.start_time;
                    if (change.data?.end_time) updateData.end_time = change.data.end_time;
                    if (change.new_start_ts) updateData.start_time = change.new_start_ts;
                    if (change.new_end_ts) updateData.end_time = change.new_end_ts;

                    if (change.duration_minutes) {
                        // Needs refetch to calculate end time if only duration provided
                        // Optimization: We could do this in a stored procedure, but for now app-side
                        const { data: current } = await supabase.from('schedule_blocks').select('start_time').eq('id', id).single();
                        if (current) {
                            if (!updateData.start_time) updateData.start_time = current.start_time; // Keep start
                            const start = new Date(updateData.start_time);
                            const end = new Date(start.getTime() + change.duration_minutes * 60000);
                            updateData.end_time = end.toISOString();
                        }
                    }

                    const { error } = await supabase.from('schedule_blocks').update(updateData).eq('id', id).eq('user_id', userId);
                    if (error) throw error;
                    results.updated++;

                } else if (change.op === 'delete') {
                    const id = change.event_id || change.block_id;
                    if (!id) throw new Error("Missing ID for delete");

                    const { error } = await supabase.from('schedule_blocks').delete().eq('id', id).eq('user_id', userId);
                    if (error) throw error;
                    results.deleted++;
                }

            } catch (err) {
                console.error(`Failed to apply change ${change.op}:`, err);
                results.errors.push(`${change.op}: ${err instanceof Error ? err.message : 'Unknown'}`);
            }
        }

        return results;
    }
}
