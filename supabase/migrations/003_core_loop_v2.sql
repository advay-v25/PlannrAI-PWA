-- =====================================================
-- PlannrAI Core Loop V2 - Database Migration
-- Goals 2.0, Habit Stacking, Deviation Tracking
-- =====================================================

-- =====================================================
-- GOALS 2.0 - Enhanced with Subtasks & Constraints
-- =====================================================

-- Add subtask support (self-referencing)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES goals(id) ON DELETE CASCADE;

-- Add constraints and non-negotiables
ALTER TABLE goals ADD COLUMN IF NOT EXISTS constraints JSONB DEFAULT '{}';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS non_negotiables TEXT[] DEFAULT '{}';

-- Add time commitment and AI-generated routine
ALTER TABLE goals ADD COLUMN IF NOT EXISTS time_commitment_mins INTEGER;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS ai_routine JSONB;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS milestone_progress INTEGER DEFAULT 0;

-- Add ordering for subtasks
ALTER TABLE goals ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Index for efficient subtask queries
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_sort ON goals(user_id, parent_id, sort_order);

-- =====================================================
-- HABIT STACKS - "After X, do Y" chains
-- =====================================================

CREATE TABLE IF NOT EXISTS habit_stacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    
    -- The trigger (existing habit)
    trigger_habit TEXT NOT NULL,
    trigger_time TIME,  -- Optional: specific time
    
    -- The action (new habit to build)
    action_habit TEXT NOT NULL,
    action_duration_mins INTEGER DEFAULT 5,
    
    -- Progress tracking
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_completed DATE,
    total_completions INTEGER DEFAULT 0,
    
    -- Grace system
    grace_days_used INTEGER DEFAULT 0,
    max_grace_days INTEGER DEFAULT 1,
    
    -- Meta
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habit_stacks_user ON habit_stacks(user_id, is_active);

-- =====================================================
-- REALITY INTAKE - Quick logging
-- =====================================================

CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Energy & mood tracking
    energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
    mood TEXT,
    
    -- Quick notes
    wins TEXT[],
    challenges TEXT[],
    gratitude TEXT[],
    
    -- AI-extracted signals from brain dump
    signals JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, log_date)
);

-- =====================================================
-- BLOCK LOGS - Per-block status tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS block_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID REFERENCES schedule_blocks(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Status: done, partial, missed, skipped
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'partial', 'missed', 'skipped')),
    
    -- Optional "why" capture
    reason TEXT,
    
    -- AI classification
    deviation_type TEXT CHECK (deviation_type IN ('unavoidable', 'structural', 'energy', 'skill', 'avoidance')),
    ai_analysis JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(block_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_block_logs_user_date ON block_logs(user_id, log_date);

-- =====================================================
-- STREAKS - Goal and habit tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Can be linked to goal or habit stack
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    habit_stack_id UUID REFERENCES habit_stacks(id) ON DELETE CASCADE,
    
    -- Streak data
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_completed DATE,
    
    -- Grace days (1 miss doesn't break streak)
    grace_days_used INTEGER DEFAULT 0,
    max_grace_days INTEGER DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Either goal_id or habit_stack_id must be set
    CONSTRAINT streak_target_check CHECK (
        (goal_id IS NOT NULL AND habit_stack_id IS NULL) OR
        (goal_id IS NULL AND habit_stack_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_streaks_user ON streaks(user_id);

-- =====================================================
-- AI PROPOSALS - Silent Intelligence
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Proposal type
    proposal_type TEXT NOT NULL CHECK (proposal_type IN (
        'habit_stack', 'routine', 'goal_adjustment', 
        'schedule_change', 'recovery', 'insight'
    )),
    
    -- Proposal content
    title TEXT NOT NULL,
    description TEXT,
    action_data JSONB NOT NULL,
    
    -- Source context
    source_type TEXT,  -- 'brain_dump', 'deviation', 'pattern'
    source_id UUID,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    
    -- Timing
    expires_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_proposals_user_status ON ai_proposals(user_id, status, created_at DESC);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE habit_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;

-- Habit Stacks
CREATE POLICY "Users can view own habit stacks" ON habit_stacks
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own habit stacks" ON habit_stacks
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habit stacks" ON habit_stacks
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own habit stacks" ON habit_stacks
    FOR DELETE USING (auth.uid() = user_id);

-- Daily Logs
CREATE POLICY "Users can view own daily logs" ON daily_logs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own daily logs" ON daily_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily logs" ON daily_logs
    FOR UPDATE USING (auth.uid() = user_id);

-- Block Logs
CREATE POLICY "Users can view own block logs" ON block_logs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own block logs" ON block_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own block logs" ON block_logs
    FOR UPDATE USING (auth.uid() = user_id);

-- Streaks
CREATE POLICY "Users can view own streaks" ON streaks
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own streaks" ON streaks
    FOR ALL USING (auth.uid() = user_id);

-- AI Proposals
CREATE POLICY "Users can view own proposals" ON ai_proposals
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can respond to own proposals" ON ai_proposals
    FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update streak on completion
CREATE OR REPLACE FUNCTION update_streak(
    p_user_id UUID,
    p_goal_id UUID DEFAULT NULL,
    p_habit_stack_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_streak_id UUID;
    v_last_completed DATE;
    v_current_streak INTEGER;
    v_days_since INTEGER;
BEGIN
    -- Find or create streak record
    SELECT id, last_completed, current_streak 
    INTO v_streak_id, v_last_completed, v_current_streak
    FROM streaks 
    WHERE user_id = p_user_id 
      AND (goal_id = p_goal_id OR habit_stack_id = p_habit_stack_id);
    
    IF v_streak_id IS NULL THEN
        INSERT INTO streaks (user_id, goal_id, habit_stack_id, current_streak, last_completed)
        VALUES (p_user_id, p_goal_id, p_habit_stack_id, 1, CURRENT_DATE);
        RETURN;
    END IF;
    
    v_days_since := CURRENT_DATE - v_last_completed;
    
    IF v_days_since = 1 THEN
        -- Consecutive day - increment streak
        UPDATE streaks SET 
            current_streak = current_streak + 1,
            longest_streak = GREATEST(longest_streak, current_streak + 1),
            last_completed = CURRENT_DATE,
            grace_days_used = 0,
            updated_at = NOW()
        WHERE id = v_streak_id;
    ELSIF v_days_since = 2 THEN
        -- Missed one day - use grace if available
        UPDATE streaks SET
            current_streak = CASE 
                WHEN grace_days_used < max_grace_days THEN current_streak + 1
                ELSE 1
            END,
            grace_days_used = CASE 
                WHEN grace_days_used < max_grace_days THEN grace_days_used + 1
                ELSE 0
            END,
            last_completed = CURRENT_DATE,
            updated_at = NOW()
        WHERE id = v_streak_id;
    ELSIF v_days_since > 2 THEN
        -- Streak broken
        UPDATE streaks SET
            current_streak = 1,
            grace_days_used = 0,
            last_completed = CURRENT_DATE,
            updated_at = NOW()
        WHERE id = v_streak_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
