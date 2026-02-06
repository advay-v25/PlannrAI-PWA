
-- Phase 5: Memory System (Conversations & Facts)

-- 1. Conversations (Sessions)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('coach', 'brain_dump')),
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Messages (History)
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- e.g. { intent: 'schedule', patch_run_id: '...' }
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Memory Facts (Long-term Knowledge)
CREATE TABLE IF NOT EXISTS memory_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('preference', 'pattern', 'constraint', 'identity')),
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    source_event_id UUID, -- link to behavior_event or conversation
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON conversation_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_facts_user ON memory_facts(user_id);

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;

do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'conversations' and policyname = 'Users can manage their own conversations') then
        CREATE POLICY "Users can manage their own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where tablename = 'conversation_messages' and policyname = 'Users can manage their own messages') then
        CREATE POLICY "Users can manage their own messages" ON conversation_messages FOR ALL USING (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where tablename = 'memory_facts' and policyname = 'Users can manage their own memory facts') then
        CREATE POLICY "Users can manage their own memory facts" ON memory_facts FOR ALL USING (auth.uid() = user_id);
    end if;
end
$$;
