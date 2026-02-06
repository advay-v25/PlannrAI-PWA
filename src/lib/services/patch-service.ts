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

        // 2. Apply inverse patch (This logic needs to be robust)
        // For now, we assume the inverse patch is a valid payload for /api/calendar/apply-patch
        // In reality, we might need a direct DB mutation here.

        return { success: true, patch: lastRun.inverse_patch };
    }
}
