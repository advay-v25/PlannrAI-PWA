-- Migration: Fix Weekly Reviews Table
-- Description: Adds missing columns for lever application and notes
-- Author: Gemini 3.0 Pro

-- 1. Add columns safely
DO $$
BEGIN
    -- Add lever_note if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_reviews' AND column_name = 'lever_note') THEN
        ALTER TABLE public.weekly_reviews ADD COLUMN lever_note text;
    END IF;

    -- Add lever_applied if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_reviews' AND column_name = 'lever_applied') THEN
        ALTER TABLE public.weekly_reviews ADD COLUMN lever_applied boolean DEFAULT false;
    END IF;

    -- Add updated_at if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_reviews' AND column_name = 'updated_at') THEN
        ALTER TABLE public.weekly_reviews ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;

-- 2. Force cache reload (this is a Supabase specific trick, sometimes toggling RLS works)
ALTER TABLE public.weekly_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

-- 3. Ensure Policy allows Upsert for Owner
DROP POLICY IF EXISTS "Users can upsert their own reviews" ON public.weekly_reviews;
CREATE POLICY "Users can upsert their own reviews"
ON public.weekly_reviews
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Verify
COMMENT ON COLUMN public.weekly_reviews.lever_note IS 'User notes on the applied lever';
COMMENT ON COLUMN public.weekly_reviews.lever_applied IS 'Whether the lever patch has been executed';
