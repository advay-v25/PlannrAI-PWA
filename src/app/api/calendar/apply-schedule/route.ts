/**
 * 🎯 Apply Schedule Changes
 *
 * The HTTP surface. Every rule about how a week reaches the database now lives
 * in `week-writer.ts`, shared with the weekly review's `plan_next_week` — the
 * two used to be separate implementations, and only this one knew the rules.
 */

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';
import { writeWeek, addDaysIso } from '@/lib/services/week-writer';

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

        try {
            // clear_week and clear_date are the same operation over different
            // windows, so they collapse into one range for the writer.
            const clearRange = clear_week && week_start
                ? { start: week_start, end: addDaysIso(week_start, 6) }
                : clear_date
                  ? { start: clear_date, end: clear_date }
                  : null;

            const result = await writeWeek({
                userId,
                supabase,
                action,
                clearRange,
                add: patch.add || [],
                update: patch.update || [],
                remove: patch.remove || [],
            });

            // Clear needs_rescheduling once an AI-generated day/week plan has
            // actually been applied (not merely previewed/generated) — matches
            // the flag's intent: "there's a pending plan the user hasn't acted on".
            if ((action === 'optimize_day' || action === 'plan_week') && result.added > 0) {
                try {
                    const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', userId).single();
                    const bioData = (profile?.bio_data as any) || {};
                    if (bioData.needs_rescheduling) {
                        await supabase.from('profiles').update({
                            bio_data: { ...bioData, needs_rescheduling: false }
                        }).eq('id', userId);
                    }
                } catch (e) { /* non-blocking */ }
            }

            return apiSuccess({
                added: result.added,
                updated: result.updated,
                removed: result.removed,
                // Previously console.log only, so the route reported success
                // while silently dropping blocks the user expected to see.
                skipped: result.skipped,
                failed: result.failed,
                version_id: result.version_id,
            });

        } catch (e: any) {
            console.error('[ApplySchedule] Error:', e);
            return apiError(`Apply failed: ${e.message}`, 500);
        }
    },
    { requireAuth: true }
);
