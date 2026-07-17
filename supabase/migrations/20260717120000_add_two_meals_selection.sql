-- Add which-two-meals selector to profile_preferences (settings page previously
-- had no way to set this post-onboarding, silently defaulting to breakfast+dinner)
ALTER TABLE profile_preferences
    ADD COLUMN IF NOT EXISTS two_meals_selection TEXT
    CHECK (two_meals_selection IN ('breakfast_lunch', 'lunch_dinner', 'breakfast_dinner'));

UPDATE profile_preferences
SET two_meals_selection = 'breakfast_dinner'
WHERE meals_per_day = 2 AND two_meals_selection IS NULL;
