# Common Error Solutions

This document tracks common issues encountered in the StudioOrganize site and their solutions.

## Script Dialog Not Showing Content (Blank Dialog)

**Symptoms:**
- The "+story" script dialog opens successfully
- A white/blank rectangle appears where content should be
- Content appears for a millisecond then disappears
- Browser console shows errors like "ReferenceError: Cannot access 'supabaseClient' before initialization"

**Root Causes:**

### 1. Supabase Module Import Failure
The main.js file had a hard dependency on the Supabase module imported from a CDN:
```javascript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

If this import fails (e.g., due to ad blockers, network issues, or domain blocking), the entire module fails to load, preventing the script dialog and other features from working.

**Solution:** Make the Supabase import optional using dynamic import with error handling:
```javascript
let createClient = null;
try {
  const module = await import('https://esm.sh/@supabase/supabase-js@2');
  createClient = module.createClient;
} catch (error) {
  console.warn('Failed to load Supabase client:', error);
}
```

### 2. Temporal Dead Zone (TDZ) Error
The `supabaseClient` variable was declared after the `workspaceThemes.loadRemote()` function tried to access it, causing a TDZ error.

The original code structure was:
```javascript
// Line 956
workspaceThemes.loadRemote();  // Tries to access supabaseClient

// Line 980  
let supabaseClient = null;  // Declared later
```

**Solution:** Move the `supabaseClient` declaration and initialization before the workspace themes code that uses it.

### 3. Document Body Not Ready
The `setupScriptDialogFallback()` function tried to create DOM elements before `document.body` was ready.

**Solution:** Add a check and retry mechanism:
```javascript
function setupScriptDialogFallback(){
  if (typeof window.openScriptDialog === 'function') return;
  if (document.getElementById('scriptDialog')) return;
  // Ensure document.body is ready before creating the overlay
  if (!document.body) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupScriptDialogFallback, { once: true });
    } else {
      // Body should exist but doesn't - wait a bit and retry
      setTimeout(setupScriptDialogFallback, 0);
    }
    return;
  }
  // ... rest of the function
}
```

### 4. Supabase Client Type Check
The code tried to call `createClient()` without checking if it's a function first.

**Solution:** Add type checking before calling:
```javascript
let supabaseClient = null;
try {
  if (typeof createClient === 'function') {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;
  } else {
    console.warn('Supabase createClient not available - running without database features');
  }
} catch (error) {
  console.error('Failed to initialize Supabase client', error);
}
```

## Prevention

To prevent similar issues in the future:

1. **Optional External Dependencies**: Always make external CDN imports optional with proper error handling
2. **Variable Declaration Order**: Declare variables before they are referenced by module-level code
3. **DOM Readiness**: Check for `document.body` existence before manipulating the DOM
4. **Type Checking**: Verify function existence with `typeof func === 'function'` before calling
5. **Error Handling**: Wrap all initialization code in try-catch blocks with informative logging

## Testing

To test that these issues are resolved:

1. Open the browser with ad blocker enabled (to block Supabase CDN)
2. Navigate to any page that uses the script dialog
3. Click the "Script..." button or call `window.openScriptDialog()`
4. Verify the dialog opens and displays content
5. Check browser console for errors

## Related Files

- `/assets/main.js` - Main application JavaScript (Supabase init, script dialog setup)
- `/use-cases/screenplay-writing.html` - Contains the script dialog HTML and logic

## Last Updated

2025-11-08 - Initial documentation of script dialog blank content issue
