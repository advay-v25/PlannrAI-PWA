-- MIGRATION: Schedule Versioning for Undo/Revert
-- Enables snapshot-based undo of schedule changes

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    week_start DATE NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('onboarding', 'ai_optimize', 'manual', 'undo')),
    snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schedule_versions_user_week
    ON public.schedule_versions(user_id, week_start, created_at DESC);

-- RLS
ALTER TABLE public.schedule_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own schedule versions" ON public.schedule_versions;
CREATE POLICY "Users manage own schedule versions" ON public.schedule_versions
    FOR ALL USING (auth.uid() = user_id);

COMMIT;
