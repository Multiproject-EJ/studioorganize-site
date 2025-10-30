# Supabase Integration Guide

This document explains how StudioOrganize uses Supabase for authentication and member data. The Supabase project for this site lives at `https://ycgqgkwwitqunabowswi.supabase.co`.

## Overview

The site relies on Supabase Auth to allow members to create accounts and sign in. The Supabase JavaScript client is loaded in the browser to perform the following actions:

- `signUp({ email, password, options })` – create a new account and optional profile information.
- `signInWithPassword({ email, password })` – allow returning members to log in.
- `getSession()` / `onAuthStateChange()` – persist login state between page visits and show/hide member-only UI.
- `from('profiles')` queries – fetch and update member profile data stored in the `profiles` table.

Profiles are stored in the public schema and reference Supabase's `auth.users` table. Row Level Security (RLS) ensures that each signed-in member can only view and modify their own profile data.

### Profiles table vs. member directory view

- **`public.profiles` table** – this is the canonical record that belongs to each account. The trigger defined in [`supabase/schema.sql`](supabase/schema.sql) inserts a row every time Supabase Auth creates a new `auth.users` entry, so the same UUID is shared between the auth user and the profile. Any updates you make to names, studios, or phone numbers are persisted here, and Row Level Security limits read/write access to the owner of the row.
- **`public.member_directory` view** – this view simply selects the columns from `public.profiles` and exposes them in a read-only shape that is convenient for dashboards or admin tooling. Because it is a view, it does not store any additional data; it always reflects the contents of the `profiles` table.

When members sign up or sign in, Supabase Auth is interacting with the managed `auth.users` table, not the `member_directory` view. The view is only used for querying profile metadata after authentication succeeds.

Supabase manages email/password credentials inside the `auth.users` table (passwords are stored securely as salted hashes), so you will not see a `password` column in `public.profiles` or any other table in the public schema. Authentication happens through the Auth API, and the profile row is linked via the shared UUID.

Supabase SQL schema files live in [`supabase/schema.sql`](supabase/schema.sql). Run the SQL file inside the Supabase SQL editor (or the CLI) to set up the necessary tables, triggers, and policies.

## Environment variables

Expose the following values to the frontend (e.g., via a `.env` file if you are using a local dev server or bundler):

```
SUPABASE_URL=https://ycgqgkwwitqunabowswi.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Fna3d3aXRxdW5hYm93c3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTg2NTAsImV4cCI6MjA3NDczNDY1MH0.W0mKqZlHVn6tRYSyZ4VRK4zCpCPC1ICwqtqoWrQMBuU
```

When deploying, configure these values in your hosting platform's environment variable settings.

### Redirect URLs for Supabase Auth

Supabase should always have a default redirect URL and at least one explicit redirect to hand users back to the marketing site
after they confirm their email. Configure the **Site URL** and **Redirect URLs** in the Supabase dashboard as follows:

- **Site URL**: `https://studioorganize.com`
- **Redirect URLs**: `https://studioorganize.com/auth/callback` and `http://localhost:3000/` (for local development)

The `/auth/callback` route is included in this repository (`auth/callback/index.html`). It thanks the visitor for confirming
their account, surfaces any Supabase error messages, and forwards them to the workspace at
`https://app.studioorganize.com`.

## Initializing the client in the browser

Add the Supabase client to your HTML templates. For example:

```html
<script type="module">
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const supabase = createClient(
    window.ENV.SUPABASE_URL,
    window.ENV.SUPABASE_ANON_KEY
  );

  async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      document.body.classList.add('is-authenticated');
    }

    supabase.auth.onAuthStateChange((_event, currentSession) => {
      document.body.classList.toggle('is-authenticated', !!currentSession);
    });
  }

  initializeAuth();
</script>
```

You can adapt this snippet to your build setup. The key steps are to:

1. Create a single Supabase client with your URL and anon key.
2. Handle `signUp`, `signInWithPassword`, and `signOut` events via form submissions or buttons.
3. Listen to `onAuthStateChange` to update the UI when the user logs in or out.
4. Use `supabase.from('profiles')` queries to read and persist profile information.

## Member profile lifecycle

1. When a new user signs up, a database trigger automatically inserts a row into `public.profiles` with the same UUID as the user.
2. Row Level Security policies allow each user to read and update only their own profile.
3. Use `supabase.functions.invoke` or direct `profiles` updates to store optional metadata such as studio name, phone number, etc.

Refer to the schema file for exact column names and policies.

### Character Studio catalog

Run the Character Studio block inside [`supabase/schema.sql`](supabase/schema.sql) to provision the `public.characters` table. Each row stores the extended character profile that the writer UI manages—biographical metadata, stats, look references, arc notes, and AI prompt fields. Ownership mirrors other resources by tying `owner_id` back to `public.profiles.id`, and Row Level Security policies limit reads and writes to the signed-in owner. Once the table exists, sync Character Studio updates from the client by inserting or upserting one row per character and including `project_id` when you want to group casts by project.

Key columns:

- `name`, `role`, `archetype`, `pronouns`, `age` – identity basics surfaced in the cast list.
- `summary`, `background`, `family_tree`, `traits[]` – narrative context and quick-reference traits.
- `stats_scenes`, `stats_screen_time`, `stats_dialogue` – analytics the UI maintains to show character involvement.
- `look_portrait_url`, `look_turnaround_urls[]`, `look_expression_urls[]` – references for artwork and expressions.
- `arc_setup`, `arc_development`, `arc_resolution` – notes that power the Character Arc panel.
- `ai_prompt`, `ai_notes` – prompt history for the AI image integration.

### Scenes & connected data

Run the latest [`supabase/schema.sql`](supabase/schema.sql) file to create the new scene tables. The script is additive—it only provisions the scene-related tables, indexes, policies, and triggers, and safely skips objects (like `public.profiles`) that are already in your project. Because trigger creation is wrapped in guards, you can run it multiple times without conflicting with existing infrastructure.

Key tables that ship with the schema:

- `public.scenes` – top-level scene records. Includes metadata such as slug/title, script order, location/time of day, color chip, plus JSON columns (`cards`, `elements`, `sounds`, `metadata`) that mirror the browser data structure. Each row is owned by a member (`owner_id` → `public.profiles.id`).
- `public.scene_beats` – ordered beats/cards associated with a scene. Use this if you need structured rows instead of relying on the JSON array stored on the parent scene.
- `public.scene_elements` – screenplay elements (action, dialogue, etc.) stored with their order and optional metadata.
- `public.scene_sounds` – cues or music notes tied to a scene with sortable positions.
- `public.scene_links` – flexible join table to associate a scene with other resources (characters, props, locations, tasks). Store the target UUID in `linked_id`, a human-readable label in `display_name`, and any extra data in `metadata`.

All supporting tables enforce RLS by checking that the requesting user owns the parent `scene_id`. Insert/update/delete attempts will fail if a user tries to touch a scene they do not own.

To create a new scene from the client:

```js
const { data, error } = await supabase
  .from('scenes')
  .insert({
    owner_id: user.id,
    slug: 'INT. STUDIO - DAY',
    title: 'Office brainstorm',
    synopsis: 'Team debates the next marketing push.',
    scene_number: 7,
    script_order: 7,
    location: 'Studio bullpen',
    time_of_day: 'DAY',
    cards: [{ id: crypto.randomUUID(), title: 'Brainstorm start' }],
    elements: [
      { t: 'action', txt: 'The team gathers around the whiteboard.' }
    ]
  })
  .select();
```

Follow-up inserts into `scene_beats`, `scene_elements`, `scene_sounds`, and `scene_links` should include the `scene_id` returned above so they inherit ownership permissions automatically.

### Story AI preferences

Run the Story AI preferences block inside [`supabase/schema.sql`](supabase/schema.sql) to create the `public.story_ai_preferences` table. Each row stores the assistant plan for a specific script (`scope = 'project'`) or the default template for brand-new stories (`scope = 'new_story_template'`). Rows are owned by the profile that created them, and RLS ensures only the owner can read or change the settings.

Key columns:

- `project_id` – nullable. When populated, the preferences apply to that script’s UUID. When null, the row represents the new-story template.
- `mode` – either `continue` or `new`, indicating whether the assistant should focus on progress against existing goals or spin up a fresh outline.
- `story_length` – `short`, `medium`, or `long` length hint saved when `mode = 'new'`.
- `feature_flags` – JSON object describing coaching toggles such as progress nudges or structure check-ins.
- `bias_note` – optional freeform guidance the UI surfaces whenever the assistant responds.

### Script library metadata

The screenplay writer’s “Load Script” dialog pulls its list from a `public.project_data` table in Supabase. Each row should include a human-readable script name so the dropdown can surface more than the UUID. Use the following SQL in the Supabase SQL editor to provision the table with the expected columns (including `script_name`). Because the column is part of the `CREATE TABLE` statement, you do **not** need to run a separate `ALTER TABLE` afterward.

```sql
create table if not exists public.project_data (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  project_id uuid,
  script_id uuid,
  script_name text,
  name text,
  title text,
  description text,
  summary text,
  image_url text,
  thumbnail_url text,
  project_json jsonb,
  project jsonb,
  script jsonb,
  payload jsonb,
  data jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);
```

If you already have a compatible `project_data` table, you can still run `ALTER TABLE public.project_data ADD COLUMN IF NOT EXISTS script_name text;` to add the column without redefining the table. After the column exists, populate it (and any artwork URLs) so the writer can display friendly titles and thumbnails in the modal.

### Applying the scene schema to an existing project

If your Supabase project is already live, you do **not** need to reprovision the full StudioOrganize schema. Instead, run [`supabase/schema.sql`](supabase/schema.sql) directly:

1. Open the Supabase Dashboard → SQL Editor, paste in the file contents, and execute the script; or
2. Use the CLI: `supabase db execute --file supabase/schema.sql --db-url <your_connection_string>`.

Either approach adds the scene tables (and related policies/triggers) while leaving your existing auth, profile, and billing tables untouched.

## Testing the workflow

1. Open the Supabase Dashboard and run the SQL in [`supabase/schema.sql`](supabase/schema.sql) using the SQL editor. This now
   includes an `is_admin` flag on profiles so you can promote specific team members.
2. In the Authentication settings, enable email/password sign-ups and configure any required email templates (e.g., confirmation emails).
3. Load the site locally, open the browser console, and instantiate the Supabase client as shown above.
4. Call `supabase.auth.signUp({ email, password })` to create a new account. Confirm the email if required by your project settings.
5. Use `supabase.auth.signInWithPassword` to verify that login works and that you can fetch/update your profile using `supabase.from('profiles')` queries.

### Troubleshooting “sign-ups are disabled” errors

If the signup form reports that new accounts are disabled:

1. Visit **Authentication → Providers** in the Supabase dashboard.
2. Ensure the **Email** provider has “Enable Email Signup” toggled on.
3. Scroll down to **Advanced settings** and confirm “Disable new user signups” is turned off.
4. If you enforce an email domain allow list, add the address you are testing with to the allow list.

After updating these settings, reload the public site and submit the form again. The frontend reads the Supabase Auth configuration on load and will now surface the warning immediately whenever signups are switched off.

### Granting admin access to an account

After your account exists in `auth.users`/`public.profiles`, run the following SQL in the Supabase SQL editor to promote it:

```sql
update public.profiles
set is_admin = true
where email = 'josefsen.elvind@gmail.com';
```

This keeps the admin designation alongside other profile metadata so it can be referenced from the `member_directory` view or other dashboards.

This documentation should give you everything needed to wire the frontend forms to Supabase for user registration and login.

## Frontend integration in this repo

The legacy modal-based signup and login flow has been removed. All “Sign up / Log in” buttons now link directly to [`supabase-test.html`](supabase-test.html), which hosts the standalone Supabase authentication experience. Update that page if you need to adjust copy, styling, or add new flows such as password resets.

If you introduce additional requirements (for example hCaptcha or multi-factor flows), build them straight into `supabase-test.html`. The rest of the site simply routes visitors there and no longer manages authentication state client-side.

## Best practices for memberships and Stripe subscriptions

To prepare for paid memberships you’ll want to store a little more state than just the Supabase auth session. A few recommendations:

1. **Track member profile + billing status** – add columns such as `billing_status`, `plan_id`, and `trial_ends_at` to your `profiles` table. Keep them in sync with Stripe events so the UI knows whether to show upgrade or renewal messaging.
2. **Create a `subscriptions` table** – store the Stripe `subscription_id`, `customer_id`, price, and status keyed to the user’s UUID. Enable Row Level Security and ensure policies only allow each user to read their own rows.
3. **Use Stripe webhooks** – expose a Supabase Edge Function (or your own backend endpoint) that receives `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` events. Update the `subscriptions` table and profile billing status inside that handler.
4. **Protect premium data** – keep any member-only tables behind RLS policies that check for an active subscription. For example, require `auth.uid() = user_id` and `billing_status = 'active'` in `profiles` before returning protected rows.
5. **Audit email + password flows** – enforce email confirmation in Supabase Auth, require a minimum password length (already set to 8 characters in the modal), and enable password reset emails so support requests stay manageable.
6. **Store Stripe metadata** – include the Supabase user ID in Stripe Checkout Session metadata. That makes it trivial to link webhook payloads back to the right row in your database.

With those pieces in place the standalone login page in this repo can stay lightweight while the backend keeps an authoritative record of who should have access to paid features.

