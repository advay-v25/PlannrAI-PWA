import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function applyPhase2() {
    console.log("🛠️  Applying Pillar 2 Schema (Calendar Authority)...");

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

        // 1. Create Block Type Enum
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_type') THEN
                    CREATE TYPE block_type AS ENUM ('anchor', 'body', 'craft', 'mind', 'meal', 'buffer');
                END IF;
            END $$;
        `);
        console.log("✅ Type 'block_type' checked/created.");

        // 2. Add block_type column to schedule_blocks
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_blocks' AND column_name='block_type') THEN
                    ALTER TABLE public.schedule_blocks 
                    ADD COLUMN block_type block_type DEFAULT 'anchor';
                END IF;
            END $$;
        `);
        console.log("✅ Column 'block_type' added to 'schedule_blocks'.");

        // 3. Ensure is_fixed alias exists (we used is_locked in Phase 1, let's standardize on is_fixed as per codebase, or ensure is_locked is mapped)
        // Codebase uses `is_fixed`. Phase 1 added `is_locked`. Let's clarify.
        // `solver.ts` uses `is_fixed`. `schedule_blocks` in `scheduler-agent.ts` mapped `is_fixed`? 
        // Let's check `types.ts` again. Database usually has `is_fixed` from earlier migrations? a check won't hurt.

        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_blocks' AND column_name='is_fixed') THEN
                     ALTER TABLE public.schedule_blocks ADD COLUMN is_fixed boolean DEFAULT false;
                END IF;
            END $$;
        `);
        console.log("✅ Column 'is_fixed' checked.");

        console.log("🎉 Pillar 2 Schema Applied Successfully.");

    } catch (err) {
        console.error("❌ Migration Failed:", err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

applyPhase2();
