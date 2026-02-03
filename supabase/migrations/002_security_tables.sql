-- Security tables for PlannrAI
-- Run this migration in Supabase SQL Editor

-- ============================================
-- Auth Attempts - Brute force protection
-- ============================================
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  ip_address INET PRIMARY KEY,
  attempts INTEGER DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  last_attempt TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_auth_attempts_blocked 
  ON public.auth_attempts(blocked_until);

-- ============================================
-- Security Audit Log
-- ============================================
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_user 
  ON public.security_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action 
  ON public.security_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip 
  ON public.security_audit_log(ip_address, created_at DESC);

-- Enable RLS
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only service role can access these tables
-- (No user access - server-side only)
CREATE POLICY "Service role only - auth_attempts" ON public.auth_attempts
  FOR ALL USING (false);

CREATE POLICY "Service role only - audit_log" ON public.security_audit_log
  FOR ALL USING (false);

-- ============================================
-- Session Binding - Detect hijacking
-- ============================================
CREATE TABLE IF NOT EXISTS public.session_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  ip_address INET,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_valid BOOLEAN DEFAULT true
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_session_bindings_user 
  ON public.session_bindings(user_id, is_valid);
CREATE INDEX IF NOT EXISTS idx_session_bindings_hash 
  ON public.session_bindings(session_hash);

-- Enable RLS
ALTER TABLE public.session_bindings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users see own sessions" ON public.session_bindings
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- Unique constraint for weekly reviews
-- ============================================
ALTER TABLE public.weekly_reviews 
  ADD CONSTRAINT unique_user_week 
  UNIQUE (user_id, week_start);

-- ============================================
-- Function to clean up old audit logs (keep 90 days)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.security_audit_log 
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to check and block brute force
-- ============================================
CREATE OR REPLACE FUNCTION check_auth_attempt(
  p_ip_address INET
) RETURNS TABLE(is_blocked BOOLEAN, attempts_remaining INTEGER) AS $$
DECLARE
  v_entry auth_attempts%ROWTYPE;
  v_max_attempts INTEGER := 5;
  v_block_duration INTERVAL := '15 minutes';
BEGIN
  -- Get or create entry
  INSERT INTO auth_attempts (ip_address, attempts, last_attempt)
  VALUES (p_ip_address, 1, NOW())
  ON CONFLICT (ip_address) DO UPDATE
  SET 
    attempts = CASE 
      WHEN auth_attempts.last_attempt < NOW() - v_block_duration THEN 1
      ELSE auth_attempts.attempts + 1
    END,
    last_attempt = NOW(),
    blocked_until = CASE
      WHEN auth_attempts.attempts >= v_max_attempts - 1 THEN NOW() + v_block_duration
      ELSE auth_attempts.blocked_until
    END
  RETURNING * INTO v_entry;
  
  -- Check if blocked
  IF v_entry.blocked_until IS NOT NULL AND v_entry.blocked_until > NOW() THEN
    RETURN QUERY SELECT true, 0;
  ELSE
    RETURN QUERY SELECT false, v_max_attempts - v_entry.attempts;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION check_auth_attempt(INET) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_audit_logs() TO service_role;
