/**
 * 🎯 Apply Schedule Changes
 * Simpler alternative to /api/patch/apply for direct schedule mutations.
 * Creates a snapshot for undo, then applies add/update/remove operations.
 */

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

const ApplyScheduleSchema = z.object({
    action: z.enum(['plan_week', 'optimize_day', 'manual']).default('manual'),
    variant_id: z.string().optional(),
    clear_week: z.boolean().default(false),
    clear_date: z.string().optional(), // Clear only a single date (yyyy-MM-dd)
    week_start: z.string().optional(),
    patch: z.object({
        add: z.array(z.any()).optional(),
        update: z.array(z.object({
            id: z.string(),
            changes: z.record(z.string(), z.any()),
        })).optional(),
        remove: z.array(z.string()).optional(),
    }),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const { userId, supabase } = context;

        const validation = ApplyScheduleSchema.safeParse(body);
        if (!validation.success) {
            return apiError(`Invalid input: ${validation.error.message}`, 400);
        }

        const { action, patch, clear_week, clear_date, week_start } = validation.data;

        if (!patch.add?.length && !patch.update?.length && !patch.remove?.length && !clear_week && !clear_date) {
            return apiError('No changes to apply', 400);
        }

        let added = 0, updated = 0, removed = 0;
        let versionId: string | null = null;

        try {
            // 1. Create undo snapshot
            try {
                const snapshotRange = week_start || new Date().toISOString().split('T')[0];
                const { data: snapshot } = await supabase
                    .from('schedule_blocks')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('date', snapshotRange)
                    .lte('date', addDays(snapshotRange, 13));

                const { data: version } = await supabase
                    .from('schedule_versions')
                    .insert({
                        user_id: userId,
                        snapshot: snapshot || [],
                        trigger_action: action,
                        created_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single();

                versionId = version?.id || null;
            } catch (e) {
                console.warn('[ApplySchedule] Snapshot failed, continuing:', e);
            }

            // 2. Clear week if requested
            // For full plan regeneration (plan_week/optimize_day), clear ALL blocks 
            // since the new plan already includes commitment time slots.
            // For manual edits, respect the is_locked flag.
            if (clear_week && week_start) {
                const endDate = addDays(week_start, 6);

                // First count what we're about to delete
                const { data: toDelete } = await supabase
                    .from('schedule_blocks')
                    .select('id')
                    .eq('user_id', userId)
                    .gte('date', week_start)
                    .lte('date', endDate);

                console.log(`[ApplySchedule] Found ${toDelete?.length || 0} blocks in range ${week_start} to ${endDate}`);

                // Delete with no lock filter for plan actions
                let deleteQuery = supabase
                    .from('schedule_blocks')
                    .delete({ count: 'exact' })
                    .eq('user_id', userId)
                    .gte('date', week_start)
                    .lte('date', endDate);

                if (action === 'manual') {
                    deleteQuery = deleteQuery.or('is_locked.is.null,is_locked.eq.false');
                }

                const { count: deletedCount, error: deleteError } = await deleteQuery;

                if (deleteError) {
                    console.error(`[ApplySchedule] Delete error:`, deleteError);
                } else {
                    removed += deletedCount || 0;
                    console.log(`[ApplySchedule] Cleared ${removed} blocks for ${week_start} (action=${action})`);
                }
            }

            // 2b. Clear single date if requested (for day regeneration)
            if (clear_date) {
                let deleteQuery = supabase
                    .from('schedule_blocks')
                    .delete({ count: 'exact' })
                    .eq('user_id', userId)
                    .eq('date', clear_date);

                if (action === 'manual') {
                    deleteQuery = deleteQuery.or('is_locked.is.null,is_locked.eq.false');
                }

                const { count: deletedCount, error: deleteError } = await deleteQuery;

                if (deleteError) {
                    console.error(`[ApplySchedule] Delete error for date ${clear_date}:`, deleteError);
                } else {
                    removed += deletedCount || 0;
                    console.log(`[ApplySchedule] Cleared ${removed} blocks for date ${clear_date}`);
                }
            }

            // 3. Remove blocks
            if (patch.remove?.length) {
                const { count } = await supabase
                    .from('schedule_blocks')
                    .delete()
                    .eq('user_id', userId)
                    .in('id', patch.remove);

                removed += count || 0;
            }

            // 4. Update blocks
            if (patch.update?.length) {
                for (const upd of patch.update) {
                    const { error } = await supabase
                        .from('schedule_blocks')
                        .update(upd.changes)
                        .eq('id', upd.id)
                        .eq('user_id', userId);

                    if (!error) updated++;
                }
            }

            // 5. Add blocks (filter out any that overlap with anchor commitments)
            if (patch.add?.length) {
                // Fetch commitments to check for overlaps
                const targetDates = [...new Set(patch.add.map((b: any) => b.date).filter(Boolean))];
                let commitmentBlocks: any[] = [];
                if (targetDates.length > 0) {
                    const { data: cmts } = await supabase
                        .from('commitments')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('is_active', true);
                    commitmentBlocks = cmts || [];
                }

                const timeToMin = (t: string) => {
                    const [h, m] = t.split(':').map(Number);
                    return (h || 0) * 60 + (m || 0);
                };

                // Filter out blocks that overlap with commitments
                const filteredBlocks = patch.add.filter((b: any) => {
                    if (!b.start_time || !b.end_time || !b.date) return true;
                    const bStart = timeToMin(b.start_time);
                    const bEnd = timeToMin(b.end_time);
                    const dayOfWeek = new Date(b.date + 'T12:00:00').getDay();
                    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

                    for (const cmt of commitmentBlocks) {
                        if (cmt.days_of_week && !cmt.days_of_week.includes(isoDay)) continue;
                        const cStart = timeToMin(cmt.start_time);
                        const cEnd = timeToMin(cmt.end_time);
                        if (bStart < cEnd + 30 && bEnd > cStart - 30) return false; // overlaps or within 30 min buffer
                    }
                    return true;
                });

                const blocks = filteredBlocks.map((b: any) => ({
                    ...b,
                    user_id: userId,
                    status: b.status || 'planned',
                    block_type: normalizeBlockType(b.block_type || 'flex'),
                }));

                if (blocks.length > 0) {
                    // DETAILED LOGGING FOR DEBUGGING
                    console.log(`[ApplySchedule] Attempting to insert ${blocks.length} blocks...`, JSON.stringify(blocks[0], null, 2));

                    const { data, error } = await supabase
                        .from('schedule_blocks')
                        .insert(blocks)
                        .select('id');

                    if (!error) {
                        added = data?.length || 0;
                        console.log(`[ApplySchedule] Successfully inserted ${added} blocks.`);
                    } else {
                        console.error('[ApplySchedule] Insert failed. Error details:', JSON.stringify(error, null, 2));
                    }
                }

                const skipped = patch.add.length - filteredBlocks.length;
                if (skipped > 0) {
                    console.log(`[ApplySchedule] Skipped ${skipped} blocks that overlapped with commitments`);
                }
            }

            console.log(`[ApplySchedule] Transaction Complete: +${added} ~${updated} -${removed} | Version: ${versionId}`);

            return apiSuccess({
                added,
                updated,
                removed,
                version_id: versionId,
            });

        } catch (e: any) {
            console.error('[ApplySchedule] Error:', e);
            return apiError(`Apply failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);

function addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

/** Maps AI-generated block_type values to DB-allowed constraint values */
function normalizeBlockType(type: string): string {
    const map: Record<string, string> = {
        'focus': 'goal', 'body': 'goal', 'mind': 'goal', 'craft': 'goal',
        'task': 'flex', 'break': 'buffer', 'free': 'buffer', 'transition': 'buffer',
        'exercise': 'goal', 'work': 'goal', 'deep_work': 'goal',
        'admin': 'flex', 'personal': 'flex',
    };
    const allowed = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];
    if (allowed.includes(type)) return type;
    return map[type] || 'flex';
}
