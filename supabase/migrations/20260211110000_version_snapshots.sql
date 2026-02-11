-- Migration: Add snapshot/patch columns to schedule_versions
-- Adds missing fields required for robust undo/redo and audit trails

ALTER TABLE schedule_versions
  ADD COLUMN IF NOT EXISTS patch_json JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_before JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_after JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS request_id UUID DEFAULT gen_random_uuid();

-- Add index on request_id for debugging lookups
CREATE INDEX IF NOT EXISTS idx_schedule_versions_request_id ON schedule_versions(request_id);
