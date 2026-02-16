-- Home Page Rebuild - Mission Control Schema

-- 1. Habit Stacks (Routines)
CREATE TABLE IF NOT EXISTS public.habit_stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { title, minutes, ... }
  preferred_window TEXT CHECK (preferred_window IN ('morning', 'afternoon', 'evening', 'any')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Task Items (Subtasks for Schedule Blocks)
CREATE TABLE IF NOT EXISTS public.task_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_block_id UUID REFERENCES public.schedule_blocks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  order_index INTEGER DEFAULT 0,
  est_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User State (Ensure it exists for Energy/Emotion)
CREATE TABLE IF NOT EXISTS public.user_states (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  energy_level INTEGER DEFAULT 3 CHECK (energy_level BETWEEN 1 AND 5),
  emotional_state TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies

-- Habit Stacks
ALTER TABLE public.habit_stacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own habit stacks" ON public.habit_stacks;
CREATE POLICY "Users can manage own habit stacks" ON public.habit_stacks
  FOR ALL USING (auth.uid() = user_id);

-- Task Items
ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own task items" ON public.task_items;
CREATE POLICY "Users can manage own task items" ON public.task_items
  FOR ALL USING (auth.uid() = user_id);

-- User States
ALTER TABLE public.user_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own state" ON public.user_states;
CREATE POLICY "Users can manage own state" ON public.user_states
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_habit_stacks_user ON public.habit_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_task_items_user_block ON public.task_items(user_id, schedule_block_id);
