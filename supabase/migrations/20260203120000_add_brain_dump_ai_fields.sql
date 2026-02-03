
-- Add AI categorization fields to brain_dumps
ALTER TABLE public.brain_dumps ADD COLUMN IF NOT EXISTS "ai_categories" TEXT[] DEFAULT '{}';
ALTER TABLE public.brain_dumps ADD COLUMN IF NOT EXISTS "ai_themes" TEXT[] DEFAULT '{}';
ALTER TABLE public.brain_dumps ADD COLUMN IF NOT EXISTS "ai_sentiment" TEXT;

-- Add index for better analytics
CREATE INDEX IF NOT EXISTS idx_brain_dumps_sentiment ON public.brain_dumps(ai_sentiment);
