import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function fix() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log("Connected to DB");
        
        const res = await client.query('ALTER TABLE public.user_states DROP CONSTRAINT IF EXISTS check_emotional_state;');
        console.log("Constraint dropped:", res);
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.end();
    }
}
fix();
