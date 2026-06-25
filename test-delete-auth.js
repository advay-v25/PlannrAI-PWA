require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
    console.log("Attempting to delete user...");
    // 3c7cebfc-20c5-4999-9322-bc0acb35cf66 from screenshot
    const { data, error } = await admin.auth.admin.deleteUser('3c7cebfc-20c5-4999-9322-bc0acb35cf66');
    if (error) {
        console.error("Failed to delete user:", error);
    } else {
        console.log("Successfully deleted user:", data);
    }
}
run();
