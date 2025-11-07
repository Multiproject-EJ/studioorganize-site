# Common Errors & Fixes

## Supabase saves fail with `invalid input syntax for type uuid`

**Context:** Saving screenplay data to Supabase worked on most browsers but failed on privacy-restricted environments (e.g., older iOS/Safari) that block access to `crypto.randomUUID` and `crypto.getRandomValues`. Scene and project identifiers would fall back to strings like `id-xyz`, which Postgres rejects when writing to UUID columns.

**What we tried:**
1. Confirmed Supabase reads still succeeded to rule out authentication issues.
2. Reproduced the failure path by reviewing the fallback branch of the in-browser ID generator.
3. Updated the fallback generator to always emit RFC 4122–compatible UUIDs even when secure randomness APIs are unavailable. ✅

**Fix:** The screenplay workspace now synthesizes UUID-shaped identifiers with `Math.random` when cryptographic helpers are not exposed, ensuring Supabase accepts new rows. See `use-cases/screenplay-writing.html` for the updated `randomId` helper.

## Workspace save button not responding

**Context:** The workspace launcher menu includes a save button in the bottom-right corner. When clicked, it dispatches a `studioorganize:save-requested` custom event that workspace pages should handle.

**What we tried:**
1. Confirmed the save button exists in the workspace launcher and triggers `requestWorkspaceSave()`.
2. Added event listeners to all workspace pages (CharacterStudio, StoryboardPro, VideoEditing, screenplay-writing).
3. Implemented proper event handling with `detail.markHandled()` and `detail.waitUntil()` pattern. ✅

**Fix:** Each workspace page now listens for the `studioorganize:save-requested` event and either:
- Saves data to Supabase (CharacterStudio, screenplay-writing)
- Provides user feedback for localStorage-based workspaces (StoryboardPro, VideoEditing)
- Shows a fallback message if no workspace is active (global handler in `assets/main.js`)

**Files changed:**
- `CharacterStudio.html` - Wired to existing Supabase save logic for character catalog
- `StoryboardPro.html` - Added save event acknowledgment
- `VideoEditing.html` - Added save event acknowledgment
- `use-cases/screenplay-writing.html` - Already had save handler
- `assets/main.js` - Added global fallback handler for pages without workspaces
