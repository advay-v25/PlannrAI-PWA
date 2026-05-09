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
                tc.table_schema, 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                rc.delete_rule,
                tc.constraint_name
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                JOIN information_schema.referential_constraints AS rc
                  ON rc.constraint_name = tc.constraint_name
            ORDER BY tc.table_name, kcu.column_name;
        `;

        const res = await client.query(query);
        console.log(`Found ${res.rows.length} foreign key constraints:\n`);
        
        // Print constraints that do NOT use CASCADE or SET NULL delete rule
        console.log('--- BLOCKED CONSTRAINTS (NO ACTION OR RESTRICT) ---');
        let nonCascadeCount = 0;
        res.rows.forEach(row => {
            if (row.delete_rule !== 'CASCADE' && row.delete_rule !== 'SET NULL') {
                console.log(`Table: ${row.table_schema}.${row.table_name} (${row.column_name}) -> References: ${row.foreign_table_schema}.${row.foreign_table_name} (${row.foreign_column_name}) | Delete Rule: ${row.delete_rule} | Constraint: ${row.constraint_name}`);
                nonCascadeCount++;
            }
        });
        console.log(`\nTotal Blocked Constraints: ${nonCascadeCount}\n`);

    } catch (err) {
        console.error('Failed:', err);
    } finally {
        await client.end();
    }
}

main();
