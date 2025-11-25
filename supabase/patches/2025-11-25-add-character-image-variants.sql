-- Character Image Variants
-- Migration to add persistent variants for refined character images
-- Enables saving multiple visual iterations instead of overwriting the main portrait
--
-- Note: This migration is additive and does not affect existing character portraits.
-- Existing portrait URLs in the characters table (look_portrait_url, base_image_url) 
-- remain unchanged. Users can optionally migrate existing portraits to variants 
-- by manually inserting rows with is_main = true.

-- ---------------------------------------------------------------------------
-- character_image_variants table
-- ---------------------------------------------------------------------------

create table if not exists public.character_image_variants (
    id uuid primary key default gen_random_uuid(),
    character_id uuid not null references public.characters (id) on delete cascade,
    image_url text not null,
    storage_path text not null,
    refine_params jsonb not null default '{}'::jsonb,
    prompt_meta jsonb not null default '{}'::jsonb,
    is_main boolean not null default false,
    created_at timestamptz not null default now()
);

-- Indexes for efficient queries
create index if not exists idx_variants_character_created_at 
    on public.character_image_variants (character_id, created_at desc);

create index if not exists idx_variants_character_is_main 
    on public.character_image_variants (character_id, is_main);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Mirror characters table policies: owner can insert/select/update/delete
-- variants where variant.character_id belongs to their project/user context

alter table public.character_image_variants enable row level security;

drop policy if exists "Character variants are viewable by owners" on public.character_image_variants;
create policy "Character variants are viewable by owners"
    on public.character_image_variants
    for select
    using (
        exists (
            select 1
            from public.characters c
            where c.id = character_id
              and c.owner_id = auth.uid()
        )
    );

drop policy if exists "Character variants can be inserted by owners" on public.character_image_variants;
create policy "Character variants can be inserted by owners"
    on public.character_image_variants
    for insert
    with check (
        exists (
            select 1
            from public.characters c
            where c.id = character_id
              and c.owner_id = auth.uid()
        )
    );

drop policy if exists "Character variants are editable by owners" on public.character_image_variants;
create policy "Character variants are editable by owners"
    on public.character_image_variants
    for update
    using (
        exists (
            select 1
            from public.characters c
            where c.id = character_id
              and c.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.characters c
            where c.id = character_id
              and c.owner_id = auth.uid()
        )
    );

drop policy if exists "Character variants are deletable by owners" on public.character_image_variants;
create policy "Character variants are deletable by owners"
    on public.character_image_variants
    for delete
    using (
        exists (
            select 1
            from public.characters c
            where c.id = character_id
              and c.owner_id = auth.uid()
        )
    );
