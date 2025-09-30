# Supabase Integration Guide

This document explains how StudioOrganize uses Supabase for authentication and member data. The Supabase project for this site lives at `https://ycgqgkwwitqunabowswi.supabase.co`.

## Overview

The site relies on Supabase Auth to allow members to create accounts and sign in. The Supabase JavaScript client is loaded in the browser to perform the following actions:

- `signUp({ email, password, options })` – create a new account and optional profile information.
- `signInWithPassword({ email, password })` – allow returning members to log in.
- `getSession()` / `onAuthStateChange()` – persist login state between page visits and show/hide member-only UI.
- `from('profiles')` queries – fetch and update member profile data stored in the `profiles` table.

Profiles are stored in the public schema and reference Supabase's `auth.users` table. Row Level Security (RLS) ensures that each signed-in member can only view and modify their own profile data.

Supabase SQL schema files live in [`supabase/schema.sql`](supabase/schema.sql). Run the SQL file inside the Supabase SQL editor (or the CLI) to set up the necessary tables, triggers, and policies.

## Environment variables

Expose the following values to the frontend (e.g., via a `.env` file if you are using a local dev server or bundler):

```
SUPABASE_URL=https://ycgqgkwwitqunabowswi.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Fna3d3aXRxdW5hYm93c3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTg2NTAsImV4cCI6MjA3NDczNDY1MH0.W0mKqZlHVn6tRYSyZ4VRK4zCpCPC1ICwqtqoWrQMBuU
```

When deploying, configure these values in your hosting platform's environment variable settings.

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

## Testing the workflow

1. Open the Supabase Dashboard and run the SQL in [`supabase/schema.sql`](supabase/schema.sql) using the SQL editor.
2. In the Authentication settings, enable email/password sign-ups and configure any required email templates (e.g., confirmation emails).
3. Load the site locally, open the browser console, and instantiate the Supabase client as shown above.
4. Call `supabase.auth.signUp({ email, password })` to create a new account. Confirm the email if required by your project settings.
5. Use `supabase.auth.signInWithPassword` to verify that login works and that you can fetch/update your profile using `supabase.from('profiles')` queries.

This documentation should give you everything needed to wire the frontend forms to Supabase for user registration and login.

