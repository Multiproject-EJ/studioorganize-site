-- Set Designer scene + set tables
create table if not exists public.set_designer_scenes (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid not null,
    title text not null default '',
    storyboard_reference text,
    brief text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists set_designer_scenes_owner_idx on public.set_designer_scenes (owner_id);
create index if not exists set_designer_scenes_project_idx on public.set_designer_scenes (project_id);

-- keep updated_at fresh
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_designer_scenes_set_timestamp'
          AND tgrelid = 'public.set_designer_scenes'::regclass
    ) THEN
        CREATE TRIGGER set_designer_scenes_set_timestamp
            BEFORE UPDATE ON public.set_designer_scenes
            FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp();
    END IF;
END;
$$;

alter table public.set_designer_scenes enable row level security;

drop policy if exists "Set designer scenes are viewable by owners" on public.set_designer_scenes;
create policy "Set designer scenes are viewable by owners"
    on public.set_designer_scenes
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Set designer scenes are insertable by owners" on public.set_designer_scenes;
create policy "Set designer scenes are insertable by owners"
    on public.set_designer_scenes
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "Set designer scenes are updatable by owners" on public.set_designer_scenes;
create policy "Set designer scenes are updatable by owners"
    on public.set_designer_scenes
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "Set designer scenes are deletable by owners" on public.set_designer_scenes;
create policy "Set designer scenes are deletable by owners"
    on public.set_designer_scenes
    for delete
    using (auth.uid() = owner_id);

-- individual sets linked to a scene
create table if not exists public.set_designer_sets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    scene_id uuid not null references public.set_designer_scenes (id) on delete cascade,
    name text not null default '',
    narrative_intent text,
    environment text,
    visual_style text,
    lighting text,
    palette text,
    details text,
    camera text,
    beats text,
    prop_focus text,
    base_prompt text,
    concept_prompts text[] not null default '{}'::text[],
    images jsonb not null default '[]'::jsonb,
    props jsonb not null default '[]'::jsonb,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists set_designer_sets_owner_idx on public.set_designer_sets (owner_id);
create index if not exists set_designer_sets_scene_idx on public.set_designer_sets (scene_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_designer_sets_set_timestamp'
          AND tgrelid = 'public.set_designer_sets'::regclass
    ) THEN
        CREATE TRIGGER set_designer_sets_set_timestamp
            BEFORE UPDATE ON public.set_designer_sets
            FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp();
    END IF;
END;
$$;

alter table public.set_designer_sets enable row level security;

drop policy if exists "Set designer sets are viewable by owners" on public.set_designer_sets;
create policy "Set designer sets are viewable by owners"
    on public.set_designer_sets
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Set designer sets are insertable by owners" on public.set_designer_sets;
create policy "Set designer sets are insertable by owners"
    on public.set_designer_sets
    for insert
    with check (
        auth.uid() = owner_id
        and exists (
            select 1
            from public.set_designer_scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Set designer sets are updatable by owners" on public.set_designer_sets;
create policy "Set designer sets are updatable by owners"
    on public.set_designer_sets
    for update
    using (auth.uid() = owner_id)
    with check (
        auth.uid() = owner_id
        and exists (
            select 1
            from public.set_designer_scenes s
            where s.id = scene_id
              and s.owner_id = auth.uid()
        )
    );

drop policy if exists "Set designer sets are deletable by owners" on public.set_designer_sets;
create policy "Set designer sets are deletable by owners"
    on public.set_designer_sets
    for delete
    using (auth.uid() = owner_id);
