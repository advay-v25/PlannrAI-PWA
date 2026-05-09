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

        // This query finds all foreign keys referencing auth.users in pg_constraint catalog
        const query = `
            SELECT
                ns.nspname AS table_schema,
                cl.relname AS table_name,
                con.conname AS constraint_name,
                pg_get_constraintdef(con.oid) AS constraint_definition,
                con.confdeltype AS delete_rule
            FROM pg_constraint con
            JOIN pg_class cl ON cl.oid = con.conrelid
            JOIN pg_namespace ns ON ns.oid = cl.relnamespace
            JOIN pg_class rcl ON rcl.oid = con.confrelid
            JOIN pg_namespace rns ON rns.oid = rcl.relnamespace
            WHERE rns.nspname = 'auth' AND rcl.relname = 'users'
            ORDER BY table_schema, table_name;
        `;

        const res = await client.query(query);
        console.log(`Found ${res.rows.length} foreign keys referencing auth.users:\n`);
        
        let blockedCount = 0;
        res.rows.forEach(row => {
            const isCascade = row.constraint_definition.includes('ON DELETE CASCADE') || row.constraint_definition.includes('ON DELETE SET NULL');
            if (!isCascade) {
                console.log(`❌ Table: ${row.table_schema}.${row.table_name} | Constraint: ${row.constraint_name} | Def: ${row.constraint_definition}`);
                blockedCount++;
            } else {
                console.log(`✅ Table: ${row.table_schema}.${row.table_name} | Constraint: ${row.constraint_name} | Def: ${row.constraint_definition}`);
            }
        });

        console.log(`\nTotal Blocked Constraints on auth.users: ${blockedCount}`);

    } catch (err) {
        console.error('Failed to inspect catalog:', err);
    } finally {
        await client.end();
    }
}

main();
