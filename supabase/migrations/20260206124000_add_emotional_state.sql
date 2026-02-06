-- Add emotional_state to user_states table
ALTER TABLE user_states 
ADD COLUMN IF NOT EXISTS emotional_state text DEFAULT 'coasting';

-- Constraint to ensure valid enum values
ALTER TABLE user_states 
ADD CONSTRAINT check_emotional_state 
CHECK (emotional_state IN ('overwhelmed', 'avoidant', 'coasting', 'focused', 'burnt', 'motivated'));
