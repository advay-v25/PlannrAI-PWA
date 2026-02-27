-- PlannrAI V1 Revolution Migration
-- Adds physics engine telemetry, 90-day cycles, and deep energy mapping

-- 1. Profile Upgrades (Energy & Boundaries)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wind_down_minutes INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS meal_count INT DEFAULT 3,
ADD COLUMN IF NOT EXISTS meal_times JSONB DEFAULT '{"breakfast": "08:00", "lunch": "13:00", "dinner": "19:00"}',
ADD COLUMN IF NOT EXISTS meal_duration_minutes INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS peak_windows TEXT[],
ADD COLUMN IF NOT EXISTS low_windows TEXT[],
ADD COLUMN IF NOT EXISTS work_style TEXT DEFAULT 'marathoner';

-- 2. Goal Upgrades (3-Month Cycles & Physics)
ALTER TABLE goals
ADD COLUMN IF NOT EXISTS weekly_target_minutes INT DEFAULT 180,
ADD COLUMN IF NOT EXISTS cycle_start_date DATE,
ADD COLUMN IF NOT EXISTS cycle_end_date DATE,
ADD COLUMN IF NOT EXISTS level INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS current_streak_days INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak_days INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_completed_minutes INT DEFAULT 0;

-- Set default cycle dates for existing goals
UPDATE goals 
SET cycle_start_date = CURRENT_DATE,
    cycle_end_date = CURRENT_DATE + INTERVAL '90 days'
WHERE cycle_start_date IS NULL;

-- 3. Schedule Blocks Upgrades
ALTER TABLE schedule_blocks
-- Already has block_type, adding new constraint/values if needed but usually text/enum
ADD COLUMN IF NOT EXISTS energy_level_required INT DEFAULT 3,
ADD COLUMN IF NOT EXISTS original_start_time TIME,
ADD COLUMN IF NOT EXISTS original_date DATE,
ADD COLUMN IF NOT EXISTS deviation_reason TEXT;

-- 4. New Table: Energy Check-ins
CREATE TABLE IF NOT EXISTS energy_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    energy_level INT CHECK (energy_level BETWEEN 1 AND 5),
    emotional_state TEXT,
    context_note TEXT
);

-- 5. New Table: AI Insights (Proactive suggestions)
CREATE TABLE IF NOT EXISTS ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    insight_type TEXT NOT NULL, -- e.g. 'momentum_alert', 'schedule_drift', 'energy_warning'
    message TEXT NOT NULL,
    action_data JSONB, -- embedded actions mapped to UI buttons
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 6. New Table: Block Completions (Telemetry for the Reality Calendar)
CREATE TABLE IF NOT EXISTS block_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID REFERENCES schedule_blocks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actual_duration_minutes INT,
    energy_level_after INT,
    deviation_type TEXT, -- e.g. 'started_late', 'ended_early', 'overran'
    notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_energy_checkins_user_date ON energy_checkins(user_id, checked_in_at);
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_unresolved ON ai_insights(user_id) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_block_completions_block ON block_completions(block_id);

-- 7. New Table: Schedule Versions (Undo Tracking for Calendar Engine)
CREATE TABLE IF NOT EXISTS schedule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_versions_user ON schedule_versions(user_id, created_at DESC);
