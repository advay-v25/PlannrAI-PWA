-- Phase 6: Core Protection
-- Add 'routine' to the allowed block_types for schedule_blocks

ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_block_type_check;

ALTER TABLE public.schedule_blocks
ADD CONSTRAINT schedule_blocks_block_type_check
CHECK (block_type IN ('anchor', 'goal', 'meal', 'buffer', 'routine'));
