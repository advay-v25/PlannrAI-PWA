-- Fix: Add ON DELETE CASCADE to all FK constraints referencing auth.users
-- This allows deleting users from the Supabase Auth dashboard without FK violations.

-- Helper: Drop and re-add FK constraints with CASCADE
-- We use a safe pattern: drop if exists, then add.

-- 1. profiles (initial schema - already has CASCADE, but let's ensure)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. goals
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_user_id_fkey;
ALTER TABLE goals ADD CONSTRAINT goals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. schedule_blocks
ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_user_id_fkey;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. commitments
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_user_id_fkey;
ALTER TABLE commitments ADD CONSTRAINT commitments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5. brain_dump_entries
ALTER TABLE brain_dump_entries DROP CONSTRAINT IF EXISTS brain_dump_entries_user_id_fkey;
ALTER TABLE brain_dump_entries ADD CONSTRAINT brain_dump_entries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 6. coach_threads
ALTER TABLE coach_threads DROP CONSTRAINT IF EXISTS coach_threads_user_id_fkey;
ALTER TABLE coach_threads ADD CONSTRAINT coach_threads_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 7. coach_messages
ALTER TABLE coach_messages DROP CONSTRAINT IF EXISTS coach_messages_user_id_fkey;
ALTER TABLE coach_messages ADD CONSTRAINT coach_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 8. memory_facts
ALTER TABLE memory_facts DROP CONSTRAINT IF EXISTS memory_facts_user_id_fkey;
ALTER TABLE memory_facts ADD CONSTRAINT memory_facts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 9. weekly_reviews
ALTER TABLE weekly_reviews DROP CONSTRAINT IF EXISTS weekly_reviews_user_id_fkey;
ALTER TABLE weekly_reviews ADD CONSTRAINT weekly_reviews_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 10. habit_stacks
ALTER TABLE habit_stacks DROP CONSTRAINT IF EXISTS habit_stacks_user_id_fkey;
ALTER TABLE habit_stacks ADD CONSTRAINT habit_stacks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 11. daily_logs
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_logs') THEN
        ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_user_id_fkey;
        ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 12. behavior_signals
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'behavior_signals') THEN
        ALTER TABLE behavior_signals DROP CONSTRAINT IF EXISTS behavior_signals_user_id_fkey;
        ALTER TABLE behavior_signals ADD CONSTRAINT behavior_signals_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 13. ai_proposals
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_proposals') THEN
        ALTER TABLE ai_proposals DROP CONSTRAINT IF EXISTS ai_proposals_user_id_fkey;
        ALTER TABLE ai_proposals ADD CONSTRAINT ai_proposals_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 14. profile_preferences
ALTER TABLE profile_preferences DROP CONSTRAINT IF EXISTS profile_preferences_user_id_fkey;
ALTER TABLE profile_preferences ADD CONSTRAINT profile_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 15. session_bindings
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_bindings') THEN
        ALTER TABLE session_bindings DROP CONSTRAINT IF EXISTS session_bindings_user_id_fkey;
        ALTER TABLE session_bindings ADD CONSTRAINT session_bindings_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 16. context_snapshots
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'context_snapshots') THEN
        ALTER TABLE context_snapshots DROP CONSTRAINT IF EXISTS context_snapshots_user_id_fkey;
        ALTER TABLE context_snapshots ADD CONSTRAINT context_snapshots_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 17. schedule_versions
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_versions') THEN
        ALTER TABLE schedule_versions DROP CONSTRAINT IF EXISTS schedule_versions_user_id_fkey;
        ALTER TABLE schedule_versions ADD CONSTRAINT schedule_versions_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 18. habit_logs
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'habit_logs') THEN
        ALTER TABLE habit_logs DROP CONSTRAINT IF EXISTS habit_logs_user_id_fkey;
        ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 19. interventions
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interventions') THEN
        ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_user_id_fkey;
        ALTER TABLE interventions ADD CONSTRAINT interventions_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 20. context_graph
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'context_graph') THEN
        ALTER TABLE context_graph DROP CONSTRAINT IF EXISTS context_graph_user_id_fkey;
        ALTER TABLE context_graph ADD CONSTRAINT context_graph_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 21. audit_logs (SET NULL is fine here - we want to keep audit trail)
-- No change needed for audit_logs
