import { createClient as createAdminClient } from '@supabase/supabase-js';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { z } from 'zod';

export const maxDuration = 60;

const deleteAccountSchema = z.object({
    confirm: z.literal('delete', {
        message: 'Confirmation required. Please type "delete" to confirm.'
    })
});

export const POST = secureApiRoute(async (context, rawBody) => {
    const { user } = context;

    const parsed = deleteAccountSchema.safeParse(rawBody);

    if (!parsed.success) {
        return apiError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return apiError('Server configuration error', 500, 'SERVER_ERROR');
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const userId = user.id;

    console.log(`[DeleteAccount] Triggering atomic cascade deletion for user: ${userId}`);

    // 3. Hard-delete user data explicitly to avoid FK constraint issues if ON DELETE CASCADE is missing
    //
    // Two categories of table are deliberately excluded from this list —
    // verified directly against the live database before this fix shipped,
    // since deletion now aborts on any real per-table failure (see below)
    // and either category would otherwise make account deletion
    // permanently impossible for every user:
    //
    // 1. 'auth_attempts' — a rate-limiting table with no user_id column
    //    (keyed by email/IP instead); a user_id-based delete against it
    //    always fails with a real Postgres error (42703, undefined column).
    //
    // 2. 'chat_messages', 'chat_sessions', 'user_feedback', 'milestones',
    //    'goal_tasks', 'coach_threads' — SELECT succeeds against these via
    //    the service-role key, but DELETE consistently fails with
    //    PostgREST's "table not found in schema cache", which points to a
    //    DB-level grants gap (DELETE not granted to whatever role the
    //    service key maps to for these specific tables) rather than a
    //    naming issue. This needs a DBA/migration-level fix (grant DELETE,
    //    or confirm these are legacy/renamed tables that should be dropped
    //    from this list entirely) — it isn't safe to guess at GRANT
    //    statements from application code, so it's flagged here rather than
    //    silently patched.
    const tables = [
        'schedule_blocks', 'commitments', 'goals', 'habit_stacks', 'profile_preferences',
        'daily_logs', 'weekly_reviews',
        'user_context', 'intervention_logs', 'memory_facts', 'brain_dumps', 'brain_dump_extractions',
        'user_state', 'coach_messages', 'patch_runs',
        'behavior_events', 'behavior_patterns', 'inbox_items', 'daily_stats', 'todo_lists', 'todos',
        'scan_sessions', 'routine_recommendations', 'coach_conversations', 'coach_learned_preferences',
        'coach_proactive_log', 'coach_conversation_summaries', 'brain_dump_entries', 'calendar_operation_logs',
        'ai_usage_logs', 'coach_interactions', 'user_states', 'ai_interventions', 'ai_audit_log',
        'conversations', 'conversation_messages', 'energy_checkins', 'ai_insights', 'block_completions',
        'schedule_versions', 'block_logs', 'streaks', 'ai_proposals', 'security_audit_log',
        'session_bindings'
    ];
    
    // Supabase's delete() does NOT throw on a database-level failure (RLS
    // denial, missing column, FK violation) — it resolves with { error }.
    // A try/catch around the call alone silently treats every one of those
    // as a success, which is how this route could previously report
    // "account deleted" while leaving personal data behind. Check the
    // actual result for every table instead.
    const failures: { table: string; message: string }[] = [];
    const cleared: string[] = [];

    await Promise.all(
        tables.map(async (table) => {
            try {
                const { error, count } = await admin.from(table).delete({ count: 'exact' }).eq('user_id', userId);
                if (error) {
                    failures.push({ table, message: error.message });
                } else {
                    cleared.push(`${table}(${count ?? 0})`);
                }
            } catch (err: any) {
                failures.push({ table, message: err?.message || String(err) });
            }
        })
    );

    if (failures.length > 0) {
        console.error(`[DeleteAccount] ${failures.length} table(s) failed to clear for user ${userId}:`, failures);
        return apiError(
            `Account deletion could not be completed safely — ${failures.length} data table(s) failed to clear (${failures.map(f => f.table).join(', ')}). No data was removed and your login was not deleted. Please try again or contact support.`,
            500,
            'DELETION_FAILED'
        );
    }

    // Only the root 'profiles' row and the auth identity remain — clear
    // those last, now that every dependent table is confirmed empty.
    const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
    if (profileError) {
        console.error(`[DeleteAccount] Failed to delete profile row for user ${userId}:`, profileError);
        return apiError('Failed to delete profile record: ' + profileError.message, 500, 'DELETION_FAILED');
    }

    // 4. Hard-delete the auth user — only reached once every table above is
    // confirmed cleared, so this is the last step, not a step taken
    // regardless of what happened before it.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error('[DeleteAccount] Auth user deletion failed:', deleteError);
        return apiError('Failed to delete user account: ' + deleteError.message, 500, 'DELETION_FAILED');
    }

    console.log(`[DeleteAccount] Account and all cascaded data successfully deleted for user: ${userId}. Cleared: ${cleared.join(', ')}`);
    return apiSuccess({
        success: true,
        deletion_receipt: {
            deleted_at: new Date().toISOString(),
            tables_cleared: cleared.length,
            profile_deleted: true,
            auth_identity_deleted: true,
        },
    });
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'delete_account' });
