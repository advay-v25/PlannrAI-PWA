-- 1. Fix schedule_blocks -> habit_stacks
ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_habit_stack_id_fkey;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_habit_stack_id_fkey 
    FOREIGN KEY (habit_stack_id) REFERENCES habit_stacks(id) ON DELETE SET NULL;

-- 2. Fix schedule_blocks -> commitments
ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_commitment_id_fkey;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_commitment_id_fkey 
    FOREIGN KEY (commitment_id) REFERENCES commitments(id) ON DELETE SET NULL;

-- 3. Fix patch_runs -> schedule_versions (Corrected Table Name)
ALTER TABLE patch_runs DROP CONSTRAINT IF EXISTS patch_runs_schedule_version_id_fkey;
ALTER TABLE patch_runs ADD CONSTRAINT patch_runs_schedule_version_id_fkey 
    FOREIGN KEY (schedule_version_id) REFERENCES schedule_versions(id) ON DELETE CASCADE;

-- 4. Fix coach_learnings -> coach_conversations
ALTER TABLE coach_learnings DROP CONSTRAINT IF EXISTS coach_learnings_conversation_id_fkey;
ALTER TABLE coach_learnings ADD CONSTRAINT coach_learnings_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES coach_conversations(id) ON DELETE CASCADE;

-- 5. Fix coach_messages -> schedule_versions
ALTER TABLE coach_messages DROP CONSTRAINT IF EXISTS coach_messages_patch_version_id_fkey;
ALTER TABLE coach_messages ADD CONSTRAINT coach_messages_patch_version_id_fkey 
    FOREIGN KEY (patch_version_id) REFERENCES schedule_versions(id) ON DELETE SET NULL;
