-- Enable Row Level Security (RLS) for all tables flagged by the Security Advisor
-- Adds standard user isolation policies based on user_id

DO $$ 
DECLARE
    t_name text;
BEGIN
    FOR t_name IN (SELECT unnest(ARRAY[
        'coach_learnings', 
        'brain_dumps', 
        'brain_dump_items', 
        'potential_goals', 
        'user_playbook', 
        'weekly_reviews', 
        'weekly_review_data', 
        'personal_rules', 
        'energy_checkins', 
        'ai_insights', 
        'block_completions', 
        'daily_stats'
    ]))
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t_name);
        
        -- Create standard user isolation policy
        BEGIN
            EXECUTE format('
                CREATE POLICY "Users can only access their own data" 
                ON public.%I 
                FOR ALL 
                USING (auth.uid() = user_id) 
                WITH CHECK (auth.uid() = user_id);
            ', t_name);
        EXCEPTION
            WHEN duplicate_object THEN
                NULL; -- Ignore if policy already exists
        END;
    END LOOP;
END $$;
