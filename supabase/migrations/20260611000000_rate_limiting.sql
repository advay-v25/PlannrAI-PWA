-- System-Wide Rate Limiting Infrastructure
-- Stores sliding window rate limit tokens per key (e.g. user_id:endpoint)

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key text PRIMARY KEY,
    points integer DEFAULT 1,
    reset_time timestamptz NOT NULL
);

-- RPC for atomic rate limit checking and incrementing
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key text,
    p_limit integer,
    p_window_interval interval
) RETURNS boolean AS $$
DECLARE
    v_current_points integer;
    v_reset_time timestamptz;
BEGIN
    -- Clean up old records probabilistically or on demand.
    -- (Doing it synchronously here keeps the table small, but can be optimized later if needed)
    DELETE FROM public.rate_limits WHERE reset_time < now();

    -- Insert or update
    INSERT INTO public.rate_limits (key, points, reset_time)
    VALUES (p_key, 1, now() + p_window_interval)
    ON CONFLICT (key) DO UPDATE
    SET points = CASE 
            WHEN public.rate_limits.reset_time < now() THEN 1 
            ELSE public.rate_limits.points + 1 
        END,
        reset_time = CASE 
            WHEN public.rate_limits.reset_time < now() THEN now() + p_window_interval 
            ELSE public.rate_limits.reset_time 
        END
    RETURNING points, reset_time INTO v_current_points, v_reset_time;

    IF v_current_points > p_limit THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
