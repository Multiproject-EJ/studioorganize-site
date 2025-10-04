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

