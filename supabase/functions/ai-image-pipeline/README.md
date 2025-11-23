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

### 2. `upload-base`

Uploads a base character PNG for pose generation.

**Request:**
```json
{
  "action": "upload-base",
  "character_id": "uuid",
  "image": "data:image/png;base64,..."
}
```

### 3. `generate-poses`

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

### 4. `generate-scene`

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

### 5. `continue-scene`

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

### AI Provider Fallback

If no AI provider is configured (missing API keys), the function returns a 1x1 transparent placeholder PNG. This allows the UI to function in demo mode without requiring API credentials.

### Prompt Construction

Prompts are built dynamically based on the action:

- **Character drafts**: `archetype → base prompt + tier-specific details`
- **Poses**: `character name + pose label + description + use case`
- **Scenes**: `character + pose + scene description + lighting/framing instructions`

See `buildPosePrompt()` and `buildScenePrompt()` functions for details.

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
