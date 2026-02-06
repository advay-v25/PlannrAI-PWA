import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function applyPhase1() {
    console.log("🛠️  Applying Master Phase 1 Schema...");

    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL missing.");
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("🔌 Connected to DB.");

        // 1. User Mode Type
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_mode') THEN
                    CREATE TYPE user_mode AS ENUM ('survival', 'maintenance', 'growth');
                END IF;
            END $$;
        `);
        console.log("✅ Type 'user_mode' checked/created.");

        // 2. User States Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.user_states (
              user_id uuid primary key references auth.users(id) on delete cascade,
              energy_level int check (energy_level between 1 and 5) default 3,
              cognitive_load int check (cognitive_load between 1 and 3) default 2,
              emotional_bandwidth int check (emotional_bandwidth between 1 and 3) default 2,
              current_mode user_mode not null default 'maintenance',
              updated_at timestamptz default now()
            );
        `);
        console.log("✅ Table 'user_states' checked/created.");

        // 3. RLS for User States
        await client.query(`
            ALTER TABLE public.user_states ENABLE ROW LEVEL SECURITY;
            
             DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies 
                    WHERE tablename = 'user_states' AND policyname = 'Users manage own state'
                ) THEN
                    CREATE POLICY "Users manage own state" ON public.user_states 
                    FOR ALL USING (auth.uid() = user_id);
                END IF;
            END $$;
        `);
        console.log("✅ RLS Policy for 'user_states' checked/created.");

        // 4. Update Schedule Blocks
        // Priority
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_blocks' AND column_name='priority') THEN
                    ALTER TABLE public.schedule_blocks 
                    ADD COLUMN priority int default 3 check (priority between 1 and 5);
                END IF;
            END $$;
        `);
        // Energy Cost
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_blocks' AND column_name='energy_cost') THEN
                    ALTER TABLE public.schedule_blocks 
                    ADD COLUMN energy_cost text default 'medium' check (energy_cost in ('low', 'medium', 'high'));
                END IF;
            END $$;
        `);
        // Is Locked
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_blocks' AND column_name='is_locked') THEN
                    ALTER TABLE public.schedule_blocks 
                    ADD COLUMN is_locked boolean default false;
                END IF;
            END $$;
        `);
        // Title (Missing from Initial Schema!)
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_blocks' AND column_name='title') THEN
                    ALTER TABLE public.schedule_blocks 
                    ADD COLUMN title text;
                END IF;
            END $$;
        `);
        console.log("✅ Table 'schedule_blocks' columns updated.");

        console.log("🎉 Phase 1 Schema Applied Successfully.");

    } catch (err) {
        console.error("❌ Migration Failed:", err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

applyPhase1();
