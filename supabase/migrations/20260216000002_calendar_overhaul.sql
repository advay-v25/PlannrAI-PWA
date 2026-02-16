-- Migration: Calendar Overhaul
-- Description: Updates schedule_blocks, habit_stacks, and adds schedule_versions for the new calendar engine.

-- 1. Update schedule_blocks table
-- Ensure existing columns match requirements and add new ones
ALTER TABLE schedule_blocks 
ADD COLUMN IF NOT EXISTS habit_stack_id UUID REFERENCES habit_stacks(id),
ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES commitments(id);

-- Ensure block_type has correct constraints if needed (using text for flexibility based on current partial definition)
-- Valid block_types: 'anchor', 'meal', 'habit_stack', 'goal', 'adhoc'

-- 2. Update commitments table
ALTER TABLE commitments
ADD COLUMN IF NOT EXISTS days_of_week INTEGER[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS end_time TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. Update habit_stacks table
ALTER TABLE habit_stacks
ADD COLUMN IF NOT EXISTS preferred_window VARCHAR(50), -- e.g., 'morning', 'afternoon', 'evening' or specific time range
ADD COLUMN IF NOT EXISTS duration_min INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- 4. Create schedule_versions table (New)
CREATE TABLE IF NOT EXISTS schedule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('day', 'week')),
    week_start DATE, -- For weekly versions
    snapshot JSONB NOT NULL, -- The array of blocks
    source VARCHAR(50) NOT NULL, -- e.g., 'ai_planner', 'manual_backup'
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add RLS policies for schedule_versions
ALTER TABLE schedule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schedule versions"
    ON schedule_versions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own schedule versions"
    ON schedule_versions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own schedule versions"
    ON schedule_versions FOR UPDATE
    USING (auth.uid() = user_id);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_date ON schedule_blocks(date);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_user_date ON schedule_blocks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_schedule_versions_user_created ON schedule_versions(user_id, created_at DESC);
