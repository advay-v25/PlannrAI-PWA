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
            { data: coachInteractions },
            { data: weeklyReviews },
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', context.userId).single(),
            supabase.from('goals').select('*').eq('user_id', context.userId),
            supabase.from('schedule_blocks').select('*').eq('user_id', context.userId),
            supabase.from('coach_conversations').select('*').eq('user_id', context.userId),
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
        const uid = context.userId;

        // Delete in SEQUENTIAL order respecting foreign keys (children first)
        // Phase 1: Leaf tables (no dependencies)
        const leafTables = [
            'weekly_reviews',
            'coach_messages',     // must come before coach_conversations (FK)
            'memory_facts',
            'behavior_signals',
            'ai_proposals',
            'daily_logs',
            'habit_logs',         // must come before habit_stacks (FK)

            'session_bindings',
        ];

        for (const table of leafTables) {
            try {
                await supabase.from(table).delete().eq('user_id', uid);
            } catch (e) {
                console.warn(`[Delete] Failed to clear ${table}:`, e);
            }
        }

        // Phase 2: Parent tables (after their children are gone)
        const parentTables = [
            'coach_conversations',
            'schedule_blocks',
            'habit_stacks',
            'commitments',
            'goals',
            'profile_preferences',
        ];

        for (const table of parentTables) {
            try {
                await supabase.from(table).delete().eq('user_id', uid);
            } catch (e) {
                console.warn(`[Delete] Failed to clear ${table}:`, e);
            }
        }

        // Phase 3: Profile (root — must be last)
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', uid);

        if (error) {
            console.error('[Delete] Failed to delete profile:', error);
            return apiError('Failed to delete profile. Some dependent data may still exist.', 500);
        }

        // Sign out user
        await supabase.auth.signOut();

        // Log the deletion
        await logAuditEvent({
            userId: uid,
            action: 'data_delete',
            ipAddress: context.ip,
            metadata: { complete: true },
        });

        return apiSuccess({ success: true, message: 'All your data has been deleted.' });
    },
    { requireAuth: true, auditAction: 'data_delete' }
);
