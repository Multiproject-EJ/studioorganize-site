# Storyboard (Supabase-only) — Drop-in Integration

This plan outlines the Supabase-only implementation strategy for the upcoming storyboard feature. It leverages existing project and scene tables while keeping all new logic scoped to `src/storyboard/*`.

## 1. Database: Delta Only (Safe Migrations)
Run the following in the Supabase SQL editor:

```sql
-- ---------- TABLES ----------
create table if not exists frames (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references scenes(id) on delete cascade,
  caption text default '',
  position int not null,
  duration_ms int default 1500,
  media_type text not null check (media_type in ('image','video')),
  storage_path text not null,  -- Supabase Storage path
  thumb_path text,             -- optional
  created_at timestamptz default now()
);

create table if not exists scene_tags (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references scenes(id) on delete cascade,
  tag text not null
);

-- Optional acts (only if you don’t already have them)
create table if not exists acts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  position int not null,
  created_at timestamptz default now()
);

-- ---------- RLS ----------
alter table frames enable row level security;
alter table scene_tags enable row level security;
alter table acts enable row level security;

-- Ownership model A: project owner only
create policy "frames_select_owner"
on frames for select
to authenticated
using (exists (
  select 1 from scenes s
  join projects p on p.id = s.project_id
  where s.id = frames.scene_id and p.owner_id = auth.uid()
));

create policy "frames_cud_owner"
on frames for all
to authenticated
using (exists (
  select 1 from scenes s
  join projects p on p.id = s.project_id
  where s.id = frames.scene_id and p.owner_id = auth.uid()
))
with check (true);

create policy "scene_tags_owner_select"
on scene_tags for select
to authenticated
using (exists (
  select 1 from scenes s
  join projects p on p.id = s.project_id
  where s.id = scene_tags.scene_id and p.owner_id = auth.uid()
));

create policy "scene_tags_owner_cud"
on scene_tags for all
to authenticated
using (exists (
  select 1 from scenes s
  join projects p on p.id = s.project_id
  where s.id = scene_tags.scene_id and p.owner_id = auth.uid()
))
with check (true);

-- Acts policies (mirror ownership)
create policy "acts_owner_select"
on acts for select
to authenticated
using (exists (
  select 1 from projects p where p.id = acts.project_id and p.owner_id = auth.uid()
));

create policy "acts_owner_cud"
on acts for all
to authenticated
using (exists (
  select 1 from projects p where p.id = acts.project_id and p.owner_id = auth.uid()
))
with check (true);
```

If you have a `project_members(project_id, user_id, role)` table, duplicate the policies to allow roles in `('owner','editor')`.

## 2. Storage (Supabase-only)

Create the storage bucket:

```sql
insert into storage.buckets (id, name, public)
values ('storyboard','storyboard', false)
on conflict (id) do nothing;
```

Apply storage policies:

```sql
create policy "storyboard_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'storyboard');

create policy "storyboard_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'storyboard');

create policy "storyboard_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'storyboard');
```

Storage path convention:

```
storyboard/{projectId}/scenes/{sceneId}/frames/{frameId}.{ext}
storyboard/{projectId}/scenes/{sceneId}/thumbs/{frameId}.jpg  (optional)
```

## 3. Adapter (fits existing API)
`src/storyboard/adapter.ts` uses only `@supabase/supabase-js`:

```ts
import { supabase } from "@/lib/supabase";

export type Frame = {
  id:string; scene_id:string; caption:string; position:number;
  duration_ms:number; media_type:"image"|"video";
  storage_path:string; thumb_path?:string|null;
};

export async function listScenesWithFrames(projectId: string) {
  const { data, error } = await supabase
    .from("scenes")
    .select(`
      id, project_id, title, position, synopsis, script_excerpt, act_id,
      frames(*),
      scene_tags(tag),
      acts:act_id(name, position)
    `)
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("position", { referencedTable: "frames", ascending: true });
  if (error) throw error;
  return (data ?? []).map(s => ({
    ...s,
    tags: (s.scene_tags ?? []).map((t:any)=>t.tag),
    frames: (s.frames ?? []) as Frame[],
    actName: s.acts?.name ?? null
  }));
}

export async function addFrame(sceneId: string, file: File, media_type: "image"|"video", opts?: { caption?:string; duration_ms?:number }) {
  const frameId = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || (media_type === "image" ? "png" : "mp4")).toLowerCase();
  const storage_path = `storyboard/${sceneId}/${frameId}.${ext}`;

  const up = await supabase.storage.from("storyboard").upload(storage_path, file, { upsert: false });
  if (up.error) throw up.error;

  const { data: max } = await supabase
    .from("frames").select("position")
    .eq("scene_id", sceneId).order("position", { ascending:false }).limit(1).maybeSingle();

  const { data, error } = await supabase.from("frames").insert({
    id: frameId, scene_id: sceneId, media_type, storage_path,
    caption: opts?.caption ?? "", duration_ms: opts?.duration_ms ?? 1500,
    position: (max?.position ?? 0) + 1
  }).select().single();
  if (error) throw error;
  return data;
}

export async function reorderFrames(sceneId: string, orderedIds: string[]) {
  const updates = orderedIds.map((id, idx) => ({ id, position: idx + 1 }));
  const { error } = await supabase.from("frames").upsert(updates);
  if (error) throw error;
}

export async function deleteFrame(frameId: string) {
  const { data: fr, error: e1 } = await supabase.from("frames").select("storage_path").eq("id", frameId).single();
  if (e1) throw e1;
  await supabase.storage.from("storyboard").remove([fr.storage_path]);
  const { error: e2 } = await supabase.from("frames").delete().eq("id", frameId);
  if (e2) throw e2;
}

/** Private bucket: get time-limited URL for playback/display */
export async function getSignedUrl(path: string, seconds = 60 * 10) {
  const { data, error } = await supabase.storage.from("storyboard").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}
```

## 4. UI Mount (inside existing writer/project page)
- Add a Storyboard tab/panel (no new route).
- Support `?view=overview|outline|animatic` query parameter.
- Serve media via `getSignedUrl()`; keep the bucket private.

### Files to Add
- `src/storyboard/StoryboardPanel.tsx`
- `src/storyboard/views/Overview.tsx`
- `src/storyboard/views/Outline.tsx`
- `src/storyboard/views/Animatic.tsx`
- `src/storyboard/SceneCard.tsx`
- `src/storyboard/SceneDetailModal.tsx`
- `src/storyboard/adapter.ts`

### Minimal Animatic Example
```tsx
import { useEffect, useMemo, useState } from "react";
import { listScenesWithFrames, getSignedUrl } from "../adapter";

export function Animatic({ projectId }:{projectId:string}) {
  const [frames,setFrames] = useState<any[]>([]);
  const [idx,setIdx] = useState(0);
  const [playing,setPlaying] = useState(false);
  const [url,setUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      const scenes = await listScenesWithFrames(projectId);
      const flat = scenes
        .sort((a:any,b:any)=>a.position-b.position)
        .flatMap((s:any)=> (s.frames||[]).sort((a:any,b:any)=>a.position-b.position)
          .map((f:any)=> ({...f, sceneTitle: s.title})));
      setFrames(flat);
    })();
  }, [projectId]);

  useEffect(()=>{
    (async () => {
      if (!frames[idx]) return;
      setUrl(await getSignedUrl(frames[idx].storage_path));
    })();
  }, [idx, frames]);

  useEffect(()=>{
    if(!playing || !frames[idx]) return;
    const t = setTimeout(()=> setIdx(i => (i+1) % frames.length), frames[idx].duration_ms || 1500);
    return ()=> clearTimeout(t);
  }, [playing, idx, frames]);

  if(!frames.length) return <div className="p-6 text-sm opacity-70">No frames yet.</div>;

  const f = frames[idx];
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-xs opacity-70">{f.sceneTitle} — frame {idx+1}/{frames.length}</div>
      <div className="border rounded-lg overflow-hidden flex items-center justify-center aspect-video bg-black/80">
        {f.media_type === "video" ? (
          <video key={url} src={url} autoPlay={playing} controls style={{maxWidth:'100%', maxHeight:'100%'}} />
        ) : (
          <img src={url} alt={f.caption||f.sceneTitle} style={{maxWidth:'100%', maxHeight:'100%'}} />
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={()=>setPlaying(p=>!p)}>{playing?'Pause':'Play'}</button>
        <button onClick={()=>setIdx(i=> (i-1+frames.length)%frames.length)}>Prev</button>
        <button onClick={()=>setIdx(i=> (i+1)%frames.length)}>Next</button>
      </div>
    </div>
  );
}
```

*(Overview grid, Outline list, and Scene Detail modal follow the same pattern: fetch with `listScenesWithFrames`, display signed URLs, call `addFrame`, `reorderFrames`, etc.)*

## 5. Exports (No External Libraries)
- JSON export: build `{ projectId, scenes:[…], frames:[…] }` and trigger download via `URL.createObjectURL`.
- ZIP export: optional; can be added later using an existing in-repo utility.

## 6. Feature Flag & Rollout
- Add `VITE_FEATURE_STORYBOARD=true` to `.env`.
- Gate the storyboard tab behind the feature flag.
- Optional: log metrics via the existing event logger.

## 7. QA Checklist
1. Create three scenes; upload two to three images per scene.
2. Reorder frames and verify persistence after refresh.
3. Confirm Animatic playback respects frame durations.
4. Scene detail view displays synopsis and script excerpts.
5. JSON export downloads correct paths and metadata.
6. Verify media loads exclusively via signed URLs.

## 8. GitHub Issues (Suggested Breakdown)
1. **SQL & Storage** — Apply migrations and create the storage bucket with policies.
2. **Adapter** — Implement `src/storyboard/adapter.ts` with Supabase helpers.
3. **UI Shell** — Add the storyboard tab with view switching.
4. **Overview** — Grid of scene cards; first frame as key art; open detail modal.
5. **Scene Detail** — Frames grid with upload/delete/reorder, caption/duration controls, scene text.
6. **Outline** — Text-first list grouped by acts; integrate scene reordering.
7. **Animatic** — Playback experience spanning all frames with controls.
8. **Export** — JSON download for storyboard data.
9. **QA** — Execute manual QA checklist and confirm signed URL usage.

## Notes for Codex
- Use only `@supabase/supabase-js` and the existing application stack.
- Access media exclusively via `createSignedUrl()` from a private bucket.
- Do not modify existing `scenes` schema; storyboard additions are additive.
- Keep all storyboard-specific components within `src/storyboard/*`.
