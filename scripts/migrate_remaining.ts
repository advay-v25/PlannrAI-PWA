
import { Client } from 'pg';
import * as dotenv from 'dotenv';

// Load env
dotenv.config({ path: '.env.local' });

async function migrate() {
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

        // Migration 7: Stress Test Hardening
        console.log('Running migration: 20260202173000_stress_test_hardening.sql');
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_title_check') THEN
                    ALTER TABLE goals
                    ADD CONSTRAINT goals_title_check CHECK (length(trim(title)) > 0);
                END IF;
            END $$;

            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocks_time_check') THEN
                    ALTER TABLE schedule_blocks
                    ADD CONSTRAINT blocks_time_check CHECK (end_time > start_time);
                END IF;
            END $$;
        `);
        console.log('Stress test hardening applied.');

        // Migration 8: Add Fullname
        console.log('Running migration: 20260203000000_add_fullname.sql');
        await client.query(`
            alter table "public"."profiles" add column if not exists "full_name" text;
            alter table "public"."profiles" add column if not exists "preferred_name" text;
        `);
        console.log('Fullname column added.');

        // Migration 9: Add Brain Dump AI Fields
        console.log('Running migration: 20260203120000_add_brain_dump_ai_fields.sql');
        await client.query(`
            -- Add AI categorization fields to brain_dumps
            ALTER TABLE public.brain_dumps ADD COLUMN IF NOT EXISTS "ai_categories" TEXT[] DEFAULT '{}';
            ALTER TABLE public.brain_dumps ADD COLUMN IF NOT EXISTS "ai_themes" TEXT[] DEFAULT '{}';
            ALTER TABLE public.brain_dumps ADD COLUMN IF NOT EXISTS "ai_sentiment" TEXT;

            -- Add index for better analytics
            CREATE INDEX IF NOT EXISTS idx_brain_dumps_sentiment ON public.brain_dumps(ai_sentiment);
        `);
        console.log('Brain dump AI fields added.');

        // Migration 10: Add Goal Notes/Context Field
        console.log('Running migration: 20260203140000_add_goal_notes.sql');
        await client.query(`
            -- Add notes field to goals for user context
            ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS description TEXT;
            ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        `);
        console.log('Goal notes column added.');

        console.log('All pending migrations successful!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();
