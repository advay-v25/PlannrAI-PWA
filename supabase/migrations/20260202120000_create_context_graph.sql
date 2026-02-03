-- Create user_context table for Long-Term Memory
create table if not exists user_context (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  
  -- Type of memory: 'fact', 'preference', 'pattern', 'constraint'
  type text check (type in ('fact', 'preference', 'pattern', 'constraint')) not null,
  
  -- The core memory content
  content text not null,
  
  -- Metadata for provenance/confidence
  source text, -- e.g., 'brain_dump', 'coach_chat'
  confidence float default 1.0,
  
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);

-- Enable RLS
alter table user_context enable row level security;

-- RLS Policy
create policy "Users can only see their own context" on user_context
  for all using (auth.uid() = user_id);

-- Index for faster retrieval by user
create index if not exists idx_user_context_user_id on user_context(user_id);
