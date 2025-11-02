-- Story Idea Phase storage patch
-- Captures outputs from the Creative Hub "Idea Phase — Story Games" tools.

create table if not exists public.story_idea_runs (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    app_set text not null,
    app_id text not null,
    title text,
    goal text,
    summary text,
    payload jsonb,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists story_idea_runs_owner_idx
    on public.story_idea_runs (owner_id, created_at desc);

-- keep updated_at current automatically
do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'story_idea_runs_set_timestamp'
    ) then
        create trigger story_idea_runs_set_timestamp
            before update on public.story_idea_runs
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

create table if not exists public.story_idea_seasons (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.story_idea_runs (id) on delete cascade,
    season_order int not null default 1,
    season_name text not null,
    description text,
    created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists story_idea_seasons_run_idx
    on public.story_idea_seasons (run_id, season_order);

create table if not exists public.story_idea_episodes (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references public.story_idea_seasons (id) on delete cascade,
    episode_order int not null default 1,
    episode_title text not null,
    logline text,
    created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists story_idea_episodes_season_idx
    on public.story_idea_episodes (season_id, episode_order);

alter table public.story_idea_runs enable row level security;

drop policy if exists "story_idea_runs_select" on public.story_idea_runs;
create policy "story_idea_runs_select"
    on public.story_idea_runs
    for select
    using (auth.uid() = owner_id);

drop policy if exists "story_idea_runs_insert" on public.story_idea_runs;
create policy "story_idea_runs_insert"
    on public.story_idea_runs
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "story_idea_runs_update" on public.story_idea_runs;
create policy "story_idea_runs_update"
    on public.story_idea_runs
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "story_idea_runs_delete" on public.story_idea_runs;
create policy "story_idea_runs_delete"
    on public.story_idea_runs
    for delete
    using (auth.uid() = owner_id);

alter table public.story_idea_seasons enable row level security;

drop policy if exists "story_idea_seasons_select" on public.story_idea_seasons;
create policy "story_idea_seasons_select"
    on public.story_idea_seasons
    for select
    using (
        exists (
            select 1
            from public.story_idea_runs r
            where r.id = story_idea_seasons.run_id
              and r.owner_id = auth.uid()
        )
    );

drop policy if exists "story_idea_seasons_insert" on public.story_idea_seasons;
create policy "story_idea_seasons_insert"
    on public.story_idea_seasons
    for insert
    with check (
        exists (
            select 1
            from public.story_idea_runs r
            where r.id = story_idea_seasons.run_id
              and r.owner_id = auth.uid()
        )
    );

drop policy if exists "story_idea_seasons_update" on public.story_idea_seasons;
create policy "story_idea_seasons_update"
    on public.story_idea_seasons
    for update
    using (
        exists (
            select 1
            from public.story_idea_runs r
            where r.id = story_idea_seasons.run_id
              and r.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.story_idea_runs r
            where r.id = story_idea_seasons.run_id
              and r.owner_id = auth.uid()
        )
    );

drop policy if exists "story_idea_seasons_delete" on public.story_idea_seasons;
create policy "story_idea_seasons_delete"
    on public.story_idea_seasons
    for delete
    using (
        exists (
            select 1
            from public.story_idea_runs r
            where r.id = story_idea_seasons.run_id
              and r.owner_id = auth.uid()
        )
    );

alter table public.story_idea_episodes enable row level security;

drop policy if exists "story_idea_episodes_select" on public.story_idea_episodes;
create policy "story_idea_episodes_select"
    on public.story_idea_episodes
    for select
    using (
        exists (
            select 1
            from public.story_idea_seasons s
            join public.story_idea_runs r on r.id = s.run_id
            where s.id = story_idea_episodes.season_id
              and r.owner_id = auth.uid()
        )
    );

drop policy if exists "story_idea_episodes_insert" on public.story_idea_episodes;
create policy "story_idea_episodes_insert"
    on public.story_idea_episodes
    for insert
    with check (
        exists (
            select 1
            from public.story_idea_seasons s
            join public.story_idea_runs r on r.id = s.run_id
            where s.id = story_idea_episodes.season_id
              and r.owner_id = auth.uid()
        )
    );

drop policy if exists "story_idea_episodes_update" on public.story_idea_episodes;
create policy "story_idea_episodes_update"
    on public.story_idea_episodes
    for update
    using (
        exists (
            select 1
            from public.story_idea_seasons s
            join public.story_idea_runs r on r.id = s.run_id
            where s.id = story_idea_episodes.season_id
              and r.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.story_idea_seasons s
            join public.story_idea_runs r on r.id = s.run_id
            where s.id = story_idea_episodes.season_id
              and r.owner_id = auth.uid()
        )
    );

drop policy if exists "story_idea_episodes_delete" on public.story_idea_episodes;
create policy "story_idea_episodes_delete"
    on public.story_idea_episodes
    for delete
    using (
        exists (
            select 1
            from public.story_idea_seasons s
            join public.story_idea_runs r on r.id = s.run_id
            where s.id = story_idea_episodes.season_id
              and r.owner_id = auth.uid()
        )
    );
