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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'profiles_set_timestamp'
          and tgrelid = 'public.profiles'::regclass
    ) then
        create trigger profiles_set_timestamp
            before update on public.profiles
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'on_auth_user_created'
          and tgrelid = 'auth.users'::regclass
    ) then
        create trigger on_auth_user_created
            after insert on auth.users
            for each row execute function public.handle_new_user();
    end if;
end;
$$;

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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'scenes_set_timestamp'
          and tgrelid = 'public.scenes'::regclass
    ) then
        create trigger scenes_set_timestamp
            before update on public.scenes
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- Character catalog (Character Studio)
-- ---------------------------------------------------------------------------

create table if not exists public.characters (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid,
    name text not null default '',
    role text,
    archetype text,
    pronouns text,
    age text,
    summary text,
    background text,
    family_tree text,
    traits text[] not null default '{}'::text[],
    stats_scenes integer not null default 0,
    stats_screen_time numeric not null default 0,
    stats_dialogue integer not null default 0,
    arc_setup text,
    arc_development text,
    arc_resolution text,
    look_portrait_url text,
    look_turnaround_urls text[] not null default '{}'::text[],
    look_expression_urls text[] not null default '{}'::text[],
    ai_prompt text,
    ai_notes text,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists characters_owner_idx on public.characters (owner_id);
create index if not exists characters_project_idx on public.characters (project_id);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'characters_set_timestamp'
          and tgrelid = 'public.characters'::regclass
    ) then
        create trigger characters_set_timestamp
            before update on public.characters
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.characters enable row level security;

drop policy if exists "Characters are viewable by owners" on public.characters;
create policy "Characters are viewable by owners"
    on public.characters
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Characters can be inserted by owners" on public.characters;
create policy "Characters can be inserted by owners"
    on public.characters
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "Characters are editable by owners" on public.characters;
create policy "Characters are editable by owners"
    on public.characters
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "Characters are deletable by owners" on public.characters;
create policy "Characters are deletable by owners"
    on public.characters
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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'scene_beats_set_timestamp'
          and tgrelid = 'public.scene_beats'::regclass
    ) then
        create trigger scene_beats_set_timestamp
            before update on public.scene_beats
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'scene_elements_set_timestamp'
          and tgrelid = 'public.scene_elements'::regclass
    ) then
        create trigger scene_elements_set_timestamp
            before update on public.scene_elements
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'scene_sounds_set_timestamp'
          and tgrelid = 'public.scene_sounds'::regclass
    ) then
        create trigger scene_sounds_set_timestamp
            before update on public.scene_sounds
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

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

create table if not exists public.scene_storyboards (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid,
    scene_id uuid not null references public.scenes (id) on delete cascade,
    position integer not null default 0,
    image_url text not null,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists scene_storyboards_scene_idx on public.scene_storyboards (scene_id);
create index if not exists scene_storyboards_owner_idx on public.scene_storyboards (owner_id);
create index if not exists scene_storyboards_project_idx on public.scene_storyboards (project_id);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'scene_storyboards_set_timestamp'
          and tgrelid = 'public.scene_storyboards'::regclass
    ) then
        create trigger scene_storyboards_set_timestamp
            before update on public.scene_storyboards
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.scene_storyboards enable row level security;

drop policy if exists "Scene storyboards are viewable by owners" on public.scene_storyboards;
create policy "Scene storyboards are viewable by owners"
    on public.scene_storyboards
    for select
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene storyboards can be inserted by owners" on public.scene_storyboards;
create policy "Scene storyboards can be inserted by owners"
    on public.scene_storyboards
    for insert
    with check (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Scene storyboards are editable by owners" on public.scene_storyboards;
create policy "Scene storyboards are editable by owners"
    on public.scene_storyboards
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

drop policy if exists "Scene storyboards are deletable by owners" on public.scene_storyboards;
create policy "Scene storyboards are deletable by owners"
    on public.scene_storyboards
    for delete
    using (
        exists (
            select 1
            from public.scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- Storyboard Supabase integration (frames, tags, acts)
-- ---------------------------------------------------------------------------

create table if not exists public.storyboard_acts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid,
    name text not null,
    position integer not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists storyboard_acts_owner_idx on public.storyboard_acts (owner_id);
create index if not exists storyboard_acts_project_idx on public.storyboard_acts (project_id);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'storyboard_acts_set_timestamp'
          and tgrelid = 'public.storyboard_acts'::regclass
    ) then
        create trigger storyboard_acts_set_timestamp
            before update on public.storyboard_acts
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.storyboard_acts enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_acts'
          and policyname = 'Storyboard acts are viewable by owners'
    ) then
        create policy "Storyboard acts are viewable by owners"
            on public.storyboard_acts
            for select
            to authenticated
            using (auth.uid() = owner_id);
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_acts'
          and policyname = 'Storyboard acts can be inserted by owners'
    ) then
        create policy "Storyboard acts can be inserted by owners"
            on public.storyboard_acts
            for insert
            to authenticated
            with check (auth.uid() = owner_id);
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_acts'
          and policyname = 'Storyboard acts are editable by owners'
    ) then
        create policy "Storyboard acts are editable by owners"
            on public.storyboard_acts
            for update
            to authenticated
            using (auth.uid() = owner_id)
            with check (auth.uid() = owner_id);
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_acts'
          and policyname = 'Storyboard acts are deletable by owners'
    ) then
        create policy "Storyboard acts are deletable by owners"
            on public.storyboard_acts
            for delete
            to authenticated
            using (auth.uid() = owner_id);
    end if;
end;
$$;

alter table public.scenes add column if not exists act_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'scenes_act_id_fkey'
    ) then
        alter table public.scenes
            add constraint scenes_act_id_fkey
            foreign key (act_id)
            references public.storyboard_acts (id)
            on delete set null;
    end if;
end;
$$;

create index if not exists scenes_act_idx on public.scenes (act_id);

create table if not exists public.storyboard_frames (
    id uuid primary key default gen_random_uuid(),
    scene_id uuid not null references public.scenes (id) on delete cascade,
    caption text default '',
    position integer not null,
    duration_ms integer default 1500,
    media_type text not null check (media_type in ('image', 'video')),
    storage_path text not null,
    thumb_path text,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists storyboard_frames_scene_idx on public.storyboard_frames (scene_id);
create index if not exists storyboard_frames_scene_position_idx on public.storyboard_frames (scene_id, position);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'storyboard_frames_set_timestamp'
          and tgrelid = 'public.storyboard_frames'::regclass
    ) then
        create trigger storyboard_frames_set_timestamp
            before update on public.storyboard_frames
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.storyboard_frames enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_frames'
          and policyname = 'Storyboard frames are viewable by scene owners'
    ) then
        create policy "Storyboard frames are viewable by scene owners"
            on public.storyboard_frames
            for select
            to authenticated
            using (
                exists (
                    select 1
                    from public.scenes s
                    where s.id = scene_id
                      and s.owner_id = auth.uid()
                )
            );
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_frames'
          and policyname = 'Storyboard frames can be inserted by scene owners'
    ) then
        create policy "Storyboard frames can be inserted by scene owners"
            on public.storyboard_frames
            for insert
            to authenticated
            with check (
                exists (
                    select 1
                    from public.scenes s
                    where s.id = scene_id
                      and s.owner_id = auth.uid()
                )
            );
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_frames'
          and policyname = 'Storyboard frames are editable by scene owners'
    ) then
        create policy "Storyboard frames are editable by scene owners"
            on public.storyboard_frames
            for update
            to authenticated
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
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_frames'
          and policyname = 'Storyboard frames are deletable by scene owners'
    ) then
        create policy "Storyboard frames are deletable by scene owners"
            on public.storyboard_frames
            for delete
            to authenticated
            using (
                exists (
                    select 1
                    from public.scenes s
                    where s.id = scene_id
                      and s.owner_id = auth.uid()
                )
            );
    end if;
end;
$$;

create table if not exists public.storyboard_scene_tags (
    id uuid primary key default gen_random_uuid(),
    scene_id uuid not null references public.scenes (id) on delete cascade,
    tag text not null,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists storyboard_scene_tags_scene_idx on public.storyboard_scene_tags (scene_id);
create index if not exists storyboard_scene_tags_tag_idx on public.storyboard_scene_tags (tag);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'storyboard_scene_tags_set_timestamp'
          and tgrelid = 'public.storyboard_scene_tags'::regclass
    ) then
        create trigger storyboard_scene_tags_set_timestamp
            before update on public.storyboard_scene_tags
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.storyboard_scene_tags enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_scene_tags'
          and policyname = 'Storyboard scene tags are viewable by scene owners'
    ) then
        create policy "Storyboard scene tags are viewable by scene owners"
            on public.storyboard_scene_tags
            for select
            to authenticated
            using (
                exists (
                    select 1
                    from public.scenes s
                    where s.id = scene_id
                      and s.owner_id = auth.uid()
                )
            );
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_scene_tags'
          and policyname = 'Storyboard scene tags can be inserted by scene owners'
    ) then
        create policy "Storyboard scene tags can be inserted by scene owners"
            on public.storyboard_scene_tags
            for insert
            to authenticated
            with check (
                exists (
                    select 1
                    from public.scenes s
                    where s.id = scene_id
                      and s.owner_id = auth.uid()
                )
            );
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_scene_tags'
          and policyname = 'Storyboard scene tags are editable by scene owners'
    ) then
        create policy "Storyboard scene tags are editable by scene owners"
            on public.storyboard_scene_tags
            for update
            to authenticated
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
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'storyboard_scene_tags'
          and policyname = 'Storyboard scene tags are deletable by scene owners'
    ) then
        create policy "Storyboard scene tags are deletable by scene owners"
            on public.storyboard_scene_tags
            for delete
            to authenticated
            using (
                exists (
                    select 1
                    from public.scenes s
                    where s.id = scene_id
                      and s.owner_id = auth.uid()
                )
            );
    end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('storyboard', 'storyboard', false)
on conflict (id) do update set public = excluded.public;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'storyboard_select_auth'
    ) then
        create policy "storyboard_select_auth"
            on storage.objects for select
            to authenticated
            using (bucket_id = 'storyboard');
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'storyboard_insert_auth'
    ) then
        create policy "storyboard_insert_auth"
            on storage.objects for insert
            to authenticated
            with check (bucket_id = 'storyboard');
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'storyboard_delete_auth'
    ) then
        create policy "storyboard_delete_auth"
            on storage.objects for delete
            to authenticated
            using (bucket_id = 'storyboard');
    end if;
end;
$$;

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

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'scene_links_set_timestamp'
          and tgrelid = 'public.scene_links'::regclass
    ) then
        create trigger scene_links_set_timestamp
            before update on public.scene_links
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

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
