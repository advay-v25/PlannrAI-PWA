-- Add morning routine buffer to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS morning_routine_mins INTEGER DEFAULT 0;

-- Add morning routine buffer to profile_preferences table
ALTER TABLE profile_preferences ADD COLUMN IF NOT EXISTS morning_routine_min INTEGER DEFAULT 0;
