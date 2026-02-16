
-- 1. Create profile_preferences table
create table if not exists public.profile_preferences (
    user_id uuid not null primary key references auth.users(id) on delete cascade,
    
    -- Core Constraints
    sleep_start text not null default '23:00',
    wake_time text not null default '07:00',
    wind_down_min integer not null default 30,
    meals_per_day integer not null default 3 check (meals_per_day in (2, 3)),
    meal_windows jsonb default '{"breakfast": {"start":"07:00","end":"10:00"}, "lunch": {"start":"12:00","end":"15:00"}, "dinner": {"start":"18:30","end":"21:30"}}'::jsonb,
    buffer_min integer not null default 10 check (buffer_min in (5, 10, 15)),
    allow_weekend_work boolean not null default true,
    weekend_intensity text not null default 'light' check (weekend_intensity in ('off', 'light', 'normal')),
    
    -- Work Preferences
    preferred_windows jsonb default '{"mind": ["09:00-12:00"], "body": ["17:00-19:00"], "craft": ["13:00-16:00"]}'::jsonb,
    pillar_spacing_preference text not null default 'cluster_ok' check (pillar_spacing_preference in ('alternate', 'cluster_ok')),
    max_daily_load_min integer,
    
    -- AI Behavior
    proactive_level text not null default 'standard' check (proactive_level in ('off', 'low', 'standard')),
    ask_before_changes boolean not null default true,
    max_ai_options integer not null default 3 check (max_ai_options between 1 and 3),
    low_energy_mode boolean not null default false,
    overwhelm_mode boolean not null default false,
    
    -- Permissions
    calendar_integration_enabled boolean not null default false,
    notifications_enabled boolean not null default false,
    notification_times jsonb default '[]'::jsonb,
    
    -- Body & Diet
    diet_type text default 'other' check (diet_type in ('veg', 'vegan', 'eggetarian', 'other')),
    allergies jsonb default '[]'::jsonb,
    workout_preference text default 'mixed' check (workout_preference in ('gym', 'sports', 'walk', 'mixed')),
    workout_min_per_day integer default 30,
    is_workout_protected boolean default true,

    -- Routines
    default_morning_stack_id uuid references public.habit_stacks(id) on delete set null,
    default_night_stack_id uuid references public.habit_stacks(id) on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Migrate existing data from profiles (if any)
-- We check if columns exist in profiles to avoid errors if they don't, but assuming previous migration ran:
do $$
begin
    if exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'buffer_minutes') then
        insert into public.profile_preferences (
            user_id, buffer_min, weekend_intensity, meal_windows, preferred_windows
        )
        select 
            id as user_id,
            coalesce(buffer_minutes, 10),
            coalesce(weekend_intensity, 'light'),
            coalesce(meal_windows, '{"breakfast": {"start":"07:00","end":"10:00"}, "lunch": {"start":"12:00","end":"15:00"}, "dinner": {"start":"18:30","end":"21:30"}}'::jsonb),
            coalesce(pillar_preferences, '{"mind": {"preferred":["09:00-12:00"]}, "body": {"preferred":["17:00-20:00"]}, "craft": {"preferred":["12:00-17:00"]}}'::jsonb)
        from public.profiles
        on conflict (user_id) do nothing;
    end if;
end $$;

-- 3. RLS Policies
alter table public.profile_preferences enable row level security;

create policy "Users can view own preferences"
    on public.profile_preferences for select using (auth.uid() = user_id);

create policy "Users can update own preferences"
    on public.profile_preferences for update using (auth.uid() = user_id);

create policy "Users can insert own preferences"
    on public.profile_preferences for insert with check (auth.uid() = user_id);

-- 4. Trigger for updated_at
create trigger handle_updated_at before update on public.profile_preferences
    for each row execute procedure moddatetime (updated_at);
