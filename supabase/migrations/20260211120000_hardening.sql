-- Supabase Hardening Migration (2026-02-11)
-- Enforces strict RLS, creates missing tables/buckets, and cleans up policies.

BEGIN;

-- 1. AI Audit Log (Create if missing)
CREATE TABLE IF NOT EXISTS public.ai_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd NUMERIC(10, 6),
    latency_ms INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user_created ON public.ai_audit_log(user_id, created_at DESC);

-- 2. Storage Bucket: bio_scans
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bio_scans', 'bio_scans', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']) -- 10MB limit
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 3. RLS Hardening
-- We will loop through tables, enable RLS, drop old policies, and add strictly scoped policies.

DO $$
DECLARE
    tables text[] := ARRAY[
        'goals', 'schedule_blocks', 'schedule_versions', 
        'commitments', 'coach_threads', 'coach_messages', 
        'brain_dumps', 'brain_dump_extractions', 'user_state', 
        'ai_audit_log', 'conversations', 'conversation_messages', 'memory_facts'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Check if table exists before operating
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            
            -- Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            
            -- Drop existing policies (Broad cleanup to prevent conflicts/duplicates)
            -- We assume we want to standardise on "Users can manage own [table]"
            BEGIN
                EXECUTE format('DROP POLICY IF EXISTS "Users can manage own %I" ON public.%I', t, t);
                EXECUTE format('DROP POLICY IF EXISTS "Users manage own %I" ON public.%I', t, t);
                EXECUTE format('DROP POLICY IF EXISTS "User select own %I" ON public.%I', t, t);
                EXECUTE format('DROP POLICY IF EXISTS "User insert own %I" ON public.%I', t, t);
                EXECUTE format('DROP POLICY IF EXISTS "User update own %I" ON public.%I', t, t);
                EXECUTE format('DROP POLICY IF EXISTS "User delete own %I" ON public.%I', t, t);
            EXCEPTION WHEN OTHERS THEN
                -- Ignore drop errors
            END;

            -- Create Standard Policy (All operations allowed for owner)
            EXECUTE format('
                CREATE POLICY "Users can manage own %I" ON public.%I
                FOR ALL
                USING (auth.uid() = user_id)
                WITH CHECK (auth.uid() = user_id)
            ', t, t);
            
        END IF;
    END LOOP;
END $$;

-- 4. Storage RLS for bio_scans
-- Enable RLS on objects (global, idempotent)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for bio_scans
DROP POLICY IF EXISTS "Users can upload own bio scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own bio scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own bio scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own bio scans" ON storage.objects;

-- Create strict policies
CREATE POLICY "Users can upload own bio scans" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bio_scans' AND auth.uid() = owner);

CREATE POLICY "Users can view own bio scans" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'bio_scans' AND auth.uid() = owner);

CREATE POLICY "Users can update own bio scans" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'bio_scans' AND auth.uid() = owner);

CREATE POLICY "Users can delete own bio scans" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'bio_scans' AND auth.uid() = owner);

COMMIT;
