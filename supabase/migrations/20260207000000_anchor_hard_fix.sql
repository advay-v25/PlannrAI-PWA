-- 20260207000000_anchor_hard_fix.sql

-- 1. Add commitment_id to schedule_blocks if not exists
ALTER TABLE public.schedule_blocks 
ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES public.commitments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_commitment_id ON public.schedule_blocks(commitment_id);

-- 2. Normalize Commitments Table (Constraints)
-- We use safe ALTERs to avoid failures on existing bad data if any (though unlikely on prod yet)
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
    -- 1. Clean up old future blocks for this commitment (if updating/deleting)
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        DELETE FROM public.schedule_blocks
        WHERE commitment_id = OLD.id
          AND date >= CURRENT_DATE;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;

    -- 2. Insert new blocks for next 28 days
    -- Loop 0 to 28
    FOR day_offset IN 0..28 LOOP
        target_date := CURRENT_DATE + day_offset;
        d_dow := EXTRACT(DOW FROM target_date); -- 0 = Sun, 6 = Sat
        
        -- Check if d_dow is in NEW.days_of_week
        -- Postgres: 0=Sun. JS: 0=Sun. 
        -- We assume days_of_week stores 0..6.
        
        IF d_dow = ANY(NEW.days_of_week) THEN
            -- Check for duplicates (though trigger runs on change, so idempotent mostly)
            -- But we just deleted them above, so INSERT is safe.
            INSERT INTO public.schedule_blocks (
                user_id,
                date,
                start_time,
                end_time,
                context, -- Title
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

-- 4. Create Trigger
DROP TRIGGER IF EXISTS trg_expand_commitment ON public.commitments;
CREATE TRIGGER trg_expand_commitment
    AFTER INSERT OR UPDATE OR DELETE ON public.commitments
    FOR EACH ROW EXECUTE FUNCTION public.expand_commitment_to_blocks();

-- 5. Backfill/Refresh (Optional, but good to run once)
-- Trigger only runs on change. We might want to "touch" existing commitments to expand them?
-- UPDATE public.commitments SET updated_at = NOW(); 
-- Commented out to avoid side effects on migration load, but recommended manually diff.
