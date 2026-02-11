-- Create storage bucket for bio uploads if not exists
insert into storage.buckets (id, name, public)
values ('bio_uploads', 'bio_uploads', false)
on conflict (id) do nothing;

-- Enable RLS on storage.objects (usually enabled by default, but good measure)
-- alter table storage.objects enable row level security;

-- Policy: Users can upload their own bio files
do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Users can upload own bio files') then
        create policy "Users can upload own bio files"
        on storage.objects for insert
        with check (
            bucket_id = 'bio_uploads' 
            and auth.uid() = owner
        );
    end if;
    
    if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Users can view own bio files') then
        create policy "Users can view own bio files"
        on storage.objects for select
        using (
            bucket_id = 'bio_uploads' 
            and auth.uid() = owner
        );
    end if;
end
$$;

-- Add bio_scan_url to profiles if not exists
alter table public.profiles 
add column if not exists bio_scan_url text;

-- Add bio_data jsonb to profiles for storing analysis results
alter table public.profiles 
add column if not exists bio_data jsonb default '{}'::jsonb;
