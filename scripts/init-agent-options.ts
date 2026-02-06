import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function initDB() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("🔌 Connected to Database.");

        await client.query(`
            CREATE TABLE IF NOT EXISTS public.agent_options (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                user_id UUID NOT NULL,
                label TEXT NOT NULL,
                patch JSONB NOT NULL,
                context_snapshot JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour' NOT NULL
            );
        `);
        console.log("✅ Table 'agent_options' created/verified.");

        // Enable RLS
        await client.query(`ALTER TABLE public.agent_options ENABLE ROW LEVEL SECURITY;`);

        // Policies (Idempotent checks)
        // We drop to recreate to be safe and simple
        await client.query(`DROP POLICY IF EXISTS "Users can read own options" ON public.agent_options;`);
        await client.query(`
            CREATE POLICY "Users can read own options" ON public.agent_options 
            FOR SELECT USING (auth.uid() = user_id);
        `);

        await client.query(`DROP POLICY IF EXISTS "Users can insert own options" ON public.agent_options;`);
        await client.query(`
            CREATE POLICY "Users can insert own options" ON public.agent_options 
            FOR INSERT WITH CHECK (auth.uid() = user_id);
        `);

        console.log("🔒 RLS Policies applied.");

    } catch (e) {
        console.error("❌ Error initializing DB:", e);
    } finally {
        await client.end();
    }
}

initDB();
