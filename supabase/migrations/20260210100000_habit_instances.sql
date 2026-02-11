-- =====================================================
-- PlannrAI Phase 2: Habit Instances
-- Links habit_stacks to schedule_blocks per day
-- =====================================================

CREATE TABLE IF NOT EXISTS habit_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_stack_id UUID REFERENCES habit_stacks(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    schedule_block_id UUID REFERENCES schedule_blocks(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(habit_stack_id, date)
);

CREATE INDEX IF NOT EXISTS idx_habit_instances_user_date
    ON habit_instances(user_id, date);

CREATE INDEX IF NOT EXISTS idx_habit_instances_block
    ON habit_instances(schedule_block_id);

-- RLS
ALTER TABLE habit_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own habit instances" ON habit_instances;
CREATE POLICY "Users can view own habit instances" ON habit_instances
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own habit instances" ON habit_instances;
CREATE POLICY "Users can create own habit instances" ON habit_instances
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own habit instances" ON habit_instances;
CREATE POLICY "Users can update own habit instances" ON habit_instances
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own habit instances" ON habit_instances;
CREATE POLICY "Users can delete own habit instances" ON habit_instances
    FOR DELETE USING (auth.uid() = user_id);
