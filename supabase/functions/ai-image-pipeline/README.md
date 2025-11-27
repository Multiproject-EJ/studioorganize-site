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

### Google Provider Model Gating

The AI Image Pipeline supports two types of Google image models with different requirements:

#### Gemini 3 Pro Image (Available)
- **Models**: `gemini-3-pro-image-preview`, `gemini-3-pro-image`
- **API**: Generative Language API
- **Auth**: `GOOGLE_API_KEY` environment variable
- **No special flags required** - works out of the box

#### Imagen 3 (Vertex AI - Gated)
- **Models**: `imagen-3.0`, `imagen-3.0-lite`, `imagen-3.0-highres`
- **API**: Vertex AI
- **Auth**: Service account with OAuth2 or workload identity
- **Requires**: `ENABLE_VERTEX_AI=true` flag

**Environment Flag:** `ENABLE_VERTEX_AI`
- Set to `"true"` to enable Imagen 3 models
- When not set, Imagen 3 requests return 501 error with descriptive message
- Gemini 3 Pro Image models work without this flag

**Behavior when Imagen 3 is gated:**
- Requests for Imagen 3 models return: `{ "error": "Google Imagen 3 (Vertex AI) is disabled. Enable ENABLE_VERTEX_AI and configure service account auth to use imagen-3.0. Alternatively, select a Gemini 3 Pro Image model." }`
- Status code: **501 Not Implemented**
- Frontend shows Imagen options as disabled with tooltip
- Gemini 3 Pro Image models work normally

### DEBUG Flag

Set `DEBUG=true` environment variable to enable structured logging:

```bash
supabase functions secrets set DEBUG=true
```

When enabled, the following is logged:
- `[PROVIDER]` - Provider selection and gating decisions
- `[GOOGLE]` - Google API request/response details
- `[PROMPT]` - Prompt construction details (archetype, tier, model, full prompt)

Example log output:
```
[PROVIDER] Imagen 3 (Vertex AI) is gated. ENABLE_VERTEX_AI is not set to 'true'.
[GOOGLE] Request endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=***
[GOOGLE] Request model: gemini-3-pro-image-preview
[PROMPT] generate-character-draft: { archetype: 'hero', tier: 'standard', provider: 'google', model: 'gemini-3-pro-image-preview', promptLength: 423 }
[PROMPT] Full prompt: A heroic character with a confident stance...
```

---

## Model Selection

The AI Image Pipeline supports explicit model selection for both character generation and refinement actions.

### Priority Order

Model resolution follows this priority:

1. **Request body `model`** - Explicit model specified in the request (provider is inferred from model name)
2. **Environment variable `AI_IMAGE_MODEL`** - Default model from environment
3. **Fallback mapping** - Provider + detail/tier based mapping (or available keys if `AI_IMAGE_PROVIDER=auto`)

### Provider Auto-Detection

When `AI_IMAGE_PROVIDER=auto`, the provider is automatically inferred from the model name:
- **Google models**: `gemini-*`, `imagen-*` → uses Google provider
- **OpenAI models**: `dall-e-*`, `gpt-image-*` → uses OpenAI provider
- **No model specified**: Picks provider based on available API keys (prefers OpenAI if both keys set, then Google)

This enables per-request model selection without requiring environment variable changes.

---

## Storage Bucket Management

The function uses two private storage buckets:
- `story-refs` - Character base images, poses, and drafts
- `story-renders` - Scene render outputs

### Auto-Creation

If a bucket doesn't exist, the function will automatically create it with `public=false` for secure access via signed URLs.

### Error Handling

If bucket creation fails (e.g., insufficient permissions), the function returns an actionable error:

```json
{
  "error": "storage bucket missing",
  "bucket": "story-refs",
  "action": "create in Supabase Storage"
}
```

Status code: **400 Bad Request**

---

## Google Models (Generative Language API)

Gemini 3 Pro Image models use the **Generative Language API** and are available with just a `GOOGLE_API_KEY`. No Vertex AI setup required.

### Supported Models

| Model ID | Description |
|----------|-------------|
| `gemini-3-pro-image-preview` | Preview version - faster, suitable for iteration |
| `gemini-3-pro-image` | Stable version - higher quality output |

### Features

- **Dynamic Endpoint**: The endpoint is built per-request using the resolved model: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Authentication**: Uses `GOOGLE_API_KEY` environment variable
- **Response Format**: Returns `inline_data` containing base64-encoded images
- **No Vertex AI Required**: Works without `ENABLE_VERTEX_AI` flag

### Example Request

```json
{
  "action": "generate-character-draft",
  "archetype": "hero",
  "tier": "standard",
  "model": "gemini-3-pro-image-preview"
}
```

### Response

```json
{
  "draft_id": "uuid",
  "image_url": "https://...",
  "provider": "google",
  "meta": {
    "provider": "google",
    "model": "gemini-3-pro-image-preview",
    "detail": "standard",
    "archetype": "hero",
    "action": "generate-character"
  }
}
```

---

## Imagen 3 (Vertex AI)

Imagen 3 models require Vertex AI integration and are gated behind the `ENABLE_VERTEX_AI` flag.

### Supported Models

| Model ID | Description |
|----------|-------------|
| `imagen-3.0` | Standard quality |
| `imagen-3.0-lite` | Fast/cheap generation |
| `imagen-3.0-highres` | High resolution output |

### Requirements

- **Flag**: `ENABLE_VERTEX_AI=true` environment variable
- **Authentication**: Service account with OAuth2 token or workload identity
- **Endpoint**: Vertex AI endpoint (implementation pending)

### Current Status

Imagen 3 models are **disabled by default**. Selecting them returns:

```json
{
  "error": "Google Imagen 3 (Vertex AI) is disabled. Enable ENABLE_VERTEX_AI and configure service account auth to use imagen-3.0. Alternatively, select a Gemini 3 Pro Image model."
}
```

Status code: **501 Not Implemented**

### Future Integration

When Vertex AI integration is complete:
- Set `ENABLE_VERTEX_AI=true`
- Configure service account credentials
- Endpoint format: `https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/{model}:predict`

---

## OpenAI Models

**OpenAI:**
- `dall-e-3` - DALL-E 3 standard
- `gpt-image-1024` - GPT Image 1024x1024
- `gpt-image-512` - GPT Image (maps to 1024x1024 minimum)

---

## Fallback Mapping

When no explicit model is provided:

| Provider | Detail | Resolved Model |
|----------|--------|----------------|
| Google | `pro` | `gemini-3-pro-image` |
| Google | `standard` | `gemini-3-pro-image` |
| Google | `cheap` | `gemini-3-pro-image-preview` |
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
# - google: Always use Google provider
# - openai: Always use OpenAI provider
# - auto: Infer provider from model name, fallback to available API keys
AI_IMAGE_PROVIDER=auto  # google | openai | auto (default: auto)

# Default Model Selection (optional - overrides fallback mapping)
AI_IMAGE_MODEL=gemini-3-pro-image  # See Model Selection section for supported models

# Google API Key (required for Google models)
GOOGLE_API_KEY=your-google-api-key

# OpenAI API Key (required for OpenAI models)
OPENAI_API_KEY=your-openai-api-key

# Enable Imagen 3 models (Vertex AI - optional)
ENABLE_VERTEX_AI=true  # Set to "true" to enable Imagen 3 models

# Debug logging (optional)
DEBUG=true  # Set to "true" to enable structured debug logging

# Supabase (automatically provided)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Configure via Supabase CLI:

```bash
supabase functions secrets set \
  AI_IMAGE_PROVIDER=auto \
  GOOGLE_API_KEY=your-key \
  OPENAI_API_KEY=your-key \
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

**Note**: Buckets are automatically created with `public=false` if they don't exist. If automatic creation fails, you'll receive an actionable error message indicating which bucket needs to be created manually.

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

## Authentication

The function accepts user JWT tokens via multiple headers (in priority order):

1. **`X-Client-Auth`** - Preferred. Pass raw JWT without Bearer prefix.
2. **`X-Supabase-Authorization`** - Used by supabase-js library. May include `Bearer ` prefix (will be stripped).
3. **`Authorization`** - Standard bearer token. Only used if it contains a user JWT (starts with `ey`).

**Example request:**

```bash
curl -X POST https://your-project.supabase.co/functions/v1/ai-image-pipeline \
  -H "apikey: YOUR_ANON_KEY" \
  -H "X-Client-Auth: YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action": "generate-character-draft", "archetype": "hero"}'
```

**401 Error Responses:**

The function returns detailed diagnostics for authentication failures:

```json
{
  "error": "Unauthorized",
  "reason": "missing access token - provide X-Client-Auth, X-Supabase-Authorization, or Authorization: Bearer <jwt>"
}
```

```json
{
  "error": "Unauthorized",
  "reason": "token expired",
  "details": { "exp": 1699000000, "now": 1699000100, "expiredSecondsAgo": 100 }
}
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
