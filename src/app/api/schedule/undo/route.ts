import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/schedule/undo
 * Restores the previous schedule version for the current week.
 */
export const POST = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const userId = context.userId;

        // 1. Find the current week start (Monday)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diff);
        const weekStart = monday.toISOString().split('T')[0];

        // 2. Find the most recent version for this week
        const { data: versions, error: fetchErr } = await supabase
            .from('schedule_versions')
            .select('*')
            .eq('user_id', userId)
            .eq('week_start', weekStart)
            .order('created_at', { ascending: false })
            .limit(2);

        if (fetchErr) throw fetchErr;

        if (!versions || versions.length === 0) {
            return apiError('No previous version to undo to', 404);
        }

        // The most recent version is the snapshot before the current schedule.
        // If there's only 1 version, that's the one to restore.
        const restoreVersion = versions[0];
        const snapshot = restoreVersion.snapshot as any[];

        if (!snapshot || snapshot.length === 0) {
            return apiError('Previous version snapshot is empty', 400);
        }

        // 3. Snapshot current state before undo (so user can re-do)
        const endDate = new Date(monday);
        endDate.setDate(monday.getDate() + 6);
        const endDateStr = endDate.toISOString().split('T')[0];

        const { data: currentBlocks } = await supabase
            .from('schedule_blocks')
            .select('*')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', endDateStr);

        if (currentBlocks && currentBlocks.length > 0) {
            await supabase
                .from('schedule_versions')
                .insert({
                    user_id: userId,
                    week_start: weekStart,
                    source: 'undo',
                    snapshot: currentBlocks,
                });
        }

        // 4. Clear current planned blocks
        await supabase
            .from('schedule_blocks')
            .delete()
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', endDateStr)
            .eq('status', 'planned')
            .neq('is_fixed', true);

        // 5. Restore from snapshot
        const blocksToRestore = snapshot
            .filter((b: any) => b.status === 'planned')
            .map((b: any) => ({
                user_id: userId,
                date: b.date,
                start_time: b.start_time,
                end_time: b.end_time,
                goal_id: b.goal_id || null,
                title: b.title || b.context || 'Restored',
                context: b.context || b.title || 'Restored',
                status: 'planned',
                block_type: b.block_type || 'goal',
            }));

        let restoredCount = 0;
        if (blocksToRestore.length > 0) {
            const { data: restored, error: insertErr } = await supabase
                .from('schedule_blocks')
                .insert(blocksToRestore)
                .select();

            if (insertErr) throw insertErr;
            restoredCount = restored?.length || 0;
        }

        // 6. Mark the restored version as inactive
        await supabase
            .from('schedule_versions')
            .update({ is_active: false })
            .eq('id', restoreVersion.id);

        return apiSuccess({
            success: true,
            restored: restoredCount,
            message: `Restored ${restoredCount} blocks from previous version`,
        });
    },
    { requireAuth: true, auditAction: 'schedule_undo' }
);
