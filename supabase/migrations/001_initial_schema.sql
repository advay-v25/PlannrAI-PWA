-- PlannrAI Database Schema
-- Run this in Supabase SQL Editor or use supabase db push

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Time & Constraints
  timezone TEXT DEFAULT 'UTC',
  sleep_start TIME DEFAULT '22:00',
  sleep_end TIME DEFAULT '07:00',
  
  -- Baseline State
  energy_level INTEGER DEFAULT 3 CHECK (energy_level BETWEEN 1 AND 5),
  stress_level INTEGER DEFAULT 3 CHECK (stress_level BETWEEN 1 AND 5),
  
  -- AI Permissions
  ai_can_suggest BOOLEAN DEFAULT true,
  ai_can_analyze BOOLEAN DEFAULT true,
  ai_can_draft BOOLEAN DEFAULT true,
  
  -- State
  onboarding_complete BOOLEAN DEFAULT false,
  low_energy_mode BOOLEAN DEFAULT false
);

-- Goals (Mind / Body / Future)
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mind', 'body', 'future')),
  minutes_per_day INTEGER DEFAULT 30 CHECK (minutes_per_day > 0),
  importance TEXT DEFAULT 'medium' CHECK (importance IN ('low', 'medium', 'high')),
  is_paused BOOLEAN DEFAULT false
);

-- Fixed Commitments (work, school, etc.)
CREATE TABLE IF NOT EXISTS public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  day_of_week INTEGER[] DEFAULT '{}', -- 0=Sun, 6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- Schedule Blocks (Calendar entries)
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'partial', 'missed')),
  context TEXT, -- Optional user note
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain Dumps
CREATE TABLE IF NOT EXISTS public.brain_dumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  content TEXT NOT NULL,
  
  -- AI-extracted data (invisible to user)
  extracted_signals JSONB DEFAULT '[]'::jsonb,
  detected_constraints JSONB DEFAULT '[]'::jsonb
);

-- Coach Interactions
CREATE TABLE IF NOT EXISTS public.coach_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  user_message TEXT,
  coach_response JSONB, -- {facts, interpretation, options, permission_check}
  user_action TEXT -- what the user chose to do
);

-- Weekly Reviews
CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  planned_minutes INTEGER DEFAULT 0,
  actual_minutes INTEGER DEFAULT 0,
  energy_trend TEXT CHECK (energy_trend IN ('improving', 'stable', 'declining')),
  stress_trend TEXT CHECK (stress_trend IN ('improving', 'stable', 'increasing')),
  friction_patterns JSONB DEFAULT '[]'::jsonb,
  suggested_adjustment TEXT,
  
  user_response TEXT CHECK (user_response IN ('accepted', 'edited', 'ignored')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, week_start)
);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_dumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only access their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Goals: Users can only access their own goals
CREATE POLICY "Users can manage own goals" ON public.goals
  FOR ALL USING (auth.uid() = user_id);

-- Commitments: Users can only access their own commitments
CREATE POLICY "Users can manage own commitments" ON public.commitments
  FOR ALL USING (auth.uid() = user_id);

-- Schedule Blocks: Users can only access their own blocks
CREATE POLICY "Users can manage own schedule blocks" ON public.schedule_blocks
  FOR ALL USING (auth.uid() = user_id);

-- Brain Dumps: Users can only access their own dumps
CREATE POLICY "Users can manage own brain dumps" ON public.brain_dumps
  FOR ALL USING (auth.uid() = user_id);

-- Coach Interactions: Users can only access their own interactions
CREATE POLICY "Users can manage own coach interactions" ON public.coach_interactions
  FOR ALL USING (auth.uid() = user_id);

-- Weekly Reviews: Users can only access their own reviews
CREATE POLICY "Users can manage own weekly reviews" ON public.weekly_reviews
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_category ON public.goals(category);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_user_date ON public.schedule_blocks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_status ON public.schedule_blocks(status);
CREATE INDEX IF NOT EXISTS idx_brain_dumps_user_id ON public.brain_dumps(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_dumps_created_at ON public.brain_dumps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_interactions_user_id ON public.coach_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week ON public.weekly_reviews(user_id, week_start);
