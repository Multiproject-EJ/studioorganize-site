# Common Errors & Fixes

## Supabase saves fail with `invalid input syntax for type uuid`

**Context:** Saving screenplay data to Supabase worked on most browsers but failed on privacy-restricted environments (e.g., older iOS/Safari) that block access to `crypto.randomUUID` and `crypto.getRandomValues`. Scene and project identifiers would fall back to strings like `id-xyz`, which Postgres rejects when writing to UUID columns.

**What we tried:**
1. Confirmed Supabase reads still succeeded to rule out authentication issues.
2. Reproduced the failure path by reviewing the fallback branch of the in-browser ID generator.
3. Updated the fallback generator to always emit RFC 4122–compatible UUIDs even when secure randomness APIs are unavailable. ✅

**Fix:** The screenplay workspace now synthesizes UUID-shaped identifiers with `Math.random` when cryptographic helpers are not exposed, ensuring Supabase accepts new rows. See `use-cases/screenplay-writing.html` for the updated `randomId` helper.
