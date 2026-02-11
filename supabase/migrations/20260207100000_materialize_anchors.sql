-- MIGRATION: Materialize Anchors into Schedule Blocks (V5 Authority)

BEGIN;

-- 1. Schema Upgrades for schedule_blocks
-- We need explicit columns to support independent blocks (not just goal links)
ALTER TABLE public.schedule_blocks
ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES public.commitments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS title TEXT; -- Independent title (e.g. "Lunch")

-- 2. Function to Materialize Commitments
CREATE OR REPLACE FUNCTION public.expand_commitment_blocks()
RETURNS TRIGGER AS $$
DECLARE
    curr_date DATE;
    day_idx INT;
    horizon INT := 90; -- Generate 90 days out
    day_array INT[];
BEGIN
    -- cleanup future blocks for this commitment (on update/delete)
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        DELETE FROM public.schedule_blocks
        WHERE commitment_id = OLD.id
          AND date >= CURRENT_DATE;
    END IF;

    -- generate new blocks (on insert/update)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.is_active THEN
            day_array := NEW.days_of_week;
            
            FOR i IN 0..horizon LOOP
                curr_date := CURRENT_DATE + i;
                day_idx := EXTRACT(DOW FROM curr_date)::INT;
                
                -- Check if day matches (Postgres array contains operator)
                IF day_array @> ARRAY[day_idx] THEN
                    INSERT INTO public.schedule_blocks (
                        user_id,
                        commitment_id,
                        date,
                        start_time,
                        end_time,
                        block_type,
                        status,
                        is_fixed,
                        title,
                        context,
                        created_at
                    ) VALUES (
                        NEW.user_id,
                        NEW.id,
                        curr_date,
                        NEW.start_time,
                        NEW.end_time,
                        'anchor',
                        'planned',
                        true,
                        NEW.title,
                        'Recurring Constraint',
                        NOW()
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger Definition
DROP TRIGGER IF EXISTS trg_materialize_anchors ON public.commitments;
CREATE TRIGGER trg_materialize_anchors
AFTER INSERT OR UPDATE OR DELETE ON public.commitments
FOR EACH ROW EXECUTE FUNCTION public.expand_commitment_blocks();

-- 4. Backfill (Force Update to Trigger Expansion)
-- This effectively "migrates" existing ghost state to real rows.
UPDATE public.commitments SET is_active = is_active WHERE is_active = true;

COMMIT;
