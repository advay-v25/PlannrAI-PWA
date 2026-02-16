-- Fix Brain Dump Schema

-- 1. Ensure 'text' column exists in brain_dumps
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'brain_dumps' and column_name = 'text') then
        alter table public.brain_dumps add column text text;
    end if;
end $$;

-- 2. Ensure brain_dump_extractions exists
create table if not exists public.brain_dump_extractions (
    id uuid not null default gen_random_uuid(),
    brain_dump_id uuid not null references public.brain_dumps(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    extracted_json jsonb not null,
    created_at timestamptz not null default now(),
    primary key (id)
);

-- 3. Ensure RLS is enabled/policies exist (idempotent)
alter table public.brain_dumps enable row level security;
alter table public.brain_dump_extractions enable row level security;

-- Policies (drop and recreate to ensure correctness if needed, or just create if not exists)
-- Easier to just create if not exists using do block or ignore error
do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'Users can view their own brain dumps') then
        create policy "Users can view their own brain dumps" on public.brain_dumps for select using (auth.uid() = user_id);
    end if;
    
    if not exists (select 1 from pg_policies where policyname = 'Users can create their own brain dumps') then
        create policy "Users can create their own brain dumps" on public.brain_dumps for insert with check (auth.uid() = user_id);
    end if;

     if not exists (select 1 from pg_policies where policyname = 'Users can view their own extractions') then
        create policy "Users can view their own extractions" on public.brain_dump_extractions for select using (auth.uid() = user_id);
    end if;

     if not exists (select 1 from pg_policies where policyname = 'Users can create their own extractions') then
        create policy "Users can create their own extractions" on public.brain_dump_extractions for insert with check (auth.uid() = user_id);
    end if;
end $$;
