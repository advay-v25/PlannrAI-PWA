-- MASTER PHASE 1 MIGRATION
-- 1. Create User State Engine
create type user_mode as enum ('survival', 'maintenance', 'growth');

create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  energy_level int check (energy_level between 1 and 5) default 3,
  cognitive_load int check (cognitive_load between 1 and 3) default 2,
  emotional_bandwidth int check (emotional_bandwidth between 1 and 3) default 2,
  current_mode user_mode not null default 'maintenance',
  updated_at timestamptz default now()
);

alter table public.user_states enable row level security;
create policy "Users manage own state" on public.user_states 
    for all using (auth.uid() = user_id);

-- 2. Update Calendar Authority
-- Adding explicit Priority and Energy Cost
alter table public.schedule_blocks 
  add column if not exists priority int default 3 check (priority between 1 and 5),
  add column if not exists energy_cost text default 'medium' check (energy_cost in ('low', 'medium', 'high')),
  add column if not exists is_locked boolean default false;

-- Note: We rely on application logic for 'block_type' enum updates if strictly needed, 
-- or we can alter the enum type here if it exists.
-- But standard practice: Add columns first.
