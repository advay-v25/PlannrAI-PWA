import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function forceDeleteUser(email: string) {
    console.log(`\n🔍 Looking up user with email: ${email}`);

    // 1. Get the User ID
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
        console.error('❌ Failed to list users:', listError.message);
        return;
    }

    const targetUser = usersData.users.find(u => u.email === email);
    
    if (!targetUser) {
        console.error(`❌ No user found with email: ${email}`);
        return;
    }

    const userId = targetUser.id;
    console.log(`✅ Found user: ${userId}`);

    // 2. Perform a Deep Clean to bypass broken ON DELETE CASCADE constraints
    // We manually delete from all known tables in reverse dependency order
    const tables = [
        'ai_usage_logs',
        'calendar_operation_logs',
        'intervention_logs',
        'user_context',
        'todo_lists',
        'todos',
        'brain_dump_items',
        'coach_learned_preferences',
        'coach_proactive_log',
        'coach_messages',
        'coach_conversations',
        'personal_rules',
        'weekly_review_data',
        'weekly_reviews',
        'schedule_versions',
        'potential_goals',
        'goals',
        'schedule_blocks',
        'commitments',
        'habit_instances',
        'habit_stacks',
        'profiles' // Profiles must be last as it is referenced by others
    ];

    console.log('\n🧹 Performing Deep Clean of user data to bypass constraints...');
    
    for (const table of tables) {
        try {
            // Check if table has 'user_id' or 'id' for profiles
            const matchColumn = table === 'profiles' ? 'id' : 'user_id';
            
            const { error: deleteError } = await supabaseAdmin
                .from(table)
                .delete()
                .eq(matchColumn, userId);

            if (deleteError) {
                // Some tables might not exist or not have user_id, ignore them
                if (!deleteError.message.includes('does not exist')) {
                    console.log(`⚠️  Warning deleting from ${table}:`, deleteError.message);
                }
            } else {
                process.stdout.write('.');
            }
        } catch (e) {
            // Ignore generic errors
        }
    }

    console.log('\n✅ Deep Clean complete.');

    // 3. Finally delete the Auth User
    console.log(`\n🗑️  Deleting from auth.users...`);
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
        console.error('❌ Failed to delete auth user:', authDeleteError.message);
    } else {
        console.log(`🎉 Successfully deleted user: ${email}`);
    }
}

// Get email from command line args
const emailArg = process.argv[2];
if (!emailArg) {
    console.error('Usage: npx tsx scripts/delete_user.ts <email>');
    process.exit(1);
}

forceDeleteUser(emailArg);
