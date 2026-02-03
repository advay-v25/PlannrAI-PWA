-- Create table to track proactive AI interventions
create table if not exists intervention_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  
  -- Type of intervention: 'stagnation', 'burnout', 'disengagement', 'win_streak'
  type text not null,
  
  -- AI generated message content
  message text,
  
  -- Status: 'pending', 'dismissed', 'accepted'
  status text default 'pending',
  
  created_at timestamptz default now(),
  action_taken_at timestamptz
);

-- RLS
alter table intervention_logs enable row level security;

create policy "Users can see own interventions" on intervention_logs
  for all using (auth.uid() = user_id);

-- Index for fast lookup of recent interventions
create index if not exists idx_intervention_logs_user_recent 
  on intervention_logs(user_id, created_at desc);
