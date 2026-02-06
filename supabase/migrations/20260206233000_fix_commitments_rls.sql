
-- 1. Create table if not exists (Idempotent)
CREATE TABLE IF NOT EXISTS public.commitments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL, -- HH:MM
    end_time TEXT NOT NULL,   -- HH:MM
    days_of_week INTEGER[] NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for performance
CREATE INDEX IF NOT EXISTS idx_commitments_user_id ON public.commitments(user_id);

-- 3. Enable RLS
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Drop first to avoid conflicts/dupes)
DROP POLICY IF EXISTS "Users can view own commitments" ON public.commitments;
DROP POLICY IF EXISTS "Users can insert own commitments" ON public.commitments;
DROP POLICY IF EXISTS "Users can update own commitments" ON public.commitments;
DROP POLICY IF EXISTS "Users can delete own commitments" ON public.commitments;

-- SELECT
CREATE POLICY "Users can view own commitments" ON public.commitments
    FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT
CREATE POLICY "Users can insert own commitments" ON public.commitments
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE
CREATE POLICY "Users can update own commitments" ON public.commitments
    FOR UPDATE
    USING (auth.uid() = user_id);

-- DELETE
CREATE POLICY "Users can delete own commitments" ON public.commitments
    FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Grant Permissions to authenticated role
GRANT ALL ON public.commitments TO authenticated;
GRANT ALL ON public.commitments TO service_role;
