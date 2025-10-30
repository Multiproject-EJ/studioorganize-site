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
-- Scene assets and AI generation tracking
-- ---------------------------------------------------------------------------

create table if not exists public.assets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    scene_id uuid references public.scenes (id) on delete set null,
    kind text not null check (kind in ('reference', 'mask', 'render', 'upload')),
    storage_path text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists assets_owner_idx on public.assets (owner_id);
create index if not exists assets_scene_idx on public.assets (scene_id);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'assets_set_timestamp'
          and tgrelid = 'public.assets'::regclass
    ) then
        create trigger assets_set_timestamp
            before update on public.assets
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.assets enable row level security;

drop policy if exists "Assets are viewable by owners" on public.assets;
create policy "Assets are viewable by owners"
    on public.assets
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Assets can be inserted by owners" on public.assets;
create policy "Assets can be inserted by owners"
    on public.assets
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "Assets are editable by owners" on public.assets;
create policy "Assets are editable by owners"
    on public.assets
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "Assets are deletable by owners" on public.assets;
create policy "Assets are deletable by owners"
    on public.assets
    for delete
    using (auth.uid() = owner_id);

create table if not exists public.image_generations (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    scene_id uuid references public.scenes (id) on delete set null,
    provider text not null,
    prompt text not null,
    negative_prompt text,
    width integer,
    height integer,
    steps integer,
    guidance numeric,
    seed bigint,
    status text not null default 'queued',
    error text,
    storage_path text,
    asset_id uuid references public.assets (id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists image_generations_owner_idx on public.image_generations (owner_id);
create index if not exists image_generations_scene_idx on public.image_generations (scene_id);
create index if not exists image_generations_status_idx on public.image_generations (status);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'image_generations_set_timestamp'
          and tgrelid = 'public.image_generations'::regclass
    ) then
        create trigger image_generations_set_timestamp
            before update on public.image_generations
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.image_generations enable row level security;

drop policy if exists "Image jobs viewable by owners" on public.image_generations;
create policy "Image jobs viewable by owners"
    on public.image_generations
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Image jobs insertable by owners" on public.image_generations;
create policy "Image jobs insertable by owners"
    on public.image_generations
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "Image jobs updatable by owners" on public.image_generations;
create policy "Image jobs updatable by owners"
    on public.image_generations
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "Image jobs deletable by owners" on public.image_generations;
create policy "Image jobs deletable by owners"
    on public.image_generations
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
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'characters'
          and column_name = 'project_id'
    ) then
        if not exists (
            select 1
            from public.characters
            where project_id is null
            limit 1
        ) then
            begin
                alter table public.characters alter column project_id set not null;
            exception
                when others then
                    raise notice 'Unable to enforce NOT NULL on characters.project_id: %', sqlerrm;
            end;
        else
            raise notice 'Skipping NOT NULL enforcement on characters.project_id because existing rows contain null values.';
        end if;
    end if;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- Story AI preferences
-- ---------------------------------------------------------------------------

create table if not exists public.story_ai_preferences (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid,
    scope text not null default 'project' check (scope in ('project','new_story_template')),
    mode text not null check (mode in ('continue','new')),
    story_length text check (story_length in ('short','medium','long')),
    feature_flags jsonb not null default '{}'::jsonb,
    bias_note text,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create unique index if not exists story_ai_preferences_owner_scope_idx
    on public.story_ai_preferences (owner_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), scope);

create index if not exists story_ai_preferences_project_idx
    on public.story_ai_preferences (project_id);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'story_ai_preferences_set_timestamp'
          and tgrelid = 'public.story_ai_preferences'::regclass
    ) then
        create trigger story_ai_preferences_set_timestamp
            before update on public.story_ai_preferences
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.story_ai_preferences enable row level security;

drop policy if exists "AI prefs are viewable by owners" on public.story_ai_preferences;
create policy "AI prefs are viewable by owners"
    on public.story_ai_preferences
    for select
    using (auth.uid() = owner_id);

drop policy if exists "AI prefs can be inserted by owners" on public.story_ai_preferences;
create policy "AI prefs can be inserted by owners"
    on public.story_ai_preferences
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "AI prefs are editable by owners" on public.story_ai_preferences;
create policy "AI prefs are editable by owners"
    on public.story_ai_preferences
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "AI prefs are deletable by owners" on public.story_ai_preferences;
create policy "AI prefs are deletable by owners"
    on public.story_ai_preferences
    for delete
    using (auth.uid() = owner_id);
