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

        const emailToDelete = 'advayvaidya.25@gmail.com';
        console.log(`Attempting to wipe developer account: ${emailToDelete}...`);

        // Perform the delete directly from auth.users
        const res = await client.query('DELETE FROM auth.users WHERE email = $1;', [emailToDelete]);

        if (res.rowCount && res.rowCount > 0) {
            console.log(`\n✅ Success! Developer account ${emailToDelete} and all associated data have been completely wiped from the system via cascading delete.`);
        } else {
            console.log(`\n⚠️ Account ${emailToDelete} was not found in the database (or has already been deleted).`);
        }

    } catch (err: any) {
        console.error('❌ Failed to wipe developer account:', err.message);
        if (err.detail) console.error('Detail:', err.detail);
        if (err.constraint) console.error('Constraint:', err.constraint);
    } finally {
        await client.end();
    }
}

main();
