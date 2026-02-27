-- PlannrAI V1.5 Revolution Migration
-- Adds AI Coach, Brain Dump, Weekly Review, and Personal Rules tables

-- ==========================================
-- SECTION 5: AI COACH SYSTEM
-- ==========================================

DROP TABLE IF EXISTS coach_learnings CASCADE;
DROP TABLE IF EXISTS coach_messages CASCADE;
DROP TABLE IF EXISTS coach_conversations CASCADE;

CREATE TABLE IF NOT EXISTS coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  topic TEXT,
  context JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action_proposed JSONB,
  action_status TEXT CHECK (action_status IN ('pending', 'accepted', 'rejected', 'executed'))
);

CREATE TABLE IF NOT EXISTS coach_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES coach_conversations(id),
  learning TEXT NOT NULL,
  confidence_score NUMERIC(3,2) NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_active ON coach_conversations(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coach_messages_conversation ON coach_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coach_learnings_user ON coach_learnings(user_id);


-- ==========================================
-- SECTION 6: BRAIN DUMP SYSTEM
-- ==========================================

DROP TABLE IF EXISTS brain_dump_items CASCADE;
DROP TABLE IF EXISTS brain_dumps CASCADE;
DROP TABLE IF EXISTS potential_goals CASCADE;
DROP TABLE IF EXISTS user_playbook CASCADE;

CREATE TABLE IF NOT EXISTS brain_dumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  extracted_items JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_dump_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_dump_id UUID NOT NULL REFERENCES brain_dumps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  entities JSONB DEFAULT '{}',
  action_taken TEXT,
  action_result JSONB,
  schedule_block_id UUID REFERENCES schedule_blocks(id),
  goal_id UUID REFERENCES goals(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'actioned', 'dismissed', 'deferred')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actioned_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS potential_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pillar TEXT,
  mention_count INTEGER NOT NULL DEFAULT 1,
  first_mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source_items JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'dismissed', 'deferred')),
  goal_id UUID REFERENCES goals(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  insight TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'general', 'productivity', 'energy', 'scheduling', 
    'motivation', 'habits', 'mindset'
  )),
  source TEXT NOT NULL DEFAULT 'brain_dump' CHECK (source IN ('brain_dump', 'weekly_review', 'coach', 'system')),
  source_id UUID,
  tags TEXT[] DEFAULT '{}',
  pillar TEXT,
  times_surfaced INTEGER NOT NULL DEFAULT 0,
  last_surfaced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_dumps_user ON brain_dumps(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_dump_items_user_pending ON brain_dump_items(user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_potential_goals_user ON potential_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_playbook_user ON user_playbook(user_id);


-- ==========================================
-- SECTION 7 & 8: WEEKLY REVIEW & SETTINGS
-- ==========================================

DROP TABLE IF EXISTS weekly_review_data CASCADE;
DROP TABLE IF EXISTS personal_rules CASCADE;
DROP TABLE IF EXISTS weekly_reviews CASCADE;

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_blocks INTEGER NOT NULL DEFAULT 0,
  completed_blocks INTEGER NOT NULL DEFAULT 0,
  skipped_blocks INTEGER NOT NULL DEFAULT 0,
  completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  mind_completion_percent NUMERIC(5,2),
  body_completion_percent NUMERIC(5,2),
  craft_completion_percent NUMERIC(5,2),
  completion_by_day JSONB,
  ai_patterns JSONB,
  ai_suggestions JSONB,
  what_worked TEXT,
  challenges TEXT,
  changes_for_next_week TEXT,
  overall_energy TEXT CHECK (overall_energy IN ('low', 'okay', 'good', 'great')),
  energy_factors TEXT[],
  saved_rules JSONB,
  schedule_changes_applied JSONB,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_review_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('emotion', 'energy', 'win', 'frustration', 'insight', 'skip_reason')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'brain_dump',
  source_id UUID,
  associated_block_id UUID REFERENCES schedule_blocks(id),
  associated_goal_id UUID REFERENCES goals(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('scheduling', 'energy', 'productivity', 'habit', 'mindset')),
  source_review_id UUID REFERENCES weekly_reviews(id),
  applies_to_pillar TEXT,
  applies_to_day TEXT,
  applies_to_time_range TEXT,
  is_hard_rule BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  times_applied INTEGER NOT NULL DEFAULT 0,
  times_violated INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON weekly_reviews(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_review_data_user_week ON weekly_review_data(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_personal_rules_user_active ON personal_rules(user_id, is_active) WHERE is_active = true;
