-- Add updated_at column to goals table for stagnation tracking
alter table goals add column if not exists updated_at timestamptz default now();

-- Update existing rows to have a valid updated_at
update goals set updated_at = created_at where updated_at is null;
