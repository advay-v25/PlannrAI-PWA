-- Day Chain state + block status widening
-- Supports: end-of-day completion sweep (§1) and the Day Chain streak (§4)

-- 1. Widen schedule_blocks.status.
--    The original constraint (001_initial_schema) only allowed
--    planned | done | partial | missed, but the app has long written
--    'in_progress' and 'cancelled', and the completion sweep now needs
--    'skipped' (a deliberate decision not to do something, which is
--    excluded from completion denominators entirely).
ALTER TABLE public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_status_check;
ALTER TABLE public.schedule_blocks
ADD CONSTRAINT schedule_blocks_status_check
CHECK (status IN ('planned', 'in_progress', 'done', 'partial', 'missed', 'cancelled', 'skipped'));

-- 2. Chain state — the streak spans weeks, so it cannot live in weekly_reviews.
--    Values here are always recomputed from schedule_blocks on read; this table
--    is a cache plus the historical high-water mark for longest_streak.
create table if not exists public.chain_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_complete_date date,
  updated_at timestamptz default now()
);

alter table public.chain_state enable row level security;

drop policy if exists "Users can view their own chain state" on public.chain_state;
create policy "Users can view their own chain state"
  on public.chain_state for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own chain state" on public.chain_state;
create policy "Users can insert their own chain state"
  on public.chain_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own chain state" on public.chain_state;
create policy "Users can update their own chain state"
  on public.chain_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.chain_state is 'Day Chain streak cache. Recomputed from schedule_blocks on every read so it self-heals when blocks are marked retroactively.';

-- 3. weekly_reviews: allow the semi-automatic outcome and record completion time.
--    The original constraint only permitted accepted | ignored | pending, so a
--    part-accepted review had nowhere to land.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_reviews' AND column_name = 'completed_at') THEN
        ALTER TABLE public.weekly_reviews ADD COLUMN completed_at timestamptz;
    END IF;
END $$;

ALTER TABLE public.weekly_reviews DROP CONSTRAINT IF EXISTS weekly_reviews_user_response_check;
ALTER TABLE public.weekly_reviews
ADD CONSTRAINT weekly_reviews_user_response_check
CHECK (user_response IN ('accepted', 'partial', 'ignored', 'pending'));

comment on column public.weekly_reviews.user_response is 'accepted = automatic mode, partial = semi-automatic, ignored = declined into manual planning.';
