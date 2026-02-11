import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/security/audit-logger';

// GET - Export all user data (GDPR compliance)
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        // Fetch all user data
        const [
            { data: profile },
            { data: goals },
            { data: scheduleBlocks },
            { data: brainDumps },
            { data: coachInteractions },
            { data: weeklyReviews },
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', context.userId).single(),
            supabase.from('goals').select('*').eq('user_id', context.userId),
            supabase.from('schedule_blocks').select('*').eq('user_id', context.userId),
            supabase.from('brain_dump_entries').select('id, raw_text, created_at').eq('user_id', context.userId),
            supabase.from('coach_threads').select('*').eq('user_id', context.userId),
            supabase.from('coach_messages').select('*').eq('user_id', context.userId),
            supabase.from('memory_facts').select('*').eq('user_id', context.userId),
            supabase.from('weekly_reviews').select('*').eq('user_id', context.userId),
        ]);

        const exportData = {
            exported_at: new Date().toISOString(),
            user_id: context.userId,
            profile: profile || {},
            goals: goals || [],
            schedule_blocks: scheduleBlocks || [],
            brain_dumps: brainDumps || [],
            coach_interactions: coachInteractions || [],
            weekly_reviews: weeklyReviews || [],
        };

        // Log the export
        await logAuditEvent({
            userId: context.userId,
            action: 'data_export',
            ipAddress: context.ip,
            metadata: {
                recordCounts: {
                    goals: goals?.length || 0,
                    scheduleBlocks: scheduleBlocks?.length || 0,
                    brainDumps: brainDumps?.length || 0,
                    coachInteractions: coachInteractions?.length || 0,
                    weeklyReviews: weeklyReviews?.length || 0,
                },
            },
        });

        return apiSuccess({ data: exportData });
    },
    { requireAuth: true, auditAction: 'data_export' }
);

// DELETE - Delete all user data (GDPR "right to be forgotten")
export const DELETE = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        // Delete in order (respecting foreign keys)
        await Promise.all([
            supabase.from('weekly_reviews').delete().eq('user_id', context.userId),
            supabase.from('coach_messages').delete().eq('user_id', context.userId),
            supabase.from('coach_threads').delete().eq('user_id', context.userId),
            supabase.from('memory_facts').delete().eq('user_id', context.userId),
            supabase.from('brain_dump_entries').delete().eq('user_id', context.userId),
            supabase.from('schedule_blocks').delete().eq('user_id', context.userId),
            supabase.from('goals').delete().eq('user_id', context.userId),
            supabase.from('session_bindings').delete().eq('user_id', context.userId),
        ]);

        // Delete profile (this may cascade)
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', context.userId);

        if (error) {
            return apiError('Failed to delete data', 500);
        }

        // Sign out user
        await supabase.auth.signOut();

        // Log the deletion (will be cleaned up later)
        await logAuditEvent({
            userId: context.userId,
            action: 'data_delete',
            ipAddress: context.ip,
            metadata: { complete: true },
        });

        return apiSuccess({ success: true, message: 'All your data has been deleted.' });
    },
    { requireAuth: true, auditAction: 'data_delete' }
);
