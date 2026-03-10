-- Calendar Operation Logs & AI Usage Logs
-- PRD §4: calendar_operation_logs and ai_usage_logs

-- 1. Calendar Operation Logs
CREATE TABLE IF NOT EXISTS public.calendar_operation_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation text NOT NULL,         -- e.g. 'plan_week', 'optimize_day', 'apply_patch', 'add_block'
    input jsonb DEFAULT '{}',        -- sanitized request body
    output jsonb DEFAULT '{}',       -- sanitized response
    duration_ms integer,             -- how long the operation took
    ai_model text,                   -- e.g. 'openai/gpt-4o-mini'
    used_fallback boolean DEFAULT false, -- whether AI failed and deterministic fallback was used
    source text DEFAULT 'system',    -- 'coach', 'brain_dump', 'calendar', 'system', 'manual'
    error text,                      -- error message if failed
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_ops_user_id ON public.calendar_operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cal_ops_operation ON public.calendar_operation_logs(operation);
CREATE INDEX IF NOT EXISTS idx_cal_ops_created_at ON public.calendar_operation_logs(created_at);

-- RLS
ALTER TABLE public.calendar_operation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own operation logs"
    ON public.calendar_operation_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service can insert operation logs"
    ON public.calendar_operation_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- 2. AI Usage Logs
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model text NOT NULL,              -- e.g. 'openai/gpt-4o-mini'
    prompt_tokens integer DEFAULT 0,
    completion_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    estimated_cost_usd numeric(8, 6) DEFAULT 0,
    purpose text,                     -- 'plan_week', 'optimize_day', 'coach', 'brain_dump'
    latency_ms integer,
    success boolean DEFAULT true,
    error text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON public.ai_usage_logs(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage_logs(created_at);

-- RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own AI usage logs"
    ON public.ai_usage_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service can insert AI usage logs"
    ON public.ai_usage_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- 3. Add actual_start_time and actual_end_time to schedule_blocks (if not present)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'schedule_blocks' AND column_name = 'actual_start_time'
    ) THEN
        ALTER TABLE public.schedule_blocks ADD COLUMN actual_start_time text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'schedule_blocks' AND column_name = 'actual_end_time'
    ) THEN
        ALTER TABLE public.schedule_blocks ADD COLUMN actual_end_time text;
    END IF;
END $$;
