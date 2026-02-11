-- Phase 4: Memory System (Strict Schema)

-- 1. Coach Threads
create table if not exists coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Coach Messages
create table if not exists coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references coach_threads(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

-- 3. Brain Dump Entries
create table if not exists brain_dump_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  raw_text text not null,
  extracted_json jsonb,
  created_at timestamptz default now()
);

-- 4. Memory Facts
-- Note: memory_facts likely exists from 20260206120000_phase5_memory.sql
-- If it exists, we reuse it. If not, we create it matching user specs.
create table if not exists memory_facts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    key text not null,
    value jsonb not null,
    confidence float not null default 1.0,
    updated_at timestamptz default now(),
    
    -- Optional fields from previous schema, just in case we are creating fresh
    kind text check (kind in ('preference', 'pattern', 'constraint', 'identity')),
    source_event_id uuid
);

-- RLS Policies
alter table coach_threads enable row level security;
alter table coach_messages enable row level security;
alter table brain_dump_entries enable row level security;
alter table memory_facts enable row level security;

-- Policies (using DO block to avoid errors if policies exist)
do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'coach_threads' and policyname = 'Users can manage own threads') then
        create policy "Users can manage own threads" on coach_threads for all using (auth.uid() = user_id);
    end if;
    
    if not exists (select 1 from pg_policies where tablename = 'coach_messages' and policyname = 'Users can manage own messages') then
        create policy "Users can manage own messages" on coach_messages for all using (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies where tablename = 'brain_dump_entries' and policyname = 'Users can manage own brain dumps') then
        create policy "Users can manage own brain dumps" on brain_dump_entries for all using (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies where tablename = 'memory_facts' and policyname = 'Users can manage own facts') then
        create policy "Users can manage own facts" on memory_facts for all using (auth.uid() = user_id);
    end if;
end
$$;
