-- Add lever_action (JSON payload for execution)
ALTER TABLE weekly_reviews 
ADD COLUMN IF NOT EXISTS lever_action JSONB;

-- Rename suggested_adjustment to one_lever_text for clarity (optional, or just comment)
-- Keeping suggested_adjustment for backward compatibility but treating it as "One Lever Text"
COMMENT ON COLUMN weekly_reviews.suggested_adjustment IS 'The human readable One Lever suggestion';
