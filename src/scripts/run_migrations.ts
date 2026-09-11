import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PROJECT_REF = 'safrbawlambimvqyhsyo';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!ACCESS_TOKEN) {
    console.error('Missing SUPABASE_ACCESS_TOKEN');
    process.exit(1);
}

async function runSqlViaManagementApi(sql: string): Promise<void> {
    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
    console.log(`POST ${url}`);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();
    console.log(`Status: ${res.status}`);
    if (!res.ok) {
        throw new Error(`Management API error ${res.status}: ${text}`);
    }
    console.log('Response:', text.substring(0, 500));
}

async function runSqlViaRest(sql: string): Promise<void> {
    // Supabase allows arbitrary SQL via /rest/v1/rpc or via the pg-meta endpoint
    const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
    console.log(`Trying REST RPC at ${url}`);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
    });

    const text = await res.text();
    console.log(`Status: ${res.status}`);
    if (!res.ok) {
        throw new Error(`REST API error ${res.status}: ${text}`);
    }
    console.log('Response:', text.substring(0, 500));
}

async function main() {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260827000000_chain_state.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Attempting to run migration via Supabase Management API...');
    try {
        await runSqlViaManagementApi(sql);
        console.log('✅ Migration applied via Management API!');
        return;
    } catch (e: any) {
        console.error('Management API attempt failed:', e.message);
    }

    console.log('\nAttempting to run migration via Supabase REST API (exec_sql RPC)...');
    try {
        await runSqlViaRest(sql);
        console.log('✅ Migration applied via REST API!');
    } catch (e: any) {
        console.error('REST API attempt failed:', e.message);
        process.exit(1);
    }
}

main();
