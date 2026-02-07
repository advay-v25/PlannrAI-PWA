-- DEEP SYSTEM HARDENING (2026-02-07)
-- Fixes all identified "Soft FK" issues where tables referenced public.profiles instead of auth.users.
-- Ensures robustness against missing profile rows.

BEGIN;

-- 1. FIX ROUTINES & SCANS ENGINE
-- These tables were created in 20260204120000_routines_engine.sql with references to profiles(id).
-- We must retarget them to auth.users(id) to prevent crashes if profile is missing.

-- 1a. scan_sessions
ALTER TABLE public.scan_sessions DROP CONSTRAINT IF EXISTS scan_sessions_user_id_fkey;
ALTER TABLE public.scan_sessions 
    ADD CONSTRAINT scan_sessions_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 1b. routine_recommendations
ALTER TABLE public.routine_recommendations DROP CONSTRAINT IF EXISTS routine_recommendations_user_id_fkey;
ALTER TABLE public.routine_recommendations 
    ADD CONSTRAINT routine_recommendations_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 2. ENSURE PROFILE ROBUSTNESS
-- Ensure the profile table itself has the correct constraints/defaults
ALTER TABLE public.profiles 
    ALTER COLUMN onboarding_complete SET DEFAULT false;

-- 3. ENSURE IDEMPOTENCY FOR ANCHORS (Just in case Master Fix wasn't run)
-- (This duplicate is safe because of IF NOT EXISTS checks in the previous script, but good to double-seal here)
ALTER TABLE public.commitments DROP CONSTRAINT IF EXISTS commitments_user_id_fkey;
ALTER TABLE public.commitments 
    ADD CONSTRAINT commitments_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

COMMIT;
