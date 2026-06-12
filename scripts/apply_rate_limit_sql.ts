import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
    // Requires a POSTGRES_URL connection string in .env.local
    // or standard PG vars.
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
    if (!connectionString) {
        console.error('No connection string found (DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL). Please run migration manually.');
        return;
    }

    const client = new Client({
        connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260611000000_rate_limiting.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log('Successfully applied rate_limiting migration!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

main();
