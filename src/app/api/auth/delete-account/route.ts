
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // We need a Service Role client to delete the auth user
        // Using generic env vars assuming standard Supabase setup
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const adminAuthClient = createAdminClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // 1. Delete public schema data (optional if cascade is set, but safer to do explicit)
        // We do this via the user context client (RLS) or admin client
        // Let's use the standard client for data to respect logic, or admin to force it.
        // Admin is safer for "Cleanup".

        const tables = [
            'brain_dump_entries',
            'coach_conversations',
            'coach_messages',
            'memory_facts',
            'schedule_blocks',
            'coach_interactions', // Legacy?
            'weekly_reviews',
            'commitments',
            'goals',
            'profiles'
        ];

        // Manually clean up data
        for (const table of tables) {
            await adminAuthClient.from(table).delete().eq('user_id', user.id);
        }

        // Also delete profile by ID (sometimes user_id constraint differs, but usually it is the ID)
        await adminAuthClient.from('profiles').delete().eq('id', user.id);

        // 2. Delete Auth User (Hard Delete)
        const { error: deleteError } = await adminAuthClient.auth.admin.deleteUser(user.id);

        if (deleteError) {
            console.error('Delete user error:', deleteError);
            throw deleteError;
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Delete account failed:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete account' },
            { status: 500 }
        );
    }
}
