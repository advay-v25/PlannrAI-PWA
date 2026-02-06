-- Routines + Scans Engine Schema

-- Scan Sessions Table
CREATE TABLE IF NOT EXISTS public.scan_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    store_mode TEXT NOT NULL CHECK (store_mode IN ('signals_only', 'store_image')),
    image_url TEXT, -- Nullable if signals_only
    
    signals JSONB DEFAULT '[]'::jsonb, -- Extracted features
    confidence_score FLOAT DEFAULT 0.0,
    readable BOOLEAN DEFAULT false,
    notes TEXT
);

-- Routine Recommendations Table
CREATE TABLE IF NOT EXISTS public.routine_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    routine_type TEXT NOT NULL CHECK (routine_type IN ('morning', 'night', 'workout')),
    source TEXT NOT NULL CHECK (source IN ('scan', 'context', 'mixed')),
    
    routine JSONB NOT NULL, -- Full routine contract
    accepted BOOLEAN DEFAULT false,
    calendar_event_id UUID REFERENCES public.schedule_blocks(id) ON DELETE SET NULL
);

-- RLS Policies
ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_recommendations ENABLE ROW LEVEL SECURITY;

do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'scan_sessions' and policyname = 'Users can manage own scans') then
        CREATE POLICY "Users can manage own scans" ON public.scan_sessions FOR ALL USING (auth.uid() = user_id);
    end if;
    if not exists (select 1 from pg_policies where tablename = 'routine_recommendations' and policyname = 'Users can manage own routines') then
        CREATE POLICY "Users can manage own routines" ON public.routine_recommendations FOR ALL USING (auth.uid() = user_id);
    end if;
end
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scan_sessions_user ON public.scan_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_recs_user ON public.routine_recommendations(user_id, created_at DESC);
