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

-- ---------------------------------------------------------------------------
-- Scene storage
-- ---------------------------------------------------------------------------

create table if not exists public.scenes (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid,
    slug text,
    title text,
    synopsis text,
    scene_number integer,
    script_order integer,
    color text default '#5FA8FF',
    location text,
    time_of_day text,
    cards jsonb default '[]'::jsonb not null,
    elements jsonb default '[]'::jsonb not null,
    sounds jsonb default '[]'::jsonb not null,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists scenes_owner_idx on public.scenes (owner_id);
create index if not exists scenes_project_idx on public.scenes (project_id);

create trigger scenes_set_timestamp
before update on public.scenes
for each row execute function public.set_current_timestamp();

alter table public.scenes enable row level security;

drop policy if exists "Scenes are viewable by owners" on public.scenes;
create policy "Scenes are viewable by owners"
    on public.scenes
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Scenes can be inserted by owners" on public.scenes;
create policy "Scenes can be inserted by owners"
    on public.scenes
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "Scenes are editable by owners" on public.scenes;
create policy "Scenes are editable by owners"
    on public.scenes
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "Scenes are deletable by owners" on public.scenes;
create policy "Scenes are deletable by owners"
    on public.scenes
    for delete
    using (auth.uid() = owner_id);

create table if not exists public.scene_beats (
    id uuid primary key default gen_random_uuid(),
    scene_id uuid not null references public.scenes (id) on delete cascade,
    position integer not null default 0,
    title text,
    summary text,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists scene_beats_scene_idx on public.scene_beats (scene_id);

create trigger scene_beats_set_timestamp
before update on public.scene_beats
for each row execute function public.set_current_timestamp();

alter table public.scene_beats enable row level security;

drop policy if exists "Scene beats are viewable by owners" on public.scene_beats;
create policy "Scene beats are viewable by owners"
    on public.scene_beats
    for select
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene beats can be inserted by owners" on public.scene_beats;
create policy "Scene beats can be inserted by owners"
    on public.scene_beats
    for insert
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene beats are editable by owners" on public.scene_beats;
create policy "Scene beats are editable by owners"
    on public.scene_beats
    for update
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene beats are deletable by owners" on public.scene_beats;
create policy "Scene beats are deletable by owners"
    on public.scene_beats
    for delete
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

create table if not exists public.scene_elements (
    id uuid primary key default gen_random_uuid(),
    scene_id uuid not null references public.scenes (id) on delete cascade,
    position integer not null default 0,
    element_type text not null,
    body text,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists scene_elements_scene_idx on public.scene_elements (scene_id);

create trigger scene_elements_set_timestamp
before update on public.scene_elements
for each row execute function public.set_current_timestamp();

alter table public.scene_elements enable row level security;

drop policy if exists "Scene elements are viewable by owners" on public.scene_elements;
create policy "Scene elements are viewable by owners"
    on public.scene_elements
    for select
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene elements can be inserted by owners" on public.scene_elements;
create policy "Scene elements can be inserted by owners"
    on public.scene_elements
    for insert
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene elements are editable by owners" on public.scene_elements;
create policy "Scene elements are editable by owners"
    on public.scene_elements
    for update
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene elements are deletable by owners" on public.scene_elements;
create policy "Scene elements are deletable by owners"
    on public.scene_elements
    for delete
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

create table if not exists public.scene_sounds (
    id uuid primary key default gen_random_uuid(),
    scene_id uuid not null references public.scenes (id) on delete cascade,
    cue text not null,
    position integer not null default 0,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists scene_sounds_scene_idx on public.scene_sounds (scene_id);

create trigger scene_sounds_set_timestamp
before update on public.scene_sounds
for each row execute function public.set_current_timestamp();

alter table public.scene_sounds enable row level security;

drop policy if exists "Scene sounds are viewable by owners" on public.scene_sounds;
create policy "Scene sounds are viewable by owners"
    on public.scene_sounds
    for select
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene sounds can be inserted by owners" on public.scene_sounds;
create policy "Scene sounds can be inserted by owners"
    on public.scene_sounds
    for insert
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene sounds are editable by owners" on public.scene_sounds;
create policy "Scene sounds are editable by owners"
    on public.scene_sounds
    for update
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene sounds are deletable by owners" on public.scene_sounds;
create policy "Scene sounds are deletable by owners"
    on public.scene_sounds
    for delete
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

create table if not exists public.scene_links (
    id uuid primary key default gen_random_uuid(),
    scene_id uuid not null references public.scenes (id) on delete cascade,
    link_type text not null,
    linked_id uuid,
    display_name text,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists scene_links_scene_idx on public.scene_links (scene_id);
create index if not exists scene_links_type_idx on public.scene_links (link_type);

create trigger scene_links_set_timestamp
before update on public.scene_links
for each row execute function public.set_current_timestamp();

alter table public.scene_links enable row level security;

drop policy if exists "Scene links are viewable by owners" on public.scene_links;
create policy "Scene links are viewable by owners"
    on public.scene_links
    for select
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene links can be inserted by owners" on public.scene_links;
create policy "Scene links can be inserted by owners"
    on public.scene_links
    for insert
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene links are editable by owners" on public.scene_links;
create policy "Scene links are editable by owners"
    on public.scene_links
    for update
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene links are deletable by owners" on public.scene_links;
create policy "Scene links are deletable by owners"
    on public.scene_links
    for delete
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );
