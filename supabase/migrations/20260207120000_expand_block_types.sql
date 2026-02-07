-- MIGRATION: Expand Schedule Block Types
-- GOAL: Support advanced AI types like 'sleep', 'flex', and 'wind_down'

BEGIN;

ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_block_type_check;

ALTER TABLE public.schedule_blocks
ADD CONSTRAINT schedule_blocks_block_type_check
CHECK (block_type IN ('anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'));

COMMIT;
