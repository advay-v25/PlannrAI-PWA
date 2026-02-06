-- Phase 3: Goals Tab Overhaul

-- 1. Add new columns to Goals
ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS energy_demand TEXT DEFAULT 'medium' CHECK (energy_demand IN ('light', 'medium', 'heavy')),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived'));

-- 2. Migrate existing 'is_paused' to 'status'
UPDATE public.goals
SET status = 'paused'
WHERE is_paused = true;

-- 3. Update Category Constraint (Future -> Craft)
-- First, drop the old constraint so we can allow 'craft'
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_category_check;

-- Second, update the data
UPDATE public.goals
SET category = 'craft'
WHERE category = 'future';

-- Third, add the new constraint
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'goals_category_check') then
        ALTER TABLE public.goals ADD CONSTRAINT goals_category_check CHECK (category IN ('mind', 'body', 'craft'));
    end if;
end
$$;
