-- Drop old specific coach tables to allow a clean slate for the V2 Coach Schema
DROP TABLE IF EXISTS coach_messages CASCADE;
DROP TABLE IF EXISTS coach_threads CASCADE;
DROP TABLE IF EXISTS coach_conversations CASCADE;
DROP TABLE IF EXISTS coach_learned_preferences CASCADE;
DROP TABLE IF EXISTS coach_proactive_log CASCADE;
DROP TABLE IF EXISTS coach_conversation_summaries CASCADE;

-- 1. CONVERSATIONS TABLE
CREATE TABLE coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Session management
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Context
  initial_intent TEXT, -- First detected intent that started conversation
  primary_topic TEXT, -- 'scheduling' | 'energy' | 'goals' | 'general'
  
  -- Outcome tracking
  actions_taken INTEGER DEFAULT 0, -- How many patches were applied
  user_satisfaction TEXT CHECK (user_satisfaction IN ('helpful', 'not_helpful', 'neutral')),
  
  -- Metadata
  total_messages INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active conversations
CREATE INDEX idx_coach_conversations_user_active 
  ON coach_conversations(user_id, last_message_at DESC) 
  WHERE status = 'active';

-- Index for analytics
CREATE INDEX idx_coach_conversations_resolved 
  ON coach_conversations(user_id, resolved_at DESC) 
  WHERE status = 'resolved';


-- 2. MESSAGES TABLE
CREATE TABLE coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- For assistant messages: structured data
  intent TEXT, -- Detected intent
  confidence NUMERIC(3,2), -- 0.00 to 1.00
  mode TEXT CHECK (mode IN ('execute', 'propose', 'clarify', 'acknowledge')),
  
  -- Options generated (for assistant messages)
  options JSONB, -- Array of option objects with patches
  
  -- Applied action tracking
  selected_option_id TEXT, -- Which option user chose
  patch_applied JSONB, -- The actual patch that was applied
  patch_applied_at TIMESTAMP WITH TIME ZONE,
  patch_version_id UUID REFERENCES schedule_versions(id), -- For undo
  
  -- System messages (proactive suggestions)
  is_proactive BOOLEAN DEFAULT false,
  proactive_trigger TEXT, -- 'overload' | 'energy_mismatch' | 'missed_blocks'
  dismissed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for conversation retrieval (last 15 messages)
CREATE INDEX idx_coach_messages_conversation 
  ON coach_messages(conversation_id, created_at DESC);

-- Index for proactive message cleanup
CREATE INDEX idx_coach_messages_proactive 
  ON coach_messages(user_id, is_proactive, dismissed_at) 
  WHERE is_proactive = true;


-- 3. LEARNED PREFERENCES TABLE
CREATE TABLE coach_learned_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Preference details
  category TEXT NOT NULL CHECK (category IN (
    'time_preference',     -- "I hate mornings"
    'buffer_preference',   -- "I need 30min buffers"
    'pillar_scheduling',   -- "Deep work after lunch only"
    'energy_pattern',      -- "I'm most productive 9-11am"
    'avoidance',          -- "Never schedule gym on Fridays"
    'intensity',          -- "I prefer lighter Mondays"
    'general'             -- Other preferences
  )),
  
  preference_key TEXT NOT NULL,   -- e.g., "morning_work_preference"
  preference_value JSONB NOT NULL, -- e.g., {"avoid": true, "reason": "low energy"}
  
  natural_language TEXT NOT NULL, -- Human-readable: "User hates mornings"
  
  -- Source tracking
  learned_from_conversation_id UUID REFERENCES coach_conversations(id),
  learned_from_message_id UUID REFERENCES coach_messages(id),
  learned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Usage tracking
  times_applied INTEGER DEFAULT 0,
  last_applied_at TIMESTAMP WITH TIME ZONE,
  
  -- User control
  is_active BOOLEAN DEFAULT true,
  user_confirmed BOOLEAN DEFAULT false, -- Did user explicitly confirm this preference?
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, preference_key)
);

-- Index for active preferences lookup
CREATE INDEX idx_coach_preferences_active 
  ON coach_learned_preferences(user_id, category, is_active) 
  WHERE is_active = true;


-- 4. PROACTIVE SUGGESTIONS LOG
CREATE TABLE coach_proactive_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'overload_tomorrow',
    'overload_this_week',
    'energy_mismatch',
    'consecutive_misses',
    'empty_weekend',
    'goal_behind'
  )),
  
  trigger_data JSONB NOT NULL, -- Context that triggered suggestion
  
  shown_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  dismissed_at TIMESTAMP WITH TIME ZONE,
  acted_upon_at TIMESTAMP WITH TIME ZONE,
  
  message_id UUID REFERENCES coach_messages(id), -- The proactive message created
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for rate limiting (max 2 proactive suggestions per day)
CREATE INDEX idx_coach_proactive_daily 
  ON coach_proactive_log(user_id, shown_at DESC);

-- Function to check if proactive suggestion allowed
CREATE OR REPLACE FUNCTION can_show_proactive_suggestion(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  today_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO today_count
  FROM coach_proactive_log
  WHERE user_id = p_user_id
    AND shown_at >= NOW() - INTERVAL '24 hours'
    AND dismissed_at IS NULL;
  
  RETURN today_count < 2;
END;
$$ LANGUAGE plpgsql;


-- 5. CONVERSATION SUMMARIES
CREATE TABLE coach_conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  conversation_id UUID REFERENCES coach_conversations(id) ON DELETE SET NULL,
  
  summary TEXT NOT NULL, -- AI-generated summary of the conversation
  key_intents TEXT[], -- Array of main intents discussed
  preferences_learned INTEGER DEFAULT 0, -- How many preferences extracted
  actions_completed INTEGER DEFAULT 0, -- How many patches applied
  
  conversation_date DATE NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for preference mining
CREATE INDEX idx_coach_summaries_user_date 
  ON coach_conversation_summaries(user_id, conversation_date DESC);


-- 6. RLS POLICIES
-- Conversations
ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_conversations_user_policy ON coach_conversations
  FOR ALL USING (auth.uid() = user_id);

-- Messages
ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_messages_user_policy ON coach_messages
  FOR ALL USING (auth.uid() = user_id);

-- Learned Preferences
ALTER TABLE coach_learned_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_preferences_user_policy ON coach_learned_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Proactive Log
ALTER TABLE coach_proactive_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_proactive_user_policy ON coach_proactive_log
  FOR ALL USING (auth.uid() = user_id);

-- Summaries
ALTER TABLE coach_conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_summaries_user_policy ON coach_conversation_summaries
  FOR ALL USING (auth.uid() = user_id);


-- 7. CLEANUP FUNCTIONS
-- Archive old conversations (older than 30 days)
CREATE OR REPLACE FUNCTION archive_old_conversations()
RETURNS void AS $$
BEGIN
  UPDATE coach_conversations
  SET status = 'archived'
  WHERE status = 'active'
    AND last_message_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Delete very old messages (keep summaries only after 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM coach_messages
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND conversation_id IN (
      SELECT id FROM coach_conversations WHERE status = 'archived'
    );
END;
$$ LANGUAGE plpgsql;
