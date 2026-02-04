-- Phase 7: Deep Goals & AI Ubiquity
-- Enhancing schema to support AI-generated decompositions

-- 1. Add checklist to schedule_blocks (for AI sub-tasks on a specific block)
ALTER TABLE public.schedule_blocks 
ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;

-- 2. Add ai_strategy to goals (to cache the Expert Plan)
ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS ai_strategy JSONB DEFAULT '{}'::jsonb;

-- 3. Add checklist to commitments (for recurring anchor routine steps)
ALTER TABLE public.commitments
ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
