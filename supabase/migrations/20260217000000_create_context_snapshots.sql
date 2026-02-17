
-- Create a table for storing AI Context Snapshots for debugging and history
create table context_snapshots (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) not null,
    context_data jsonb not null, -- The full Liquid Context object
    event_type text default 'manual', -- 'smart_intake', 'daily_log', 'manual', etc.
    created_at timestamp with time zone default now()
);

-- Add RLS policies
alter table context_snapshots enable row level security;

create policy "Users can insert their own snapshots"
    on context_snapshots for insert
    with check (auth.uid() = user_id);

create policy "Users can view their own snapshots"
    on context_snapshots for select
    using (auth.uid() = user_id);

-- Add index for performance
create index context_snapshots_user_created_idx on context_snapshots(user_id, created_at desc);
