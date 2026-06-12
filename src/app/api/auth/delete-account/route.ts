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

    // 3. Hard-delete the auth user first.
    // This is a single atomic database operation. Supabase Auth will delete the auth.users record,
    // which cascades to profiles, goals, schedule_blocks, commitments, weekly_reviews, and all other tables.
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
