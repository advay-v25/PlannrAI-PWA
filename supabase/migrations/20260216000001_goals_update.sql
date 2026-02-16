-- Migration: Goals Rebuild Schema Update
-- Helper function to add column if not exists
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    t_name text, 
    c_name text, 
    c_type text
) 
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = t_name AND column_name = c_name
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', t_name, c_name, c_type);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 1. Add new columns to 'goals' table
SELECT add_column_if_not_exists('goals', 'minutes_per_day', 'integer DEFAULT 30');
SELECT add_column_if_not_exists('goals', 'days_per_week', 'integer DEFAULT 5');
SELECT add_column_if_not_exists('goals', 'energy_demand', 'text DEFAULT ''medium'''); -- light, medium, heavy
SELECT add_column_if_not_exists('goals', 'preferred_windows', 'jsonb DEFAULT ''[]''::jsonb'); -- ["morning", "evening"]
SELECT add_column_if_not_exists('goals', 'ai_strategy', 'jsonb DEFAULT ''{}''::jsonb'); -- { ...strategy... }
SELECT add_column_if_not_exists('goals', 'milestone_progress', 'integer DEFAULT 0');

-- 2. Clean up helper
DROP FUNCTION add_column_if_not_exists;

-- 3. Add constraint for energy_demand
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_energy_demand_check') THEN
        ALTER TABLE goals ADD CONSTRAINT goals_energy_demand_check 
        CHECK (energy_demand IN ('light', 'medium', 'heavy'));
    END IF;
END $$;
