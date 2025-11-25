# AI Image Pipeline - Supabase Edge Function

This Edge Function provides AI-powered image generation for character creation and scene rendering in StudioOrganize.

## Prompt Enrichment & Provider Gating

### Prompt Enrichment System

The AI Image Pipeline uses an enriched prompt system to produce higher-quality, more consistent character images. Prompts are automatically enhanced with:

**1. Archetype Base Prompts**
Each archetype has a rich, detailed base prompt:
- `hero`: Confident stance, noble appearance, dynamic pose, well-defined silhouette
- `villain`: Dramatic features, imposing presence, sharp angular features, dark palette
- `sci-fi`: Sleek technological elements, clean lines, cybernetic enhancements
- `fantasy`: Mystical elements, ornate costume details, ethereal glow
- `child`: Innocent features, soft rounded face, playful energy
- `robot`: Precise geometric shapes, articulated joints, glowing elements

**2. Global Quality Additions**
- Full body character design
- Clean edges suitable for compositing
- Professional character art
- Balanced lighting with subtle shadows
- Clear silhouette
- (Premium tier adds: Highly detailed, Cinematic quality, Studio lighting, 4K resolution)

**3. Negative Artifact Suppression**
The following phrases are automatically appended to prevent common AI artifacts:
- No text
- No watermark
- Avoid distorted hands
- Avoid extra limbs
- Avoid blurry faces
- No cropped body parts
- Anatomically correct proportions

**4. Refinement Modifiers**
For `refine-character` action, additional modifiers are added based on UI sliders:
- Age: younger/adult/older
- Mood: neutral/happy/angry/sad expressions
- Hair length: short/medium/long
- Eyebrow shape: soft/sharp/thick/thin
- Style: anime/realistic/painterly

### Temporary Google Provider Gating

**Important:** Google Imagen and Gemini Image models are temporarily disabled until Vertex AI / Gemini Image integration is complete.

**Environment Flags:**
- `ENABLE_VERTEX_AI` - Set to `"true"` to enable Google Imagen provider
- `ENABLE_GEMINI_IMAGE` - Set to `"true"` to enable experimental Gemini 3 Pro Image models

**Client-side Flag:**
- `ALLOW_EXPERIMENTAL_GEMINI_IMAGE_UI` - Set to `"true"` (via data attribute) to expose Gemini 3 Pro Image options in the frontend model dropdowns

**Behavior when gated:**
- Requests for Google/Gemini models return: `{ "error": "Google image generation not enabled (Gemini/Vertex integration pending). Please use OpenAI models or leave model selection on Auto." }`
- Status code: **501 Not Implemented**
- Auto provider selection prefers OpenAI
- Frontend model dropdowns hide Google/Gemini options by default

**To enable experimental Gemini Image UI:**
Add a data attribute to the `<body>` or `<html>` tag:
```html
<body data-allow-experimental-gemini-image-ui="true">
```

**Future:** Once Vertex AI / Gemini Image integration is implemented:
1. Set `ENABLE_GEMINI_IMAGE=true` to enable Gemini 3 Pro Image models on the backend
2. Set `ALLOW_EXPERIMENTAL_GEMINI_IMAGE_UI=true` on the frontend to expose options
3. Configure the correct Gemini Image endpoint and authentication

### DEBUG Flag

Set `DEBUG=true` environment variable to enable structured logging:

```bash
supabase functions secrets set DEBUG=true
```

When enabled, the following is logged:
- `[PROVIDER]` - Provider selection and gating decisions
- `[PROMPT]` - Prompt construction details (archetype, tier, model, full prompt)

Example log output:
```
[PROVIDER] Google provider is gated. ENABLE_VERTEX_AI is not set to 'true'.
[PROMPT] generate-character-draft: { archetype: 'hero', tier: 'standard', provider: 'openai', model: 'dall-e-3', promptLength: 423 }
[PROMPT] Full prompt: A heroic character with a confident stance...
```

---

## Model Selection

The AI Image Pipeline supports explicit model selection for both character generation and refinement actions.

**Note:** Google models are temporarily disabled (see Provider Gating above).

### Priority Order

Model resolution follows this priority:

1. **Request body `model`** - Explicit model specified in the request
2. **Environment variable `AI_IMAGE_MODEL`** - Default model from environment
3. **Fallback mapping** - Provider + detail/tier based mapping

### Supported Models

**Google (Imagen):**
- `imagen-3.0` - Standard quality
- `imagen-3.0-lite` - Fast/cheap generation
- `imagen-3.0-highres` - High resolution output

**Google (Experimental Gemini Image):**
- `gemini-3-pro-image` - Gemini 3 Pro Image (requires `ENABLE_GEMINI_IMAGE=true`)
- `gemini-3-pro-image-preview` - Gemini 3 Pro Image Preview (requires `ENABLE_GEMINI_IMAGE=true`)

**OpenAI:**
- `dall-e-3` - DALL-E 3 standard
- `gpt-image-1024` - GPT Image 1024x1024
- `gpt-image-512` - GPT Image (maps to 1024x1024 minimum)

### Fallback Mapping

When no explicit model is provided:

| Provider | Detail | Resolved Model |
|----------|--------|----------------|
| Google | `pro` | `imagen-3.0-highres` |
| Google | `standard` | `imagen-3.0` |
| Google | `cheap` | `imagen-3.0-lite` |
| OpenAI | `pro` | `dall-e-3` |
| OpenAI | `standard` | `gpt-image-1024` |
| OpenAI | `cheap` | `gpt-image-512` |

### Example Requests

**Generate with explicit model:**
```json
{
  "action": "generate-character-draft",
  "archetype": "hero",
  "tier": "standard",
  "model": "imagen-3.0-highres"
}
```

**Refine with explicit model:**
```json
{
  "action": "refine-character",
  "archetype": "hero",
  "model": "dall-e-3",
  "detail": "pro",
  "refine": { "age": "young-adult", "style": "painterly" }
}
```

### Response Meta Block

Both `generate-character-draft` and `refine-character` responses include a `meta` block:

```json
{
  "draft_id": "uuid",
  "image_url": "https://...",
  "meta": {
    "provider": "google",
    "model": "imagen-3.0-highres",
    "detail": "pro",
    "archetype": "hero",
    "action": "generate-character"
  }
}
```

### Error Handling

If an unsupported model is requested for the configured provider:

```json
{
  "error": "Unsupported model 'invalid-model' for Google provider. Supported: imagen-3.0, imagen-3.0-lite, imagen-3.0-highres, nano-banana-pro"
}
```

Status code: **400 Bad Request**

---

## Actions

### 1. `generate-character-draft`

Generates a character image from a text description based on archetype and quality tier.

**Request:**
```json
{
  "action": "generate-character-draft",
  "archetype": "hero",  // hero | villain | sci-fi | fantasy | child | robot
  "tier": "standard",   // standard | premium
  "model": "imagen-3.0" // Optional: explicit model override
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
  "metadata": {},
  "meta": {
    "provider": "google",
    "model": "imagen-3.0",
    "detail": "standard",
    "archetype": "hero",
    "action": "generate-character"
  }
}
```

**Usage in Frontend:**

```javascript
const { data, error } = await supabase.functions.invoke('ai-image-pipeline', {
  body: {
    action: 'generate-character-draft',
    archetype: 'hero',
    tier: 'standard',
    model: 'imagen-3.0-highres'  // Optional
  },
  headers: { 
    Authorization: `Bearer ${session.access_token}` 
  },
});

if (!error) {
  const imageUrl = data.image_url;  // Display this URL in your UI
  const storagePath = data.storage_path;  // Store for later reference
  console.log('Used model:', data.meta.model);
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
  "model": "dall-e-3",                              // Optional: explicit model override
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
  "metadata": {},
  "meta": {
    "provider": "openai",
    "model": "dall-e-3",
    "detail": "pro",
    "archetype": "hero",
    "action": "refine-character"
  }
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

# Default Model Selection (optional - overrides fallback mapping)
AI_IMAGE_MODEL=imagen-3.0  # See Model Selection section for supported models

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
  AI_IMAGE_MODEL=imagen-3.0-highres \
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
- **501**: Feature not implemented (experimental models not enabled)

### Troubleshooting 501 Errors (Experimental Models)

If you receive a 501 error when selecting a Gemini 3 Pro Image model:

```json
{
  "error": "Google image generation not enabled (Gemini/Vertex integration pending). Please use OpenAI models or leave model selection on Auto."
}
```

**Cause:** Gemini 3 Pro Image models are experimental and gated behind environment flags.

**Solutions:**
1. **Use OpenAI models instead** - Select DALL-E 3 or GPT Image models (fully functional)
2. **Use Auto selection** - Let the system choose the best available provider
3. **Enable experimental flag (for testing only):**
   ```bash
   supabase functions secrets set ENABLE_GEMINI_IMAGE=true --project-ref your-project-ref
   supabase functions deploy ai-image-pipeline
   ```
   Note: Actual image generation via Gemini requires proper Vertex AI / Gemini Image endpoint configuration (follow-up PR).
