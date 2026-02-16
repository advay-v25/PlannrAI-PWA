
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log('Listing users...');

    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('Error listing users:', error);
        return;
    }

    if (users.length > 0) {
        console.log('Found existing users:');
        console.log(`ID: ${users[0].id}`);
        console.log(`Email: ${users[0].email}`);
        return;
    }

    console.log('No users found. Creating admin debug user...');

    const email = `admin-debug-${Date.now()}@example.com`;
    const password = 'debug-password-123';

    const { data, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (createError) {
        console.error('Error creating user:', createError);
        return;
    }

    console.log('User created:', data.user?.id);
    console.log('Email:', email);
}

main();
