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

        const { action, patch, clear_week, week_start } = validation.data;

        if (!patch.add?.length && !patch.update?.length && !patch.remove?.length && !clear_week) {
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
            if (clear_week && week_start) {
                const { count } = await supabase
                    .from('schedule_blocks')
                    .delete()
                    .eq('user_id', userId)
                    .gte('date', week_start)
                    .lte('date', addDays(week_start, 6))
                    .not('is_fixed', 'eq', true)
                    .is('commitment_id', null);

                removed += count || 0;
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

            // 5. Add blocks
            if (patch.add?.length) {
                const blocks = patch.add.map((b: any) => ({
                    ...b,
                    user_id: userId,
                    status: b.status || 'planned',
                }));

                const { data, error } = await supabase
                    .from('schedule_blocks')
                    .insert(blocks)
                    .select('id');

                if (!error) added = data?.length || 0;
                else console.error('[ApplySchedule] Insert failed:', error);
            }

            console.log(`[ApplySchedule] +${added} ~${updated} -${removed}`);

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
