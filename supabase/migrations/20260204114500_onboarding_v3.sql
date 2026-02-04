-- Phase 4: Onboarding v3 Migration

-- 1. Add Onboarding Preferences to Profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS body_preferences JSONB DEFAULT '{
    "activity_types": [],
    "preferred_time": "morning",
    "duration_mins": 30
}'::jsonb,
ADD COLUMN IF NOT EXISTS buffer_config JSONB DEFAULT '{
    "gap_mins": 10,
    "type": "normal"
}'::jsonb,
ADD COLUMN IF NOT EXISTS wind_down_mins INTEGER DEFAULT 45,
ADD COLUMN IF NOT EXISTS meals_per_day INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS meal_windows JSONB DEFAULT '{
    "breakfast": "08:00",
    "lunch": "13:00",
    "dinner": "19:00"
}'::jsonb;

-- 2. Update existing rows if needed (defaults handle it, but good to be explicit for not nulls if any)
-- No constraints added yet to allow flexibility during dev.
