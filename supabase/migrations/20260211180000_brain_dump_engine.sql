-- Brain Dump Impact Engine Schema

-- 1. Raw Dumps (The "Journal" Aspect)
create table if not exists public.brain_dumps (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    text text not null,
    created_at timestamptz not null default now(),
    primary key (id)
);

-- 2. Extractions (The "Intelligence" Aspect)
create table if not exists public.brain_dump_extractions (
    id uuid not null default gen_random_uuid(),
    brain_dump_id uuid not null references public.brain_dumps(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    extracted_json jsonb not null, -- Stores { tasks: [], constraints: [], signals: {} }
    created_at timestamptz not null default now(),
    primary key (id)
);

-- 3. RLS Policies
alter table public.brain_dumps enable row level security;
alter table public.brain_dump_extractions enable row level security;

create policy "Users can view their own brain dumps"
    on public.brain_dumps for select
    using (auth.uid() = user_id);

create policy "Users can create their own brain dumps"
    on public.brain_dumps for insert
    with check (auth.uid() = user_id);

create policy "Users can view their own extractions"
    on public.brain_dump_extractions for select
    using (auth.uid() = user_id);

create policy "Users can create their own extractions"
    on public.brain_dump_extractions for insert
    with check (auth.uid() = user_id);

-- 4. Indexes
create index if not exists idx_brain_dumps_user on public.brain_dumps(user_id);
create index if not exists idx_brain_dump_extractions_dump on public.brain_dump_extractions(brain_dump_id);
