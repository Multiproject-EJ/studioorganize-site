-- StudioOrganize Supabase schema
-- Run this file inside the Supabase SQL editor or via `supabase db push`

-- Ensure the pgcrypto extension is available for generating UUIDs if needed
create extension if not exists "pgcrypto";

-- Member profile table tied to Supabase Auth users
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text unique,
    full_name text,
    studio_name text,
    phone text,
    is_admin boolean default false not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

-- Keep updated_at current automatically
create or replace function public.set_current_timestamp()
returns trigger as $$
begin
    new.updated_at := timezone('utc', now());
    return new;
end;
$$ language plpgsql;

create trigger profiles_set_timestamp
before update on public.profiles
for each row execute function public.set_current_timestamp();

-- Automatically create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security policies
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owners" on public.profiles;
create policy "Profiles are viewable by owners"
    on public.profiles
    for select
    using (auth.uid() = id);

drop policy if exists "Profiles can be created by owners" on public.profiles;
create policy "Profiles can be created by owners"
    on public.profiles
    for insert
    with check (auth.uid() = id);

drop policy if exists "Profiles are editable by owners" on public.profiles;
create policy "Profiles are editable by owners"
    on public.profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- Allow insert via service role (used by trigger) and self-service sign-up
-- The insert policy above ensures authenticated users can create their row
-- while still scoping access to their own profile only.

-- Helper view for admin dashboards (requires service role)
create or replace view public.member_directory as
select
    p.id,
    p.email,
    p.full_name,
    p.studio_name,
    p.phone,
    p.is_admin,
    p.created_at,
    p.updated_at
from public.profiles p;

-- Grant read access on the view to authenticated users if needed (optional)
-- revoke all on public.member_directory from anon;
-- grant select on public.member_directory to authenticated;
