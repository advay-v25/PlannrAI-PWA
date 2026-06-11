-- ==========================================
-- ULTIMATE SCHEMA HARDENING SCRIPT
-- ==========================================
-- Run this directly in the Supabase SQL Editor.
-- This script dynamically safely fixes missing columns, updates foreign keys, 
-- and forcefully applies ON DELETE CASCADE to user-associated tables.
-- ==========================================

-- 1. Ensure Missing Columns Exist First
DO $$
BEGIN
    -- Check patch_runs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patch_runs') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patch_runs' AND column_name = 'schedule_version_id') THEN
            ALTER TABLE patch_runs ADD COLUMN schedule_version_id UUID;
        END IF;
    END IF;

    -- Check coach_learnings
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coach_learnings') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coach_learnings' AND column_name = 'conversation_id') THEN
            ALTER TABLE coach_learnings ADD COLUMN conversation_id UUID;
        END IF;
    END IF;
END $$;

-- 2. Safely apply explicit constraints for those missing columns
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patch_runs' AND column_name = 'schedule_version_id') THEN
        ALTER TABLE patch_runs DROP CONSTRAINT IF EXISTS patch_runs_schedule_version_id_fkey;
        ALTER TABLE patch_runs ADD CONSTRAINT patch_runs_schedule_version_id_fkey 
            FOREIGN KEY (schedule_version_id) REFERENCES schedule_versions(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coach_learnings' AND column_name = 'conversation_id') THEN
        ALTER TABLE coach_learnings DROP CONSTRAINT IF EXISTS coach_learnings_conversation_id_fkey;
        ALTER TABLE coach_learnings ADD CONSTRAINT coach_learnings_conversation_id_fkey 
            FOREIGN KEY (conversation_id) REFERENCES coach_conversations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Fix inner cascades causing failures
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schedule_blocks' AND column_name = 'habit_stack_id') THEN
        ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_habit_stack_id_fkey;
        ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_habit_stack_id_fkey 
            FOREIGN KEY (habit_stack_id) REFERENCES habit_stacks(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schedule_blocks' AND column_name = 'commitment_id') THEN
        ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_commitment_id_fkey;
        ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_commitment_id_fkey 
            FOREIGN KEY (commitment_id) REFERENCES commitments(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schedule_versions' AND column_name = 'user_id') THEN
        ALTER TABLE schedule_versions DROP CONSTRAINT IF EXISTS schedule_versions_user_id_fkey;
        ALTER TABLE schedule_versions ADD CONSTRAINT schedule_versions_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Dynamic "ON DELETE CASCADE" Enforcement for User Data
-- This finds ANY foreign key that references `auth.users` or `public.profiles`
-- and forcefully updates it to ON DELETE CASCADE so user deletion NEVER fails.
DO $$
DECLARE
    rec RECORD;
    alter_query TEXT;
BEGIN
    FOR rec IN 
        SELECT 
            tc.table_schema,
            tc.table_name,
            tc.constraint_name,
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
        WHERE 
            tc.constraint_type = 'FOREIGN KEY' 
            AND (ccu.table_name = 'profiles' OR ccu.table_name = 'users')
            AND rc.delete_rule != 'CASCADE'
            AND tc.table_schema = 'public'
    LOOP
        alter_query := format(
            'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE CASCADE;',
            rec.table_schema, rec.table_name, rec.constraint_name, rec.constraint_name, rec.column_name, rec.foreign_table_schema, rec.foreign_table_name, rec.foreign_column_name
        );
        EXECUTE alter_query;
        RAISE NOTICE 'Updated constraint % on table % to ON DELETE CASCADE', rec.constraint_name, rec.table_name;
    END LOOP;
END $$;
