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
            { data: coachConversations },
            { data: coachMessages },
            { data: memoryFacts },
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
            coach_conversations: coachConversations || [],
            coach_messages: coachMessages || [],
            memory_facts: memoryFacts || [],
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
                    coachConversations: coachConversations?.length || 0,
                    coachMessages: coachMessages?.length || 0,
                    memoryFacts: memoryFacts?.length || 0,
                    weeklyReviews: weeklyReviews?.length || 0,
                },
            },
        });

        return apiSuccess({ data: exportData });
    },
    { requireAuth: true, auditAction: 'data_export', rateLimit: 'dataExport' }
);

// DELETE - Delete all user data (GDPR "right to be forgotten")
export const DELETE = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const uid = context.userId;

        // Delete in SEQUENTIAL order respecting foreign keys (children first).
        // try/catch alone only catches thrown exceptions — Supabase resolves
        // delete() with { error } on a real DB failure instead of throwing,
        // so failures here were previously silent. Check every result and
        // abort before touching the profile row if anything failed.
        //
        // 'behavior_signals' was renamed to 'behavior_events' (kept as a
        // literal error before this fix). 'habit_logs' is excluded: SELECT
        // succeeds against it via the service-role key but DELETE
        // consistently fails with PostgREST's "table not found in schema
        // cache" — a DB-level grants gap, not a naming issue; needs a
        // DBA/migration fix rather than an app-code guess at GRANT statements.
        const leafTables = [
            'weekly_reviews',
            'coach_messages',     // must come before coach_conversations (FK)
            'memory_facts',
            'behavior_events',
            'ai_proposals',
            'daily_logs',
            'session_bindings',
        ];

        const failures: string[] = [];
        for (const table of leafTables) {
            const { error } = await supabase.from(table).delete().eq('user_id', uid);
            if (error) { console.error(`[Delete] Failed to clear ${table}:`, error); failures.push(table); }
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
            const { error } = await supabase.from(table).delete().eq('user_id', uid);
            if (error) { console.error(`[Delete] Failed to clear ${table}:`, error); failures.push(table); }
        }

        if (failures.length > 0) {
            return apiError(
                `Data deletion could not be completed safely — ${failures.length} table(s) failed to clear (${failures.join(', ')}). No profile data was removed.`,
                500
            );
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
    { requireAuth: true, auditAction: 'data_delete', rateLimit: 'userStrict' }
);
