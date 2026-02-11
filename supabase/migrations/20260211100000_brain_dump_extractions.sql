-- Phase 3: Brain Dump Extractions Table
-- Stores structured AI extractions from brain dumps

CREATE TABLE IF NOT EXISTS public.brain_dump_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brain_dump_id UUID REFERENCES public.brain_dumps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
    options JSONB DEFAULT '[]'::jsonb,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.brain_dump_extractions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brain_dump_extractions' AND policyname = 'Users can manage own extractions') THEN
        CREATE POLICY "Users can manage own extractions" ON public.brain_dump_extractions
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brain_dump_extractions_user ON public.brain_dump_extractions(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_dump_extractions_created ON public.brain_dump_extractions(created_at DESC);
