-- Hardening migration for PatchService and Coach Integration

-- 1. Atomic increment for conversation actions
CREATE OR REPLACE FUNCTION increment_actions_taken(conv_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE coach_conversations
    SET actions_taken = actions_taken + 1,
        updated_at = NOW()
    WHERE id = conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add helpful indexes to patch_runs if not present
CREATE INDEX IF NOT EXISTS idx_patch_runs_applied ON public.patch_runs(applied);
CREATE INDEX IF NOT EXISTS idx_patch_runs_version ON public.patch_runs(schedule_version_id);

-- 3. Ensure Coach Messages can link to patch runs (for history/undo)
-- The column patch_version_id already exists from 20260310161800_coach_schema.sql
-- but let's make it more explicit if needed. It's already there.
