-- Add notes field to goals for user context
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add description field for more detail
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS description TEXT;

-- Add updated_at for tracking edits
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_goals_updated_at ON public.goals;
CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_goals_updated_at();
