-- Create weekly_reviews table
create table if not exists public.weekly_reviews (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start date not null,
  week_end date not null,
  planned_minutes numeric default 0,
  actual_minutes numeric default 0,
  friction_patterns jsonb default '[]'::jsonb, -- Array of {title, evidence}
  suggested_adjustment text,
  lever_action jsonb, -- {label, patch}
  user_response text check (user_response in ('accepted', 'ignored', 'pending')) default 'pending',
  lever_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(user_id, week_start)
);

-- RLS
alter table public.weekly_reviews enable row level security;

create policy "Users can view their own reviews"
  on public.weekly_reviews for select
  using (auth.uid() = user_id);

create policy "Users can insert their own reviews"
  on public.weekly_reviews for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reviews"
  on public.weekly_reviews for update
  using (auth.uid() = user_id);
