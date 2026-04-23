import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const cleanupLog: string[] = [];

    // 2. Delete user data — fully non-fatal, best-effort cleanup
    const userIdTables = [
        'schedule_blocks',
        'goals',
        'commitments',
        'brain_dumps',
        'brain_dump_entries',
        'coach_conversations',
        'coach_messages',
        'coach_interactions',
        'memory_facts',
        'user_context',
        'user_states',
        'weekly_reviews',
        'personal_rules',
        'profile_preferences',
        'habit_stacks',
        'habit_entries',
        'audit_logs',
        'todos',
        'todo_lists',
        'energy_checkins',
    ];

    for (const table of userIdTables) {
        try {
            const { error } = await admin.from(table).delete().eq('user_id', userId);
            if (error) {
                // Table may not exist (PGRST204) or have no rows — both are fine
                cleanupLog.push(`${table}: skipped (${error.code})`);
            } else {
                cleanupLog.push(`${table}: cleared`);
            }
        } catch (e: any) {
            cleanupLog.push(`${table}: error (${e.message})`);
        }
    }

    // Clean profile (keyed by id, not user_id)
    try {
        await admin.from('profiles').delete().eq('id', userId);
        cleanupLog.push('profiles: cleared');
    } catch (e: any) {
        cleanupLog.push(`profiles: error (${e})`);
    }

    console.log('[DeleteAccount] Cleanup complete:', cleanupLog.join(', '));

    // 3. Hard-delete the auth user — this is the only step that can fail hard
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error('[DeleteAccount] Auth user deletion failed:', deleteError);
        return NextResponse.json(
            { error: 'Failed to delete auth user: ' + deleteError.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
