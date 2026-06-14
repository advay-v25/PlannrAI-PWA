import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { PatchService } from '@/lib/services/patch-service';
import { isPreviewEnabled } from '@/lib/featureFlags';

export const maxDuration = 45;

export const POST = secureApiRoute(
    async (context, body) => {
        if (!isPreviewEnabled()) return apiError('Feature disabled in production', 403);
        const { mode, changes = [] } = body as any;
        const { userId, supabase } = context;

        if (!mode) return apiError("Missing execution mode", 400);

        // 1. Process explicit goal changes (for both auto and semi-auto)
        // If mode is 'auto', `changes` will contain all proposed changes from the report.
        // If mode is 'semi-auto', `changes` will contain ONLY the changes the user explicitly approved.
        for (const change of changes) {
            const { goal_id, change_type, new_minutes_per_day, new_days_per_week } = change;
            if (!goal_id) continue;

            if (change_type === 'pause') {
                await supabase.from('goals').update({ is_paused: true }).eq('id', goal_id).eq('user_id', userId);
            } else if (change_type === 'delete') {
                // To be safe, we'll just pause it instead of hard deleting, or if they really want delete:
                await supabase.from('goals').delete().eq('id', goal_id).eq('user_id', userId);
            } else if (change_type === 'update_time' || change_type === 'update_days') {
                const updates: any = {};
                if (typeof new_minutes_per_day === 'number') updates.minutes_per_day = new_minutes_per_day;
                if (typeof new_days_per_week === 'number') updates.days_per_week = new_days_per_week;
                
                if (Object.keys(updates).length > 0) {
                    await supabase.from('goals').update(updates).eq('id', goal_id).eq('user_id', userId);
                }
            }
        }

        // 2. Trigger Replan
        // In auto mode, or if semi-auto had changes, we should probably replan the current week's schedule
        // to reflect the new realities.
        // Let's trigger a basic replan operation via the PatchService
        
        await PatchService.applyPatch(userId, {
            ops: [{ op: 'replan_week', payload: { mode: 'balanced', allow_weekend: true } }],
            scope: 'week'
        }, supabase, 'coach');

        return apiSuccess({ success: true, mode, applied_changes: changes.length });
    },
    { requireAuth: true, auditAction: 'weekly_review_execute' }
);
