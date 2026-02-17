
-- Add ai_plan to goals for storing the raw agent reasoning
alter table goals add column if not exists ai_plan jsonb;

-- Create milestones table
create table milestones (
    id uuid default gen_random_uuid() primary key,
    goal_id uuid references goals(id) on delete cascade not null,
    title text not null,
    description text,
    status text default 'pending' check (status in ('pending', 'in_progress', 'completed')),
    deadline date,
    sort_order integer default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Create tasks table for actionable items derived from milestones
create table goal_tasks (
    id uuid default gen_random_uuid() primary key,
    goal_id uuid references goals(id) on delete cascade not null,
    milestone_id uuid references milestones(id) on delete set null,
    title text not null,
    estimated_minutes integer default 30,
    status text default 'pending' check (status in ('pending', 'scheduled', 'completed')),
    schedule_block_id uuid references schedule_blocks(id) on delete set null, -- Link to actual calendar block
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Add RLS policies
alter table milestones enable row level security;
alter table goal_tasks enable row level security;

-- Milestones policies
create policy "Users can manage their own milestones"
    on milestones for all
    using (goal_id in (select id from goals where user_id = auth.uid()))
    with check (goal_id in (select id from goals where user_id = auth.uid()));

-- Tasks policies
create policy "Users can manage their own goal tasks"
    on goal_tasks for all
    using (goal_id in (select id from goals where user_id = auth.uid()))
    with check (goal_id in (select id from goals where user_id = auth.uid()));

-- Indexes
create index milestones_goal_idx on milestones(goal_id);
create index goal_tasks_goal_idx on goal_tasks(goal_id);
create index goal_tasks_milestone_idx on goal_tasks(milestone_id);
