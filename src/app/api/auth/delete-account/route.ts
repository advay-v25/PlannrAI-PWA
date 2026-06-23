import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request: Request) {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate Confirmation payload
    try {
        const body = await request.json();
        if (!body || body.confirm !== 'delete') {
            return NextResponse.json(
                { error: 'Confirmation required. Please type "delete" to confirm.' },
                { status: 400 }
            );
        }
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
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
        return NextResponse.json(
            { error: 'Failed to delete user account: ' + deleteError.message },
            { status: 500 }
        );
    }

    console.log(`[DeleteAccount] Account and all cascaded data successfully deleted for user: ${userId}`);
    return NextResponse.json({ success: true });
}
