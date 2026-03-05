-- Fix schema drift: add columns that code expects but v1.5 migration dropped
-- These columns are written by weekly-review/apply, save, and complete routes

ALTER TABLE weekly_reviews 
ADD COLUMN IF NOT EXISTS planned_minutes NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_minutes NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS friction_patterns JSONB,
ADD COLUMN IF NOT EXISTS suggested_adjustment TEXT,
ADD COLUMN IF NOT EXISTS lever_action JSONB,
ADD COLUMN IF NOT EXISTS user_response TEXT,
ADD COLUMN IF NOT EXISTS lever_note TEXT,
ADD COLUMN IF NOT EXISTS lever_applied BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add unique constraint for upsert support (used by save/apply routes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reviews_user_week_unique 
ON weekly_reviews(user_id, week_start);
