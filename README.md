# StudioOrganize Site

This repository contains the static marketing site for StudioOrganize. It is built as a lightweight static site so it can be hosted on any static file host (GitHub Pages, Netlify, etc.).

## Local development

Because this is a static site, local development simply involves opening the HTML files in a browser or serving the root directory with a simple HTTP server such as `python -m http.server`.

## Supabase authentication & member area

User authentication and member data are powered by [Supabase](https://supabase.com/). To understand how the Supabase project is structured and how the site communicates with it, read [`SUPABASE.md`](SUPABASE.md).

Environment variables required to interact with Supabase:

```
SUPABASE_URL=https://ycgqgkwwitqunabowswi.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Fna3d3aXRxdW5hYm93c3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTg2NTAsImV4cCI6MjA3NDczNDY1MH0.W0mKqZlHVn6tRYSyZ4VRK4zCpCPC1ICwqtqoWrQMBuU
```

> ⚠️  Only the `anon` key should be embedded in the browser. Service-role keys must never be committed to the repository or exposed to browsers.

SQL migrations and schema documentation for Supabase live in the [`supabase/`](supabase/) directory.

## Character Studio overview

The screenplay writer now includes a Character Studio workspace that launches from the **Characters** tab. Writers can review their cast, update profiles, manage look references, track stats, plan arcs, and queue AI prompts from the dedicated overlay view. Character data is saved locally inside the writer experience and can be synchronized with Supabase using the `public.characters` table described in [`SUPABASE.md`](SUPABASE.md).

## Script editor formatting capabilities

Inside the screenplay writer, the main script panel is a structured `contenteditable` surface that stores every paragraph as a `.line` element with a semantic type (slug, action, character, parenthetical, dialogue, or transition). This keeps the layout screenplay-friendly while still allowing writers to type freely. The CSS rules in [`use-cases/screenplay-writing.html`](use-cases/screenplay-writing.html) define the visual treatment for each line type so slugs appear bold, characters are uppercased, parentheticals are indented, and so on.

Writers can:

* Click the **Insert Line** chips (Slug, Action, Character, Parenthetical, Dialogue, Transition) in the right sidebar to inject a new formatted block next to the active cursor.
* Use the **Scene Slug** chips to quickly prepend common prefixes such as `INT.`/`EXT.` and suffixes like `DAY`/`NIGHT` to the current scene’s slug field.
* Tap any character in the **Characters** tab to insert that name as a properly formatted CHARACTER line without retyping it.
* Enable **Smart format** in settings so the editor auto-detects the appropriate line class (e.g., automatically converting `INT.` lines to slugs or uppercased names to CHARACTER lines) after each edit.

Because every block is tagged, it is straightforward to extend the editor with richer UI affordances such as contextual menus or tag pickers: you can look at the `.dataset.t` value on the focused `.line` node to decide which quick actions to surface (e.g., toggling between Action/Dialog, attaching beat tags, or linking to characters/plot structures). Any inline mini menu would simply need to update that dataset and class list to keep the formatting consistent with the existing screenplay styles.

## Persisted selection metadata

The contextual selection menu stores every choice (line type, story part, three-act beat, and optional character owner) directly on each scene element before a save runs. The serialization helpers normalise every `.line` into a `scene.elements` entry with `t`, `txt`, `ownerId`, `storyPart`, and `storyBeat` fields, and those objects are what get pushed to Supabase. When the editor loads, `normalizeSceneElement()` rebuilds that structure so the renderer can rehydrate the badges and accents from persisted data. This means opening the same scene later—locally or from Supabase—preserves the mini-menu tagging without extra coding.

