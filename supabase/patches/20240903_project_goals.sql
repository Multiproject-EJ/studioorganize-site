-- Project goals table for screenplay workspace
-- Stores per-script pacing targets synced from the client UI.

create table if not exists public.project_goals (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    project_id uuid not null,
    script_id uuid,
    page_goal integer,
    runtime_goal_minutes integer,
    scene_goal integer,
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null,
    constraint project_goals_owner_project_unique unique (owner_id, project_id)
);

create index if not exists project_goals_owner_idx
    on public.project_goals (owner_id, project_id);

create index if not exists project_goals_project_idx
    on public.project_goals (project_id);

-- keep updated_at current automatically
-- reuse the shared timestamp trigger helper if it exists

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'project_goals_set_timestamp'
    ) then
        create trigger project_goals_set_timestamp
            before update on public.project_goals
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.project_goals enable row level security;

drop policy if exists "project_goals_select" on public.project_goals;
create policy "project_goals_select"
    on public.project_goals
    for select
    using (auth.uid() = owner_id);

drop policy if exists "project_goals_insert" on public.project_goals;
create policy "project_goals_insert"
    on public.project_goals
    for insert
    with check (auth.uid() = owner_id);

drop policy if exists "project_goals_update" on public.project_goals;
create policy "project_goals_update"
    on public.project_goals
    for update
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "project_goals_delete" on public.project_goals;
create policy "project_goals_delete"
    on public.project_goals
    for delete
    using (auth.uid() = owner_id);
