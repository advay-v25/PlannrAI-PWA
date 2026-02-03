
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// Load env
dotenv.config({ path: '.env.local' });

async function migrate() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL not found in .env.local');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false } // Required for Supabase transaction mode usually, or direct
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260203000000_add_fullname.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration successful!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();
