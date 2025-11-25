# AI Image Pipeline - Supabase Edge Function

This Edge Function provides AI-powered image generation for character creation and scene rendering in StudioOrganize.

## Actions

### 1. `generate-character-draft`

Generates a character image from a text description based on archetype and quality tier.

**Request:**
```json
{
  "action": "generate-character-draft",
  "archetype": "hero",  // hero | villain | sci-fi | fantasy | child | robot
  "tier": "standard"    // standard | premium
}
```

**Response:**
```json
{
  "draft_id": "uuid-string",
  "image_url": "https://...",  // Signed URL (1 hour expiry)
  "storage_path": "story-refs/character-drafts/user-id/draft-id.png",
  "provider": "google",  // google | openai | placeholder
  "archetype": "hero",
  "tier": "standard",
  "metadata": {}
}
```

**Usage in Frontend:**

```javascript
const { data, error } = await supabase.functions.invoke('ai-image-pipeline', {
  body: {
    action: 'generate-character-draft',
    archetype: 'hero',
    tier: 'standard'
  },
  headers: { 
    Authorization: `Bearer ${session.access_token}` 
  },
});

if (!error) {
  const imageUrl = data.image_url;  // Display this URL in your UI
  const storagePath = data.storage_path;  // Store for later reference
}
```

### 2. `refine-character`

Refines an existing character image based on UI slider values. Generates a new variant with modified age, mood, hair, eyebrows, style, and detail level.

**Request:**
```json
{
  "action": "refine-character",
  "archetype": "hero",                              // Required: hero | villain | sci-fi | fantasy | child | robot
  "tier": "standard",                               // Optional: standard | premium
  "character_id": "uuid-or-null",                   // Optional: existing character ID
  "base_image_url": "https://...",                  // Optional: URL of the original image
  "base_storage_path": "story-refs/character-drafts/...", // Optional: storage path of original
  "refine": {
    "age": "younger",           // younger | adult | older
    "mood": "happy",            // neutral | happy | angry | sad
    "hairLength": "long",       // short | medium | long
    "eyebrowShape": "sharp",    // soft | sharp | thick | thin
    "style": "anime",           // anime | realistic | painterly
    "detail": "pro"             // cheap | standard | pro
  }
}
```

**Response:**
```json
{
  "draft_id": "uuid-string",
  "variant_id": "uuid-refine-timestamp",
  "image_url": "https://...",
  "storage_path": "story-refs/character-drafts/user-id/draft-id-refine-timestamp.png",
  "provider": "openai",
  "archetype": "hero",
  "tier": "standard",
  "refine": { ... },
  "character_id": "uuid-or-null",
  "base_image_url": "https://...",
  "base_storage_path": "story-refs/...",
  "prompt_used": "A heroic character...",
  "metadata": {}
}
```

**Slider Value Mappings:**

| Slider | Value | Prompt Modifier |
|--------|-------|-----------------|
| Age | `younger` | "younger-looking, youthful features" |
| Age | `adult` | "adult, mature features" |
| Age | `older` | "older-looking, experienced appearance" |
| Mood | `neutral` | "with a neutral expression" |
| Mood | `happy` | "with a happy, joyful expression" |
| Mood | `angry` | "with an angry, fierce expression" |
| Mood | `sad` | "with a sad, melancholic expression" |
| Hair Length | `short` | "short hair" |
| Hair Length | `medium` | "shoulder-length hair" |
| Hair Length | `long` | "long flowing hair" |
| Eyebrow Shape | `soft` | "soft, gentle eyebrows" |
| Eyebrow Shape | `sharp` | "sharply angled eyebrows" |
| Eyebrow Shape | `thick` | "thick, prominent eyebrows" |
| Eyebrow Shape | `thin` | "thin, delicate eyebrows" |
| Style | `anime` | "in an anime style" |
| Style | `realistic` | "in a cinematic realistic style" |
| Style | `painterly` | "in a painterly illustration style" |

**Detail Level Quality Settings:**

| Detail | Resolution | Quality |
|--------|------------|---------|
| `cheap` | 512x512* | standard |
| `standard` | 1024x1024 | standard |
| `pro` | 1792x1024 | hd |

*Note: DALL-E 3 minimum is 1024x1024, so `cheap` uses standard resolution with standard quality.

**Usage in Frontend (CharacterStudio.html):**

```javascript
const { data, error } = await supabase.functions.invoke('ai-image-pipeline', {
  body: {
    action: 'refine-character',
    archetype: currentCharacterDraft.archetype,
    tier: 'standard',
    character_id: activeCharacterId,
    base_image_url: currentCharacterDraft.image_url,
    base_storage_path: currentCharacterDraft.storage_path,
    refine: {
      age: ageSliderValue,
      mood: moodPillValue,
      hairLength: hairLengthPillValue,
      eyebrowShape: eyebrowPillValue,
      style: stylePillValue,
      detail: detailPillValue
    }
  },
  headers: { 
    Authorization: `Bearer ${session.access_token}` 
  },
});

if (!error) {
  // Update the "after" preview with the refined image
  refinedPreviewEl.src = data.image_url;
  currentCharacterDraft.refined_storage_path = data.storage_path;
  currentCharacterDraft.variant_id = data.variant_id;
}
```

**Provider Limitations:**

- **Image-to-Image Refinement**: Currently, both Google Imagen and OpenAI DALL-E are used for text-to-image generation. The `base_image_url` and `base_storage_path` are stored in the response for reference, but true image-to-image conditioning (using the original image as a reference) is not yet implemented.
- **Identity Locking**: Maintaining consistent character identity across refinements requires additional provider features (e.g., ControlNet, IP-Adapter, or provider-specific identity preservation). This is marked as a TODO in the codebase.
- **Future Enhancement**: When img2img or identity-locking features become available, the refinement will download the base image and pass it to the provider for more consistent results.

### 3. `upload-base`

Uploads a base character PNG for pose generation.

**Request:**
```json
{
  "action": "upload-base",
  "character_id": "uuid",
  "image": "data:image/png;base64,..."
}
```

### 4. `generate-poses`

Generates character poses from a base image.

**Request:**
```json
{
  "action": "generate-poses",
  "character_id": "uuid",
  "poses": [
    {
      "label": "Standing",
      "description": "Character standing upright"
    }
  ]
}
```

### 5. `generate-scene`

Generates a scene frame with a character.

**Request:**
```json
{
  "action": "generate-scene",
  "scene_id": "uuid",
  "character_id": "uuid",
  "pose_id": "uuid",  // Optional
  "prompt": "Character in a forest clearing"
}
```

### 6. `continue-scene`

Generates continuation frames for a scene with variants.

**Request:**
```json
{
  "action": "continue-scene",
  "scene_id": "uuid",
  "character_id": "uuid",
  "prompt": "Character walks forward"
}
```

## Configuration

Set these environment variables in Supabase Edge Functions:

```bash
# AI Provider Selection
AI_IMAGE_PROVIDER=google  # google | openai | auto

# Google Imagen API
GOOGLE_API_KEY=your-google-api-key
GOOGLE_IMAGE_MODEL=google-nano-banan  # Optional
GOOGLE_IMAGE_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent

# OpenAI DALL-E API
OPENAI_API_KEY=your-openai-api-key

# Supabase (automatically provided)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Configure via Supabase CLI:

```bash
supabase functions secrets set \
  AI_IMAGE_PROVIDER=google \
  GOOGLE_API_KEY=your-key \
  --project-ref your-project-ref

# Redeploy after setting secrets
supabase functions deploy ai-image-pipeline
```

## Storage Buckets

The function uses two Supabase storage buckets:

- **`story-refs`**: Reference images (character bases, poses, drafts)
  - `characters/{owner_id}/{character_id}/character-{id}-base.png`
  - `character-poses/{owner_id}/{character_id}/{pose_id}.png`
  - `character-drafts/{owner_id}/{draft_id}.png`
  - `character-drafts/{owner_id}/{draft_id}-refine-{timestamp}.png` (refinement variants)

- **`story-renders`**: Scene renders and frames
  - `scene-frames/{owner_id}/{scene_id}/{frame_id}.png`

## Architecture Notes

### Character Draft Flow

1. **User selects archetype** in CharacterStudio.html wizard
2. **Frontend calls** `generate-character-draft` action
3. **Backend builds prompt** based on archetype + tier
4. **AI provider generates** image (Google Imagen or OpenAI DALL-E)
5. **Image saved** to `story-refs/character-drafts/`
6. **Signed URL returned** to frontend (expires in 1 hour)
7. **Frontend displays** image in wizard preview

### Character Refinement Flow

1. **User adjusts sliders** in CharacterStudio.html refinement panel
2. **Frontend calls** `refine-character` action with slider values
3. **Backend builds refined prompt** by combining archetype prompt with modifier phrases
4. **AI provider generates** new image based on refined prompt
5. **Image saved** to `story-refs/character-drafts/{userId}/{draftId}-refine-{timestamp}.png`
6. **Signed URL returned** with variant_id for tracking
7. **Frontend displays** side-by-side comparison (before/after)

### AI Provider Fallback

If no AI provider is configured (missing API keys), the function returns a 1x1 transparent placeholder PNG. This allows the UI to function in demo mode without requiring API credentials.

### Prompt Construction

Prompts are built dynamically based on the action:

- **Character drafts**: `archetype → base prompt + tier-specific details`
- **Character refinements**: `archetype → base prompt + age/mood/hair/eyebrow/style modifiers + tier`
- **Poses**: `character name + pose label + description + use case`
- **Scenes**: `character + pose + scene description + lighting/framing instructions`

See `buildPosePrompt()`, `buildScenePrompt()`, and `buildRefinePrompt()` functions for details.

## Development

To test locally with Supabase CLI:

```bash
# Start local Supabase
supabase start

# Serve function locally
supabase functions serve ai-image-pipeline --env-file .env.local

# Test with curl
curl -X POST http://localhost:54321/functions/v1/ai-image-pipeline \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate-character-draft",
    "archetype": "hero",
    "tier": "standard"
  }'
```

## Error Handling

All errors are returned as JSON:

```json
{
  "error": "Error message here"
}
```

Common error codes:
- **400**: Invalid request (missing required fields)
- **401**: Unauthorized (invalid or missing token)
- **404**: Resource not found (character/scene)
- **405**: Method not allowed (must be POST)
- **500**: Internal server error (API failure, storage error)
