-- MASTER ANCHOR FIX (2026-02-07)
-- This script fixes ALL identified issues: Schema Drift, Missing Columns, Broken FKs.
-- It is idempotent (safe to run multiple times).

BEGIN;

-- 1. FIX COMMITMENTS TABLE (The Source of Truth)
-- Ensure Columns Exist and are Correct
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
-- Rename legacy column if it exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commitments' AND column_name = 'day_of_week') 
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commitments' AND column_name = 'days_of_week') THEN
        ALTER TABLE public.commitments RENAME COLUMN day_of_week TO days_of_week;
    END IF;
END $$;

-- 2. FIX FOREIGN KEYS (The Root Cause of 500s)
-- We must point to auth.users, NOT public.profiles (which might be missing entries)

-- 2a. Fix Commitments FK
ALTER TABLE public.commitments DROP CONSTRAINT IF EXISTS commitments_user_id_fkey;
ALTER TABLE public.commitments 
    ADD CONSTRAINT commitments_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 2b. Fix Schedule Blocks FK (Crucial for the Trigger to work)
ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_user_id_fkey;
ALTER TABLE public.schedule_blocks 
    ADD CONSTRAINT schedule_blocks_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 3. LINK TABLES
ALTER TABLE public.schedule_blocks 
    ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES public.commitments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_commitment_id ON public.schedule_blocks(commitment_id);

-- 4. APPLY LOGIC (Trigger)
CREATE OR REPLACE FUNCTION public.expand_commitment_to_blocks()
RETURNS TRIGGER AS $$
DECLARE
    day_offset INTEGER;
    target_date DATE;
    d_dow INTEGER;
BEGIN
    -- Cleanup future blocks
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        DELETE FROM public.schedule_blocks
        WHERE commitment_id = OLD.id
          AND date >= CURRENT_DATE;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;

    -- Expand to blocks
    FOR day_offset IN 0..28 LOOP
        target_date := CURRENT_DATE + day_offset;
        d_dow := EXTRACT(DOW FROM target_date); -- 0-6
        
        IF d_dow = ANY(NEW.days_of_week) THEN
            INSERT INTO public.schedule_blocks (
                user_id,
                date,
                start_time,
                end_time,
                context, 
                status,
                block_type,
                commitment_id,
                created_at,
                goal_id
            ) VALUES (
                NEW.user_id,
                target_date,
                NEW.start_time,
                NEW.end_time,
                NEW.title, 
                'planned',
                'anchor',
                NEW.id,
                NOW(),
                NULL
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-Apply Trigger
DROP TRIGGER IF EXISTS trg_expand_commitment ON public.commitments;
CREATE TRIGGER trg_expand_commitment
    AFTER INSERT OR UPDATE OR DELETE ON public.commitments
    FOR EACH ROW EXECUTE FUNCTION public.expand_commitment_to_blocks();

COMMIT;
