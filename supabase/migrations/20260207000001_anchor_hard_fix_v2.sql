-- 20260207000000_anchor_hard_fix_v2.sql
-- FIXED VERSION: Handles 'day_of_week' -> 'days_of_week' rename

-- 0. Normalize Column Name (The Fix for the Error)
DO $$
BEGIN
    -- Check if 'day_of_week' exists and 'days_of_week' does NOT (Rename case)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commitments' AND column_name = 'day_of_week') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commitments' AND column_name = 'days_of_week') THEN
        
        ALTER TABLE public.commitments RENAME COLUMN day_of_week TO days_of_week;
    END IF;

    -- Ensure it is an ARRAY (In case it was a scalar integer, unlikely given the UI, but safety first)
    -- If it was scalar ID, this cast might fail or need explicit logic, but assuming it was intended as array or unused.
    -- For now, we assume it's integer[] or we cast it.
    -- ALTER TABLE public.commitments ALTER COLUMN days_of_week TYPE INTEGER[] USING ARRAY[days_of_week]; -- Uncomment if it was scalar
    -- Ensure is_active column exists
    ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

    -- Fix FK Constraint (It might be pointing to profiles, should be auth.users)
    ALTER TABLE public.commitments DROP CONSTRAINT IF EXISTS commitments_user_id_fkey;
    ALTER TABLE public.commitments 
        ADD CONSTRAINT commitments_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE;

    -- Fix FK Constraint for schedule_blocks (Trigger inserts here, so this must also be valid)
    ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_user_id_fkey;
    ALTER TABLE public.schedule_blocks 
        ADD CONSTRAINT schedule_blocks_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE;
END $$;

-- 1. Add commitment_id to schedule_blocks
ALTER TABLE public.schedule_blocks 
ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES public.commitments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_commitment_id ON public.schedule_blocks(commitment_id);

-- 2. Constraints (Now safe because column is renamed)
ALTER TABLE public.commitments
    DROP CONSTRAINT IF EXISTS check_time_order,
    ADD CONSTRAINT check_time_order CHECK (end_time > start_time);

ALTER TABLE public.commitments
    DROP CONSTRAINT IF EXISTS check_days_array,
    ADD CONSTRAINT check_days_array CHECK (array_length(days_of_week, 1) >= 1);

ALTER TABLE public.commitments
    DROP CONSTRAINT IF EXISTS check_title_length,
    ADD CONSTRAINT check_title_length CHECK (length(title) >= 1 AND length(title) <= 80);

-- 3. Expansion Function
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

-- 4. Trigger
DROP TRIGGER IF EXISTS trg_expand_commitment ON public.commitments;
CREATE TRIGGER trg_expand_commitment
    AFTER INSERT OR UPDATE OR DELETE ON public.commitments
    FOR EACH ROW EXECUTE FUNCTION public.expand_commitment_to_blocks();
    