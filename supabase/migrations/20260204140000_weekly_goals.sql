-- Add days_per_week to goals table
ALTER TABLE goals 
ADD COLUMN IF NOT EXISTS days_per_week integer DEFAULT 7 CHECK (days_per_week >= 1 AND days_per_week <= 7);

-- Add comment for AI context
COMMENT ON COLUMN goals.days_per_week IS 'Frequency of the goal in days per week (1-7). Default is 7 (daily).';
