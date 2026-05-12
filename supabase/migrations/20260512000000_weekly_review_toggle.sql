alter table public.profile_preferences 
add column if not exists weekly_review_enabled boolean not null default true;
