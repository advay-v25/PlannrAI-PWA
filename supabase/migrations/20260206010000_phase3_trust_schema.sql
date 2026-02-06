-- Phase 3: Trust + Stickiness Schema

-- 1. Behavior Events (Raw Signals)
create table if not exists public.behavior_events (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    event_id uuid, -- link to schedule_block id if applicable (nullable)
    action_type text not null check (action_type in ('complete', 'miss', 'reschedule', 'overrun', 'accept_suggestion', 'reject_suggestion', 'delete')),
    meta jsonb default '{}'::jsonb, -- stores from/to, duration_change, goal_id, etc.
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint behavior_events_pkey primary key (id)
);

-- Index for analytics
create index idx_behavior_events_user_action on public.behavior_events(user_id, action_type);
create index idx_behavior_events_created_at on public.behavior_events(created_at);

-- 2. Behavior Patterns (Aggregated Knowledge)
create table if not exists public.behavior_patterns (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    preferred_windows jsonb default '{}'::jsonb, -- e.g. { "craft": ["09:00", "11:00"] }
    completion_rates jsonb default '{}'::jsonb, -- e.g. { "mind": 0.8, "body": 0.4 }
    avoidance_data jsonb default '{}'::jsonb, -- patterns of rescheduling
    density_tolerance jsonb default '{}'::jsonb, -- average blocks per day before failure
    confidence_score float default 0.0,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint behavior_patterns_pkey primary key (id),
    constraint behavior_patterns_user_id_key unique (user_id)
);

-- 3. Patch Runs (Undo/Redo History)
create table if not exists public.patch_runs (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    patch jsonb not null, -- The change applied
    inverse_patch jsonb not null, -- How to undo it
    applied boolean default false,
    source text not null check (source in ('coach', 'calendar', 'brain_dump', 'system')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint patch_runs_pkey primary key (id)
);

-- RLS Policies
alter table public.behavior_events enable row level security;
alter table public.behavior_patterns enable row level security;
alter table public.patch_runs enable row level security;

create policy "Users can view own behavior events" on public.behavior_events for select using (auth.uid() = user_id);
create policy "Users can insert own behavior events" on public.behavior_events for insert with check (auth.uid() = user_id);

create policy "Users can view own behavior patterns" on public.behavior_patterns for select using (auth.uid() = user_id);
create policy "Users can update own behavior patterns" on public.behavior_patterns for update using (auth.uid() = user_id);
create policy "Users can insert own behavior patterns" on public.behavior_patterns for insert with check (auth.uid() = user_id);

create policy "Users can view own patch runs" on public.patch_runs for select using (auth.uid() = user_id);
create policy "Users can insert own patch runs" on public.patch_runs for insert with check (auth.uid() = user_id);
create policy "Users can update own patch runs" on public.patch_runs for update using (auth.uid() = user_id);
