import { Client } from 'pg';
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

        // 1. List users before deletion
        const beforeRes = await client.query('SELECT id, email FROM auth.users;');
        console.log(`\nFound ${beforeRes.rows.length} users in the database:`);
        beforeRes.rows.forEach(u => {
            console.log(`- ID: ${u.id} | Email: ${u.email}`);
        });

        console.log(`\nDeleting ALL users from the database...`);
        
        const deleteRes = await client.query('DELETE FROM auth.users;');

        console.log(`✅ Success! Deleted ${deleteRes.rowCount} users.`);

        // 2. List remaining users
        const afterRes = await client.query('SELECT id, email FROM auth.users;');
        console.log(`\nRemaining users in the database (${afterRes.rows.length}):`);
        afterRes.rows.forEach(u => {
            console.log(`- ID: ${u.id} | Email: ${u.email}`);
        });

    } catch (err) {
        console.error('❌ Failed to clear users:', err);
    } finally {
        await client.end();
    }
}

main();
