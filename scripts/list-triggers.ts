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

        const query = `
            SELECT 
                event_object_table AS table_name,
                trigger_name,
                event_manipulation AS event,
                action_statement AS action,
                action_timing AS timing
            FROM 
                information_schema.triggers
            WHERE 
                trigger_schema = 'public'
            ORDER BY 
                event_object_table, trigger_name;
        `;

        const res = await client.query(query);
        console.log(`Found ${res.rows.length} triggers in public schema:\n`);
        res.rows.forEach(row => {
            console.log(`Table: ${row.table_name} | Trigger: ${row.trigger_name} | Event: ${row.event} | Timing: ${row.timing} | Action: ${row.action}`);
        });

    } catch (err) {
        console.error('Failed to list triggers:', err);
    } finally {
        await client.end();
    }
}

main();
