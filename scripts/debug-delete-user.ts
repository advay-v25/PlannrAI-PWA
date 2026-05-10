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

        // 1. Get a list of users
        const usersRes = await client.query('SELECT id, email FROM auth.users LIMIT 5;');
        if (usersRes.rows.length === 0) {
            console.log('No users found in auth.users.');
            return;
        }

        console.log('Found users in auth.users:');
        usersRes.rows.forEach(u => console.log(`- ID: ${u.id} | Email: ${u.email}`));

        const testUserId = usersRes.rows[0].id;
        console.log(`\nAttempting to delete user ID: ${testUserId} inside a transaction...`);

        // Start transaction
        await client.query('BEGIN;');

        try {
            // Attempt delete
            await client.query('DELETE FROM auth.users WHERE id = $1;', [testUserId]);
            console.log('✅ Success! User was deleted successfully inside the transaction.');
        } catch (deleteErr: any) {
            console.error('❌ DELETE FAILED WITH POSTGRES ERROR:');
            console.error('Message:', deleteErr.message);
            console.error('Detail:', deleteErr.detail);
            console.error('Constraint:', deleteErr.constraint);
            console.error('Table:', deleteErr.table);
            console.error('Schema:', deleteErr.schema);
        } finally {
            // Always rollback so we don't accidentally modify data if we're just testing
            await client.query('ROLLBACK;');
            console.log('Transaction rolled back.');
        }

    } catch (err) {
        console.error('Connection/Query failed:', err);
    } finally {
        await client.end();
    }
}

main();
