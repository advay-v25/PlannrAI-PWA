-- Coach Chief of Staff Schema

-- 1. Threads (Conversation Containers)
create table if not exists public.coach_threads (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (id)
);

-- 2. Messages (Structured Content)
create table if not exists public.coach_messages (
    id uuid not null default gen_random_uuid(),
    thread_id uuid not null references public.coach_threads(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'system')),
    content text, -- legacy/fallback
    content_json jsonb, -- The new "Chief of Staff" structured output
    created_at timestamptz not null default now(),
    primary key (id)
);

-- 3. RLS Policies
alter table public.coach_threads enable row level security;
alter table public.coach_messages enable row level security;

create policy "Users can view their own threads"
    on public.coach_threads for select
    using (auth.uid() = user_id);

create policy "Users can create their own threads"
    on public.coach_threads for insert
    with check (auth.uid() = user_id);

create policy "Users can view their own messages"
    on public.coach_messages for select
    using (auth.uid() = user_id);

create policy "Users can create their own messages"
    on public.coach_messages for insert
    with check (auth.uid() = user_id);

-- 4. Indexes
create index if not exists idx_coach_threads_user on public.coach_threads(user_id);
create index if not exists idx_coach_messages_thread on public.coach_messages(thread_id);
