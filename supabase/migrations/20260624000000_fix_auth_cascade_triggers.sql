-- Fix for user deletion failing due to permissions
-- The `supabase_auth_admin` role (which handles auth.users deletions) does not have privileges to execute INVOKER triggers that modify `public` tables.
-- Changing these triggers to SECURITY DEFINER ensures they run as the function owner (usually postgres), bypassing RLS and permission errors during user cascades.

ALTER FUNCTION expand_commitment_blocks() SECURITY DEFINER;
ALTER FUNCTION update_goals_updated_at() SECURITY DEFINER;
ALTER FUNCTION update_updated_at() SECURITY DEFINER;
