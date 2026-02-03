-- Add check constraint for goal titles (Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_title_check') THEN
        ALTER TABLE goals
        ADD CONSTRAINT goals_title_check CHECK (length(trim(title)) > 0);
    END IF;
END $$;

-- Add check constraint for schedule blocks (Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocks_time_check') THEN
        ALTER TABLE schedule_blocks
        ADD CONSTRAINT blocks_time_check CHECK (end_time > start_time);
    END IF;
END $$;
