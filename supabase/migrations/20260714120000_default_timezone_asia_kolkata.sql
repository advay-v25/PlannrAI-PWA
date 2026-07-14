-- PlannrAI is currently sold only in India — make Asia/Kolkata (IST) the
-- default timezone for all new profiles, and backfill existing profiles
-- that are still sitting on the old 'UTC' schema default (or have no
-- timezone set at all). This matters because app code falls back to the
-- app default only when timezone is NULL/empty — a profile with the
-- literal string 'UTC' stored would otherwise keep using UTC forever.

ALTER TABLE profiles ALTER COLUMN timezone SET DEFAULT 'Asia/Kolkata';

UPDATE profiles
SET timezone = 'Asia/Kolkata'
WHERE timezone IS NULL OR timezone = 'UTC';
