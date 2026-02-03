
alter table "public"."profiles" add column if not exists "full_name" text;
alter table "public"."profiles" add column if not exists "preferred_name" text;
