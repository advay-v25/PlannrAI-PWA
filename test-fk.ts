import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function run() {
    // Query to find all tables referencing auth.users
    const { data, error } = await admin.rpc('run_sql', {
        sql_query: `
            SELECT
                tc.table_schema, 
                tc.table_name, 
                kcu.column_name
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='users' AND ccu.table_schema='auth';
        `
    });

    if (error) {
        console.error("RPC failed, maybe run_sql doesn't exist.", error);
        
        // Let's try executing via REST if possible, or just print what we know.
    } else {
        console.log("Foreign keys:", data);
    }
}
run();
