-- patch_runs table for unified undo/redo log
CREATE TABLE IF NOT EXISTS patch_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL, -- 'ai_assist', 'reality_intake', 'weekly_review', etc.
    patch JSONB NOT NULL,
    inverse_patch JSONB, -- Optional, if we can compute it
    schedule_version_id UUID REFERENCES schedule_versions(id), -- Link to a snapshot if calendar was touched
    applied BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup of last run
CREATE INDEX IF NOT EXISTS idx_patch_runs_user_created ON patch_runs(user_id, created_at DESC);

-- RLS
ALTER TABLE patch_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'patch_runs' 
        AND policyname = 'Users can manage their own patch runs'
    ) THEN
        CREATE POLICY "Users can manage their own patch runs"
            ON patch_runs FOR ALL
            USING (auth.uid() = user_id);
    END IF;
END
$$;
