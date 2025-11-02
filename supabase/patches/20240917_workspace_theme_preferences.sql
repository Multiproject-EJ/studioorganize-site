-- Workspace theme preferences table

create table if not exists public.workspace_theme_preferences (
    owner_id uuid not null references public.profiles (id) on delete cascade,
    module text not null,
    theme text not null check (theme in ('light','dark')),
    created_at timestamptz default timezone('utc', now()) not null,
    updated_at timestamptz default timezone('utc', now()) not null,
    primary key (owner_id, module)
);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'workspace_theme_preferences_set_timestamp'
          and tgrelid = 'public.workspace_theme_preferences'::regclass
    ) then
        create trigger workspace_theme_preferences_set_timestamp
            before update on public.workspace_theme_preferences
            for each row execute function public.set_current_timestamp();
    end if;
end;
$$;

alter table public.workspace_theme_preferences enable row level security;

drop policy if exists "Workspace themes are viewable by owners" on public.workspace_theme_preferences;
create policy "Workspace themes are viewable by owners"
    on public.workspace_theme_preferences
    for select
    using (auth.uid() = owner_id);

drop policy if exists "Workspace themes can be upserted by owners" on public.workspace_theme_preferences;
create policy "Workspace themes can be upserted by owners"
    on public.workspace_theme_preferences
    for all
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);
