-- Feature Audit Stabilization Migration
-- 1. Enhance Todos with Due Date and Priority
ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

-- Add check constraint for priority if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'todos_priority_check') THEN
        ALTER TABLE todos ADD CONSTRAINT todos_priority_check CHECK (priority IN ('low', 'medium', 'high'));
    END IF;
END $$;

-- 2. Enhance Coach Messages Mode constraint
-- First drop the old constraint
ALTER TABLE coach_messages DROP CONSTRAINT IF EXISTS coach_messages_mode_check;

-- Add updated constraint matching CoachMode type
ALTER TABLE coach_messages ADD CONSTRAINT coach_messages_mode_check 
    CHECK (mode IN ('execute', 'propose', 'ask', 'refuse', 'choice', 'refusal', 'executed', 'acknowledge', 'clarify'));

-- 3. Ensure Coach Conversations has necessary fields for persistence tracking
ALTER TABLE coach_conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 4. Index for due dates
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
