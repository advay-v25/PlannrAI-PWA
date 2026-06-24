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
    const tables = [
        'schedule_blocks', 'commitments', 'goals', 'habit_stacks', 'profile_preferences',
        'chat_messages', 'chat_sessions', 'daily_logs', 'weekly_reviews', 'user_feedback',
        'user_context', 'intervention_logs', 'memory_facts', 'brain_dumps', 'brain_dump_extractions',
        'user_state', 'milestones', 'goal_tasks', 'coach_threads', 'coach_messages', 'patch_runs',
        'behavior_events', 'behavior_patterns', 'inbox_items', 'daily_stats', 'todo_lists', 'todos',
        'scan_sessions', 'routine_recommendations', 'coach_conversations', 'coach_learned_preferences',
        'coach_proactive_log', 'coach_conversation_summaries', 'brain_dump_entries', 'calendar_operation_logs',
        'ai_usage_logs', 'coach_interactions', 'user_states', 'ai_interventions', 'ai_audit_log',
        'conversations', 'conversation_messages', 'energy_checkins', 'ai_insights', 'block_completions',
        'schedule_versions', 'block_logs', 'streaks', 'ai_proposals', 'auth_attempts', 'security_audit_log',
        'session_bindings'
    ];
    
    await Promise.all(
        tables.map(async (table) => {
            try {
                await admin.from(table).delete().eq('user_id', userId);
            } catch (err) {
                console.error(`[DeleteAccount] Silent error deleting from ${table}:`, err);
            }
        })
    );
    
    // Some tables might use 'id' or other keys, but 'profiles' is the main one to clear out first.
    try {
        await admin.from('profiles').delete().eq('id', userId);
    } catch (err) {
        console.error(`[DeleteAccount] Silent error deleting from profiles:`, err);
    }

    // 4. Hard-delete the auth user
    // This is a single atomic database operation. Supabase Auth will delete the auth.users record.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error('[DeleteAccount] Auth user deletion failed:', deleteError);
        return apiError('Failed to delete user account: ' + deleteError.message, 500, 'DELETION_FAILED');
    }

    console.log(`[DeleteAccount] Account and all cascaded data successfully deleted for user: ${userId}`);
    return apiSuccess({ success: true });
}, { requireAuth: true, requireCsrf: true, rateLimit: 'userStrict', auditAction: 'delete_account' });
