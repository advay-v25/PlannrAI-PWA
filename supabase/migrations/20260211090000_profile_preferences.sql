-- Phase 7: Calendar Upgrade Migration
-- Adds human-centric scheduling preferences and enhanced block metadata

-- 1. Profiles Table Updates
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS weekend_intensity TEXT DEFAULT 'normal' CHECK (weekend_intensity IN ('normal', 'light', 'off')),
ADD COLUMN IF NOT EXISTS preferred_workdays INTEGER[] DEFAULT '{0,1,2,3,4,5,6}', -- Default all days available
ADD COLUMN IF NOT EXISTS meal_duration_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS meal_windows JSONB DEFAULT '{"breakfast": {"start":"07:00","end":"10:00"}, "lunch": {"start":"12:00","end":"15:00"}, "dinner": {"start":"18:30","end":"21:30"}}'::jsonb,
ADD COLUMN IF NOT EXISTS pillar_preferences JSONB DEFAULT '{"mind": {"preferred":["09:00-12:00"], "avoid":["20:00-23:00"]}, "body": {"preferred":["17:00-20:00"]}, "craft": {"preferred":["12:00-17:00"]}}'::jsonb;

-- 2. Goals Table Updates
ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS pillar TEXT CHECK (pillar IN ('mind', 'body', 'craft')),
ADD COLUMN IF NOT EXISTS minutes_per_day INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS days_per_week INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS energy TEXT DEFAULT 'medium' CHECK (energy IN ('light', 'medium', 'heavy')),
ADD COLUMN IF NOT EXISTS preferred_windows JSONB DEFAULT '[]'::jsonb;

-- 3. Schedule Blocks Updates (Canonical Calendar Table)
ALTER TABLE public.schedule_blocks
ADD COLUMN IF NOT EXISTS pillar TEXT CHECK (pillar IN ('mind', 'body', 'craft')),
ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'planner' CHECK (source IN ('planner', 'optimiser', 'coach', 'manual', 'anchor', 'meal', 'sleep')),
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS energy_cost TEXT CHECK (energy_cost IN ('light', 'medium', 'heavy')),
ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

-- 4. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_source ON public.schedule_blocks(source);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_is_locked ON public.schedule_blocks(is_locked);
CREATE INDEX IF NOT EXISTS idx_goals_pillar ON public.goals(pillar);
