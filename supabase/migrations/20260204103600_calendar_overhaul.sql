-- Phase 2: Calendar Overhaul Migration

-- 1. Create Commitments Table (Level 1: Hard Anchors)
CREATE TABLE IF NOT EXISTS public.commitments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] NOT NULL, -- 0=Sun, 1=Mon, etc.
    is_active BOOLEAN DEFAULT true
);

-- 2. Add RLS Policies for Commitments
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own commitments" ON public.commitments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own commitments" ON public.commitments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own commitments" ON public.commitments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own commitments" ON public.commitments
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Update Profiles for Meal Preferences (Level 2: Human Needs)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS meal_preferences JSONB DEFAULT '{
    "breakfast": "08:00",
    "lunch": "13:00",
    "dinner": "19:00"
}'::jsonb;

-- 4. Add block_type to Schedule Blocks (for Visual Hierarchy)
ALTER TABLE public.schedule_blocks
ADD COLUMN IF NOT EXISTS block_type TEXT DEFAULT 'goal'; -- 'anchor', 'goal', 'meal', 'buffer'

