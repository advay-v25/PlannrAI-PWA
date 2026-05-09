-- Cascade Delete Final Fix Migration
-- Automatically drops and re-adds all blocked foreign key constraints referencing core tables with ON DELETE CASCADE or ON DELETE SET NULL.
-- This guarantees that deleting any user from the Supabase Auth dashboard cascades perfectly without constraint violations.

-- 1. brain_dump_items (goal_id) -> goals (id)
ALTER TABLE brain_dump_items DROP CONSTRAINT IF EXISTS brain_dump_items_goal_id_fkey;
ALTER TABLE brain_dump_items ADD CONSTRAINT brain_dump_items_goal_id_fkey 
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE;

-- 2. brain_dump_items (schedule_block_id) -> schedule_blocks (id)
ALTER TABLE brain_dump_items DROP CONSTRAINT IF EXISTS brain_dump_items_schedule_block_id_fkey;
ALTER TABLE brain_dump_items ADD CONSTRAINT brain_dump_items_schedule_block_id_fkey 
  FOREIGN KEY (schedule_block_id) REFERENCES schedule_blocks(id) ON DELETE CASCADE;

-- 3. coach_learned_preferences (learned_from_conversation_id) -> coach_conversations (id)
ALTER TABLE coach_learned_preferences DROP CONSTRAINT IF EXISTS coach_learned_preferences_learned_from_conversation_id_fkey;
ALTER TABLE coach_learned_preferences ADD CONSTRAINT coach_learned_preferences_learned_from_conversation_id_fkey 
  FOREIGN KEY (learned_from_conversation_id) REFERENCES coach_conversations(id) ON DELETE SET NULL;

-- 4. coach_learned_preferences (learned_from_message_id) -> coach_messages (id)
ALTER TABLE coach_learned_preferences DROP CONSTRAINT IF EXISTS coach_learned_preferences_learned_from_message_id_fkey;
ALTER TABLE coach_learned_preferences ADD CONSTRAINT coach_learned_preferences_learned_from_message_id_fkey 
  FOREIGN KEY (learned_from_message_id) REFERENCES coach_messages(id) ON DELETE SET NULL;

-- 5. coach_messages (patch_version_id) -> schedule_versions (id)
ALTER TABLE coach_messages DROP CONSTRAINT IF EXISTS coach_messages_patch_version_id_fkey;
ALTER TABLE coach_messages ADD CONSTRAINT coach_messages_patch_version_id_fkey 
  FOREIGN KEY (patch_version_id) REFERENCES schedule_versions(id) ON DELETE SET NULL;

-- 6. coach_proactive_log (message_id) -> coach_messages (id)
ALTER TABLE coach_proactive_log DROP CONSTRAINT IF EXISTS coach_proactive_log_message_id_fkey;
ALTER TABLE coach_proactive_log ADD CONSTRAINT coach_proactive_log_message_id_fkey 
  FOREIGN KEY (message_id) REFERENCES coach_messages(id) ON DELETE SET NULL;

-- 7. personal_rules (source_review_id) -> weekly_reviews (id)
ALTER TABLE personal_rules DROP CONSTRAINT IF EXISTS personal_rules_source_review_id_fkey;
ALTER TABLE personal_rules ADD CONSTRAINT personal_rules_source_review_id_fkey 
  FOREIGN KEY (source_review_id) REFERENCES weekly_reviews(id) ON DELETE CASCADE;

-- 8. potential_goals (goal_id) -> goals (id)
ALTER TABLE potential_goals DROP CONSTRAINT IF EXISTS potential_goals_goal_id_fkey;
ALTER TABLE potential_goals ADD CONSTRAINT potential_goals_goal_id_fkey 
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE;

-- 9. weekly_review_data (associated_block_id) -> schedule_blocks (id)
ALTER TABLE weekly_review_data DROP CONSTRAINT IF EXISTS weekly_review_data_associated_block_id_fkey;
ALTER TABLE weekly_review_data ADD CONSTRAINT weekly_review_data_associated_block_id_fkey 
  FOREIGN KEY (associated_block_id) REFERENCES schedule_blocks(id) ON DELETE CASCADE;

-- 10. weekly_review_data (associated_goal_id) -> goals (id)
ALTER TABLE weekly_review_data DROP CONSTRAINT IF EXISTS weekly_review_data_associated_goal_id_fkey;
ALTER TABLE weekly_review_data ADD CONSTRAINT weekly_review_data_associated_goal_id_fkey 
  FOREIGN KEY (associated_goal_id) REFERENCES goals(id) ON DELETE CASCADE;

-- 11. intervention_logs (user_id) -> auth.users (id)
ALTER TABLE intervention_logs DROP CONSTRAINT IF EXISTS intervention_logs_user_id_fkey;
ALTER TABLE intervention_logs ADD CONSTRAINT intervention_logs_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 12. user_context (user_id) -> auth.users (id)
ALTER TABLE user_context DROP CONSTRAINT IF EXISTS user_context_user_id_fkey;
ALTER TABLE user_context ADD CONSTRAINT user_context_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

