
-- Brain Dump Rebuild: Inbox and User State

-- 1. Inbox Items (For tasks not yet scheduled)
create table if not exists public.inbox_items (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    source_dump_id uuid references public.brain_dumps(id) on delete set null,
    title text not null,
    kind text check (kind in ('task', 'chore', 'errand', 'project', 'idea')),
    pillar text check (pillar in ('mind', 'body', 'craft', 'uncategorized')),
    est_min integer default 15,
    urgency integer default 1,
    importance integer default 1,
    due_date date,
    status text check (status in ('inbox', 'scheduled', 'done', 'deleted')) default 'inbox',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (id)
);

-- 2. User State (For detailed signals)
create table if not exists public.user_state (
    user_id uuid not null references auth.users(id) on delete cascade,
    energy_level integer check (energy_level between 1 and 5),
    emotional_state jsonb, -- { overwhelm: 0.8, stress: 0.2, moood: "tired" }
    last_dump_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (user_id)
);

-- 3. RLS
alter table public.inbox_items enable row level security;
alter table public.user_state enable row level security;

create policy "Users can view own inbox"
    on public.inbox_items for select using (auth.uid() = user_id);

create policy "Users can manage own inbox"
    on public.inbox_items for all using (auth.uid() = user_id);

create policy "Users can view own state"
    on public.user_state for select using (auth.uid() = user_id);

create policy "Users can update own state"
    on public.user_state for all using (auth.uid() = user_id);

-- 4. Indexes
create index if not exists idx_inbox_items_user on public.inbox_items(user_id);
create index if not exists idx_inbox_items_status on public.inbox_items(status);
