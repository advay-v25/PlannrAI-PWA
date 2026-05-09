import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL not found in .env.local');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260509174000_cascade_delete_final_fix.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running final cascade delete fix migration...');
        await client.query(sql);
        console.log('✅ Cascade delete fix migration successfully applied to database!');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await client.end();
    }
}

main();
