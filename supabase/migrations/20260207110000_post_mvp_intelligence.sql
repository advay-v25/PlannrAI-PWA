-- MIGRATION: Post-MVP Calendar Intelligence
-- GOAL: Enable Adaptive Learning, Load Stats, and Flex Zones.

BEGIN;

-- 1. Daily Stats for Load Intelligence
CREATE TABLE IF NOT EXISTS public.daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Calculated Metrics
    total_active_mins INT DEFAULT 0,
    fragmentation_score FLOAT DEFAULT 0, -- 0-1 (Low to High)
    cognitive_load_score FLOAT DEFAULT 0, -- 0-10
    physical_load_score FLOAT DEFAULT 0, -- 0-10
    
    -- Inferred State
    dominant_mode TEXT, -- 'focus', 'admin', 'recovery', 'mixed'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- 2. Add 'flex' to block types (Implicit in text, but good to document)
-- No schema change needed for text check constraint unless it's an enum. 
-- Assuming text or check constraint. If enum, we'd add it.
-- We'll assume check constraint or unchecked text for now.

-- 3. Enhance Commitments for Recurring Intelligence
ALTER TABLE public.commitments
    ADD COLUMN IF NOT EXISTS preferred_time_window TEXT, -- 'morning', 'afternoon', 'evening' OR '09:00-12:00'
    ADD COLUMN IF NOT EXISTS flexible_frequency_per_week INT; -- e.g. 3 (for 3x/week)

-- 4. Calendar Memory (Deletions/Moves)
-- We reuse `behavior_events` but ensure we can query it efficiently.
CREATE INDEX IF NOT EXISTS idx_behavior_action ON public.behavior_events(user_id, action_type);

COMMIT;
