// Supabase Edge Function: AI Image Pipeline for character-consistent generation
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const REF_BUCKET = "story-refs";
const RENDER_BUCKET = "story-renders";
const CHARACTER_BASE_PREFIX = "characters";
const CHARACTER_POSE_PREFIX = "character-poses";
const SCENE_RENDER_PREFIX = "scene-frames";
const SIGNED_URL_EXPIRY = 60 * 60; // 1 hour
const DEFAULT_TOP_POSES = 3;
const CONTINUATION_VARIANTS = 5;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
// Google Generative Language API base URL - endpoint is built per-request with the resolved model
const GOOGLE_GENERATIVE_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const AI_IMAGE_PROVIDER = (Deno.env.get("AI_IMAGE_PROVIDER") ?? "openai").toLowerCase();
const AI_IMAGE_MODEL = Deno.env.get("AI_IMAGE_MODEL") ?? "";
// Flag to enable Google/Vertex AI integration (set to "true" to enable)
const ENABLE_VERTEX_AI = Deno.env.get("ENABLE_VERTEX_AI") === "true";
// Debug mode for structured logging
const DEBUG = Deno.env.get("DEBUG") === "true";

// ============================================================================
// CORS Configuration
// ============================================================================

/**
 * Allowed origin for CORS requests.
 * Requests from this origin will receive CORS headers.
 */
const ALLOWED_ORIGIN = "https://studioorganize.com";

/**
 * Build CORS headers for a given request origin.
 * Returns headers that allow the site origin to make cross-origin requests.
 *
 * @param requestOrigin - The Origin header from the incoming request
 * @returns Headers object with CORS headers
 */
function corsHeaders(_requestOrigin: string | null): Record<string, string> {
  // Always return CORS headers with the allowed origin
  // The requestOrigin parameter is kept for future extensibility if multiple origins need support
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-client-auth",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

// ============================================================================
// Authentication Diagnostics Helpers
// ============================================================================

/**
 * Extract bearer token from Authorization header.
 * Supports various formats:
 * - "Bearer <token>"
 * - "bearer <token>" (case-insensitive)
 * - Raw token starting with "ey..." (JWT fallback)
 * 
 * @param headerValue - The Authorization header value
 * @returns The extracted token or null if not found
 */
function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  
  const trimmed = headerValue.trim();
  if (!trimmed) return null;
  
  // Check for Bearer prefix (case-insensitive)
  const bearerMatch = trimmed.match(/^bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]) {
    return bearerMatch[1].trim();
  }
  
  // Fallback: If header looks like a raw JWT (starts with ey), accept it directly
  if (trimmed.startsWith("ey")) {
    return trimmed;
  }
  
  return null;
}

/**
 * Safely decode a JWT payload without signature validation.
 * Returns selected non-sensitive claims for diagnostic logging.
 * 
 * @param token - The JWT token string
 * @returns Object with decoded claims or null if decode fails
 */
function safeDecodeJwt(token: string): {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
  role?: string;
} | null {
  try {
    // JWT structure: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    // Decode the payload (second part)
    const payloadB64 = parts[1];
    // Handle URL-safe base64 and add padding if needed
    let padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding to make length a multiple of 4
    while (padded.length % 4 !== 0) {
      padded += "=";
    }
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    
    // Extract only non-sensitive claims for logging
    return {
      iss: typeof parsed.iss === "string" ? parsed.iss : undefined,
      aud: parsed.aud,
      sub: typeof parsed.sub === "string" ? parsed.sub : undefined,
      exp: typeof parsed.exp === "number" ? parsed.exp : undefined,
      iat: typeof parsed.iat === "number" ? parsed.iat : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      role: typeof parsed.role === "string" ? parsed.role : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Safely mask a string identifier for logging.
 * Shows the first few characters followed by "...".
 * 
 * @param value - The string to mask
 * @param showChars - Number of characters to show (default: 8)
 * @returns Masked string or undefined if value is falsy
 */
function maskIdentifier(value: string | undefined, showChars = 8): string | undefined {
  if (!value) return undefined;
  if (value.length <= showChars) {
    // For short strings, show at most 2 characters for privacy
    const safeLen = Math.min(2, value.length);
    return `${value.substring(0, safeLen)}...`;
  }
  return `${value.substring(0, showChars)}...`;
}

/**
 * Safely mask an email address for logging.
 * Shows the first few characters of the local part followed by "...@***".
 * 
 * @param email - The email address to mask
 * @returns Masked email or undefined if email is falsy
 */
function maskEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const atIndex = email.indexOf("@");
  if (atIndex > 0) {
    const localPart = email.substring(0, atIndex);
    const maskLen = Math.min(3, localPart.length);
    return `${localPart.substring(0, maskLen)}...@***`;
  }
  return "***@***";
}

/**
 * Check if a JWT appears to be an anon/public key (service key) rather than a user JWT.
 * Anon keys typically lack a 'sub' claim or have role='anon' or 'service_role'.
 * 
 * @param claims - Decoded JWT claims
 * @returns Object with isAnon flag and reason string
 */
function detectAnonOrPublicKey(claims: ReturnType<typeof safeDecodeJwt>): {
  isAnon: boolean;
  reason: string | null;
} {
  if (!claims) {
    return { isAnon: false, reason: null };
  }
  
  // Check for missing sub claim (typical of anon keys)
  if (!claims.sub) {
    return { isAnon: true, reason: "missing sub claim (anon/public key detected)" };
  }
  
  // Check for anon or service_role roles
  if (claims.role === "anon") {
    return { isAnon: true, reason: "token has role=anon (anon key detected)" };
  }
  if (claims.role === "service_role") {
    return { isAnon: true, reason: "token has role=service_role (service key detected)" };
  }
  
  return { isAnon: false, reason: null };
}

/**
 * Build a compact claimsInfo object for diagnostic logging.
 * 
 * @param claims - Decoded JWT claims
 * @returns Compact object with hasSub, iss, aud, exp, role
 */
function buildClaimsInfo(claims: ReturnType<typeof safeDecodeJwt>): Record<string, unknown> {
  if (!claims) {
    return { decoded: false };
  }
  return {
    hasSub: !!claims.sub,
    iss: claims.iss ?? null,
    aud: claims.aud ?? null,
    exp: claims.exp ?? null,
    role: claims.role ?? null,
  };
}

// ============================================================================
// End Authentication Diagnostics Helpers
// ============================================================================

// Model Selection: Supported providers and models
// Priority order: request `model` > env `AI_IMAGE_MODEL` > fallback by provider + detail
const SUPPORTED_PROVIDERS = ["google", "openai"] as const;
// Google models split into two groups:
// - Gemini 3 Pro Image: Generative Language API (uses GOOGLE_API_KEY, returns inline_data)
// - Imagen 3: Vertex AI (requires ENABLE_VERTEX_AI + service account auth)
const SUPPORTED_GOOGLE_MODELS = [
  // Gemini 3 Pro Image (Generative Language API) - available now
  "gemini-3-pro-image-preview",
  "gemini-3-pro-image",
  // Imagen 3 (Vertex AI) - gated behind ENABLE_VERTEX_AI
  "imagen-3.0",
  "imagen-3.0-lite",
  "imagen-3.0-highres",
] as const;
const SUPPORTED_OPENAI_MODELS = [
  "dall-e-3",
  "gpt-image-1024",
  "gpt-image-512",
] as const;

type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];
type SupportedGoogleModel = typeof SUPPORTED_GOOGLE_MODELS[number];
type SupportedOpenAIModel = typeof SUPPORTED_OPENAI_MODELS[number];
type SupportedModel = SupportedGoogleModel | SupportedOpenAIModel;

/**
 * Parameters for resolving the final model to use.
 */
type ResolveModelParams = {
  provider: string;
  requestedModel?: string | null;
  envModel?: string;
  detail?: "cheap" | "standard" | "pro";
};

/**
 * Result from model resolution.
 */
type ResolvedModel = {
  model: SupportedModel;
  provider: SupportedProvider;
};

/**
 * Resolve the final model based on priority order:
 * 1. Request body `model`
 * 2. Environment variable `AI_IMAGE_MODEL`
 * 3. Fallback mapping by provider + detail
 *
 * @throws Error if the requested model is not supported for the provider
 */
function resolveModel({ provider, requestedModel, envModel, detail }: ResolveModelParams): ResolvedModel {
  const normalizedProvider = provider.toLowerCase();
  const isGoogle = normalizedProvider === "google";
  const isOpenAI = normalizedProvider === "openai";

  // Check if the provider is supported
  if (!isGoogle && !isOpenAI) {
    throw new Error(`Unsupported provider: ${provider}. Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`);
  }

  // 1. Check request body model first
  if (requestedModel && typeof requestedModel === "string" && requestedModel.trim()) {
    const model = requestedModel.trim().toLowerCase();

    // Validate model against provider's allowed list
    if (isGoogle) {
      if (SUPPORTED_GOOGLE_MODELS.includes(model as SupportedGoogleModel)) {
        return { model: model as SupportedGoogleModel, provider: "google" };
      }
      throw new Error(
        `Unsupported model '${model}' for Google provider. Supported: ${SUPPORTED_GOOGLE_MODELS.join(", ")}`
      );
    }
    if (isOpenAI) {
      if (SUPPORTED_OPENAI_MODELS.includes(model as SupportedOpenAIModel)) {
        return { model: model as SupportedOpenAIModel, provider: "openai" };
      }
      throw new Error(
        `Unsupported model '${model}' for OpenAI provider. Supported: ${SUPPORTED_OPENAI_MODELS.join(", ")}`
      );
    }
  }

  // 2. Check environment variable model
  if (envModel && typeof envModel === "string" && envModel.trim()) {
    const model = envModel.trim().toLowerCase();

    if (isGoogle && SUPPORTED_GOOGLE_MODELS.includes(model as SupportedGoogleModel)) {
      return { model: model as SupportedGoogleModel, provider: "google" };
    }
    if (isOpenAI && SUPPORTED_OPENAI_MODELS.includes(model as SupportedOpenAIModel)) {
      return { model: model as SupportedOpenAIModel, provider: "openai" };
    }
    // If env model doesn't match provider, fall through to default
  }

  // 3. Fallback mapping by provider + detail
  if (isGoogle) {
    // Map detail tier to Google model
    // Default to Gemini 3 Pro Image (available via Generative Language API)
    // Imagen 3 models are gated behind ENABLE_VERTEX_AI
    if (detail === "pro") {
      return { model: "gemini-3-pro-image", provider: "google" };
    }
    if (detail === "cheap") {
      return { model: "gemini-3-pro-image-preview", provider: "google" };
    }
    return { model: "gemini-3-pro-image", provider: "google" };
  }

  // OpenAI fallback
  if (detail === "pro") {
    return { model: "dall-e-3", provider: "openai" };
  }
  if (detail === "cheap") {
    return { model: "gpt-image-512", provider: "openai" };
  }
  return { model: "gpt-image-1024", provider: "openai" };
}

// ============================================================================
// Prompt Enrichment System
// ============================================================================
// Provides richer, more consistent prompts for character generation.
// Combines archetype-specific base prompts with global quality additions
// and negative artifact suppression.

/**
 * Enriched archetype prompts for higher-quality initial generation.
 * Each archetype has a rich, detailed base prompt.
 */
const ENRICHED_ARCHETYPE_PROMPTS: Record<string, string> = {
  "hero": "A heroic character with a confident stance, noble appearance, and strong presence. Expressive face with determined eyes. Dynamic pose suggesting readiness for action. Well-defined silhouette with balanced proportions.",
  "villain": "A menacing villain character with dramatic features and an imposing presence. Sharp, angular facial features with intense, calculating eyes. Dark or bold color palette. Powerful stance conveying authority and danger.",
  "sci-fi": "A futuristic sci-fi character with sleek technological elements and modern styling. Clean lines and metallic accents. Integrated tech elements like visors, holographic interfaces, or cybernetic enhancements. Streamlined silhouette.",
  "fantasy": "A fantasy character with mystical or medieval elements and magical aura. Ornate costume details with flowing fabrics. Ethereal glow or magical particles. Distinctive accessories like staffs, amulets, or enchanted weapons.",
  "child": "A young child character with innocent features and playful energy. Soft, rounded facial features with bright, curious eyes. Casual, age-appropriate clothing. Warm, approachable expression.",
  "robot": "A robotic character with mechanical features and technological design. Precise geometric shapes and articulated joints. Glowing elements like eyes or power cores. Mix of smooth panels and exposed mechanical components.",
};

/**
 * Build a rich archetype prompt for character generation.
 * @param archetype - The character archetype (hero, villain, etc.)
 * @returns Enriched prompt string for the archetype
 */
function buildArchetypePrompt(archetype: string): string {
  const normalized = archetype.toLowerCase().trim();
  return ENRICHED_ARCHETYPE_PROMPTS[normalized] || `A ${normalized} character with distinctive features and clear visual identity.`;
}

/**
 * Global additions for quality, lighting, and composition.
 * @param tier - Quality tier (standard or premium)
 * @returns Array of quality enhancement phrases
 */
function buildGlobalAdditions(tier: string): string[] {
  const base = [
    "Full body character design",
    "Clean edges suitable for compositing",
    "Professional character art",
    "Balanced lighting with subtle shadows",
    "Clear silhouette",
  ];

  if (tier === "premium") {
    return [
      ...base,
      "Highly detailed",
      "Cinematic quality",
      "Studio lighting",
      "4K resolution",
    ];
  }

  return base;
}

/**
 * Negative artifact suppression phrases.
 * These help prevent common AI generation artifacts.
 */
const NEGATIVE_ARTIFACT_SUPPRESSION = [
  "No text",
  "No watermark",
  "Avoid distorted hands",
  "Avoid extra limbs",
  "Avoid blurry faces",
  "No cropped body parts",
  "Anatomically correct proportions",
];

/**
 * Compose a complete enriched prompt for initial character generation.
 * Combines archetype prompt + global additions + negative suppression.
 * @param archetype - Character archetype
 * @param tier - Quality tier
 * @returns Complete enriched prompt string
 */
function composeInitialPrompt(archetype: string, tier: string): string {
  const archetypePrompt = buildArchetypePrompt(archetype);
  const globalAdditions = buildGlobalAdditions(tier);
  const negativeSuppressions = NEGATIVE_ARTIFACT_SUPPRESSION;

  const promptParts = [
    archetypePrompt,
    ...globalAdditions,
    ...negativeSuppressions,
  ];

  return promptParts.join(". ") + ".";
}

/**
 * Compose an enriched prompt for character refinement.
 * Combines archetype prompt + refine modifiers + global additions + negative suppression.
 * @param archetype - Character archetype
 * @param refineModifiers - Array of modifier phrases from refine params
 * @param tier - Quality tier
 * @returns Complete enriched refinement prompt string
 */
function composeRefinementPrompt(archetype: string, refineModifiers: string[], tier: string): string {
  const archetypePrompt = buildArchetypePrompt(archetype);
  const globalAdditions = buildGlobalAdditions(tier);
  const negativeSuppressions = NEGATIVE_ARTIFACT_SUPPRESSION;

  const promptParts = [
    archetypePrompt,
    ...refineModifiers,
    ...globalAdditions,
    ...negativeSuppressions,
  ];

  return promptParts.join(". ") + ".";
}

/**
 * Check if Imagen 3 (Vertex AI) is enabled.
 * Returns false if ENABLE_VERTEX_AI is not set.
 * Note: Gemini 3 Pro Image models use the Generative Language API and don't require this flag.
 */
function isVertexAIEnabled(): boolean {
  if (!ENABLE_VERTEX_AI) {
    if (DEBUG) {
      console.log("[PROVIDER] Imagen 3 (Vertex AI) is gated. ENABLE_VERTEX_AI is not set to 'true'.");
    }
    return false;
  }
  return true;
}

/**
 * Check if a model is a Gemini 3 Pro Image model (uses Generative Language API).
 */
function isGemini3ProImageModel(model: string): boolean {
  return model.startsWith("gemini-3-pro-image");
}

/**
 * Check if a model is an Imagen 3 model (requires Vertex AI).
 */
function isImagen3Model(model: string): boolean {
  return model.startsWith("imagen-3");
}

// ============================================================================
// End Prompt Enrichment System
// ============================================================================

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

const PLACEHOLDER_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBApOtSboAAAAASUVORK5CYII=";

function decodeBase64Image(input: string): Uint8Array {
  const clean = input.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64Image(input: Uint8Array): string {
  let result = "";
  for (let i = 0; i < input.length; i += 1) {
    result += String.fromCharCode(input[i]);
  }
  return btoa(result);
}

const PLACEHOLDER_BYTES = decodeBase64Image(PLACEHOLDER_BASE64);

function jsonResponse(status: number, body: Record<string, unknown>, requestOrigin?: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(requestOrigin ?? null),
    },
  });
}

type CharacterRecord = {
  id: string;
  owner_id: string;
  project_id: string | null;
  name: string;
  base_image_url: string | null;
  has_pose_library: boolean;
};

type PoseRequest = {
  label: string;
  description: string;
  long_description?: string;
  scene_use_case?: string;
};

type PoseGenerationResult = {
  id: string;
  pose_label: string;
  pose_description: string;
  scene_use_case?: string | null;
  score: number;
  approved_for_scene: boolean;
  generated_image_url: string;
  signed_url: string | null;
};

type SceneGenerationResult = {
  id: string;
  frame_index: number;
  output_image_url: string;
  signed_url: string | null;
  variant_group_id: string | null;
  variant_index: number | null;
  selected: boolean;
};

type StoragePath = {
  bucket: string;
  path: string;
};

type ImageReference = {
  role: string;
  bucket: string;
  path: string;
  description?: string;
};

type PoseInsert = {
  id: string;
  owner_id: string;
  character_id: string;
  pose_label: string;
  pose_description: string;
  scene_use_case?: string | null;
  input_image_url?: string | null;
  generated_image_url: string;
  score: number;
  approved_for_scene: boolean;
  metadata: Record<string, unknown>;
};

type SceneFrameInsert = {
  id: string;
  owner_id: string;
  scene_id: string;
  frame_index: number;
  character_id?: string | null;
  pose_id?: string | null;
  input_images: ImageReference[];
  prompt_used: string;
  output_image_url: string;
  variant_group_id?: string | null;
  variant_index?: number | null;
  selected: boolean;
  metadata: Record<string, unknown>;
};

type PoseScoreContext = {
  intended: string;
  label: string;
  description: string;
  providerSummary?: string;
};

type ProviderImageResult = {
  image: Uint8Array;
  provider: string;
  metadata?: Record<string, unknown>;
};

type ProviderVariantResult = {
  provider: string;
  images: { image: Uint8Array; metadata?: Record<string, unknown> }[];
};

type PoseProviderOptions = {
  transparent?: boolean;
};

type SceneProviderOptions = {
  width?: number;
  height?: number;
  transparent?: boolean;
  variants?: number;
};

/**
 * Parameters for character refinement based on UI sliders.
 * Used by the refine-character action to modify an existing character image.
 */
type RefineParams = {
  age?: "younger" | "adult" | "older";
  mood?: "neutral" | "happy" | "angry" | "sad";
  hairLength?: "short" | "medium" | "long";
  eyebrowShape?: "soft" | "sharp" | "thick" | "thin";
  style?: "anime" | "realistic" | "painterly";
  detail?: "cheap" | "standard" | "pro";
};

/**
 * Valid image size options for AI providers.
 */
type ImageSize = "512x512" | "1024x1024" | "1792x1024";

/**
 * Valid quality options for AI providers.
 */
type ImageQuality = "standard" | "hd";

/**
 * Detail settings for image generation.
 */
type DetailSettings = {
  size: ImageSize;
  quality: ImageQuality;
};

interface ImageProvider {
  name: string;
  generatePoseFromCharacter(
    base: Uint8Array,
    prompt: string,
    options?: PoseProviderOptions,
  ): Promise<ProviderImageResult>;
  generateSceneFromCharacter(
    base: Uint8Array,
    poseImage: Uint8Array | null,
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderImageResult>;
  generateSceneContinuation(
    base: Uint8Array,
    previousFrames: Uint8Array[],
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderVariantResult>;
}

class PlaceholderProvider implements ImageProvider {
  name = "placeholder";
  async generatePoseFromCharacter(
    _base: Uint8Array,
    prompt: string,
  ): Promise<ProviderImageResult> {
    return {
      image: PLACEHOLDER_BYTES,
      provider: this.name,
      metadata: { prompt, note: "Placeholder provider used" },
    };
  }

  async generateSceneFromCharacter(
    _base: Uint8Array,
    _poseImage: Uint8Array | null,
    prompt: string,
    references: ImageReference[],
  ): Promise<ProviderImageResult> {
    return {
      image: PLACEHOLDER_BYTES,
      provider: this.name,
      metadata: { prompt, references, note: "Placeholder provider used" },
    };
  }

  async generateSceneContinuation(
    _base: Uint8Array,
    _previousFrames: Uint8Array[],
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderVariantResult> {
    const total = options?.variants && options.variants > 0 ? options.variants : CONTINUATION_VARIANTS;
    const images = Array.from({ length: total }).map(() => ({
      image: PLACEHOLDER_BYTES,
      metadata: { prompt, references, note: "Placeholder variant" },
    }));
    return { provider: this.name, images };
  }
}

async function ensureTransparent(image: Uint8Array): Promise<Uint8Array> {
  // TODO: integrate with background removal service if available.
  // For now we return the source image.
  return image;
}

async function openAiImageRequest(endpoint: string, body: FormData | Record<string, unknown>) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
  };
  if (body instanceof FormData) {
    init.body = body;
  } else {
    init.headers = {
      ...init.headers,
      "Content-Type": "application/json",
    };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(endpoint, init);
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`OpenAI request failed: ${message}`);
  }
  return data;
}

/**
 * Make a request to the Google Generative Language API.
 * Builds the endpoint per-request using the provided model.
 * @param model - The model ID (e.g., 'gemini-3-pro-image-preview', 'gemini-3-pro-image')
 * @param body - The request body
 * @returns The API response data
 */
async function googleImageRequest(model: string, body: Record<string, unknown>) {
  if (!GOOGLE_API_KEY) {
    throw new Error("Google API key not configured");
  }
  // Build endpoint per-request with the resolved model
  const endpoint = `${GOOGLE_GENERATIVE_API_BASE}/${model}:generateContent?key=${GOOGLE_API_KEY}`;
  
  if (DEBUG) {
    console.log("[GOOGLE] Request endpoint:", endpoint.replace(GOOGLE_API_KEY, "***"));
    console.log("[GOOGLE] Request model:", model);
  }
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  
  if (DEBUG) {
    console.log("[GOOGLE] Response status:", response.status);
    if (!response.ok) {
      console.log("[GOOGLE] Response data:", JSON.stringify(data));
    }
  }
  
  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`Google image request failed: ${message}`);
  }
  return data;
}

class OpenAIImageProvider extends PlaceholderProvider {
  name = "openai";

  private buildPrompt(basePrompt: string, extra: string[]): string {
    return [
      basePrompt,
      "Maintain exact likeness, costume details, and proportions of the reference character.",
      "Render clean edges suitable for compositing.",
      ...extra,
    ].join(" \n");
  }

  private async createBlob(data: Uint8Array, mimeType = "image/png") {
    return new Blob([data], { type: mimeType });
  }

  async generatePoseFromCharacter(
    base: Uint8Array,
    prompt: string,
    options?: PoseProviderOptions,
  ): Promise<ProviderImageResult> {
    if (!OPENAI_API_KEY) return super.generatePoseFromCharacter(base, prompt, options);
    try {
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", this.buildPrompt(prompt, ["Return a transparent PNG with no background."]));
      form.append("image[]", await this.createBlob(base), "character.png");
      form.append("n", "1");
      form.append("response_format", "b64_json");
      const data = await openAiImageRequest("https://api.openai.com/v1/images/edits", form);
      const base64 = data?.data?.[0]?.b64_json;
      if (!base64) throw new Error("OpenAI did not return pose image");
      let bytes = decodeBase64Image(base64);
      if (options?.transparent) {
        bytes = await ensureTransparent(bytes);
      }
      return { image: bytes, provider: this.name, metadata: { prompt } };
    } catch (error) {
      console.error("OpenAI pose generation failed, using placeholder", error);
      return super.generatePoseFromCharacter(base, prompt, options);
    }
  }

  async generateSceneFromCharacter(
    base: Uint8Array,
    poseImage: Uint8Array | null,
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderImageResult> {
    if (!OPENAI_API_KEY) return super.generateSceneFromCharacter(base, poseImage, prompt, references, options);
    try {
      const promptExtras = [
        "Full scene with cinematic lighting and cohesive environment.",
        "Respect the supplied character and pose references for identity consistency.",
      ];
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", this.buildPrompt(prompt, promptExtras));
      form.append("image[]", await this.createBlob(base), "character.png");
      if (poseImage) {
        form.append("image[]", await this.createBlob(poseImage), "pose.png");
      }
      form.append("n", "1");
      form.append("response_format", "b64_json");
      const data = await openAiImageRequest("https://api.openai.com/v1/images/edits", form);
      const base64 = data?.data?.[0]?.b64_json;
      if (!base64) throw new Error("OpenAI did not return scene image");
      let bytes = decodeBase64Image(base64);
      if (options?.transparent) {
        bytes = await ensureTransparent(bytes);
      }
      return {
        image: bytes,
        provider: this.name,
        metadata: {
          prompt,
          references,
        },
      };
    } catch (error) {
      console.error("OpenAI scene generation failed, using placeholder", error);
      return super.generateSceneFromCharacter(base, poseImage, prompt, references, options);
    }
  }

  async generateSceneContinuation(
    base: Uint8Array,
    previousFrames: Uint8Array[],
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderVariantResult> {
    if (!OPENAI_API_KEY) return super.generateSceneContinuation(base, previousFrames, prompt, references, options);
    try {
      const promptExtras = [
        "Maintain continuity with the previous storyboard frames, including lighting and composition.",
        "Return cinematic renders consistent with the supplied references.",
      ];
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", this.buildPrompt(prompt, promptExtras));
      form.append("image[]", await this.createBlob(base), "character.png");
      for (let index = 0; index < previousFrames.length; index += 1) {
        const frame = previousFrames[index];
        form.append("image[]", await this.createBlob(frame), `frame-${index}.png`);
      }
      const variants = options?.variants && options.variants > 0 ? options.variants : CONTINUATION_VARIANTS;
      form.append("n", String(variants));
      form.append("response_format", "b64_json");
      const data = await openAiImageRequest("https://api.openai.com/v1/images/edits", form);
      const images = Array.isArray(data?.data)
        ? data.data.map((item: any) => {
          const base64 = item?.b64_json;
          if (typeof base64 !== "string") return { image: PLACEHOLDER_BYTES, metadata: { note: "Missing data" } };
          return {
            image: decodeBase64Image(base64),
            metadata: { prompt, references },
          };
        })
        : [];
      if (!images.length) throw new Error("OpenAI did not return continuation variants");
      return { provider: this.name, images };
    } catch (error) {
      console.error("OpenAI continuation failed, using placeholder", error);
      return super.generateSceneContinuation(base, previousFrames, prompt, references, options);
    }
  }
}

function extractGoogleImages(data: any): { image: Uint8Array; metadata?: Record<string, unknown> }[] {
  if (!data?.candidates || !Array.isArray(data.candidates)) return [];
  const results: { image: Uint8Array; metadata?: Record<string, unknown> }[] = [];
  for (const candidate of data.candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const inline = part?.inline_data || part?.inlineData;
      if (!inline || typeof inline.data !== "string") continue;
      results.push({
        image: decodeBase64Image(inline.data),
        metadata: { safety: candidate?.safetyRatings || candidate?.safety_ratings || [] },
      });
    }
  }
  return results;
}

class GoogleImageProvider extends PlaceholderProvider {
  name = "google";
  // Default model for pose/scene generation - uses Gemini 3 Pro Image via Generative Language API
  private defaultModel = "gemini-3-pro-image";

  private buildPrompt(basePrompt: string, extra: string[]): string {
    return [
      basePrompt,
      "Preserve exact likeness, costume details, and proportions of the supplied reference.",
      ...extra,
    ].join(" \n");
  }

  private basePayload(prompt: string, images: Uint8Array[], candidateCount = 1) {
    const parts: any[] = [{ text: prompt }];
    images.forEach(bytes => {
      parts.push({ inline_data: { mime_type: "image/png", data: encodeBase64Image(bytes) } });
    });
    return {
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        candidateCount,
      },
    };
  }

  async generatePoseFromCharacter(
    base: Uint8Array,
    prompt: string,
    options?: PoseProviderOptions,
  ): Promise<ProviderImageResult> {
    if (!GOOGLE_API_KEY) return super.generatePoseFromCharacter(base, prompt, options);
    try {
      const payload = this.basePayload(
        this.buildPrompt(prompt, ["Return a transparent PNG background if possible."]),
        [base],
      );
      const data = await googleImageRequest(this.defaultModel, payload);
      const [image] = extractGoogleImages(data);
      if (!image) throw new Error("Google did not return pose image");
      let bytes = image.image;
      if (options?.transparent) {
        bytes = await ensureTransparent(bytes);
      }
      return { image: bytes, provider: this.name, metadata: { prompt, model: this.defaultModel, provider_metadata: image.metadata || {} } };
    } catch (error) {
      console.error("Google pose generation failed, using placeholder", error);
      return super.generatePoseFromCharacter(base, prompt, options);
    }
  }

  async generateSceneFromCharacter(
    base: Uint8Array,
    poseImage: Uint8Array | null,
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderImageResult> {
    if (!GOOGLE_API_KEY) return super.generateSceneFromCharacter(base, poseImage, prompt, references, options);
    try {
      const images = [base];
      if (poseImage) images.push(poseImage);
      const extra = [
        "Render a cohesive scene with cinematic lighting.",
        `Respect references: ${references.map(ref => `${ref.role}:${ref.path}`).join(", ")}`,
      ];
      const payload = this.basePayload(this.buildPrompt(prompt, extra), images);
      const data = await googleImageRequest(this.defaultModel, payload);
      const [image] = extractGoogleImages(data);
      if (!image) throw new Error("Google did not return scene image");
      let bytes = image.image;
      if (options?.transparent) {
        bytes = await ensureTransparent(bytes);
      }
      return {
        image: bytes,
        provider: this.name,
        metadata: { prompt, references, model: this.defaultModel, provider_metadata: image.metadata || {} },
      };
    } catch (error) {
      console.error("Google scene generation failed, using placeholder", error);
      return super.generateSceneFromCharacter(base, poseImage, prompt, references, options);
    }
  }

  async generateSceneContinuation(
    base: Uint8Array,
    previousFrames: Uint8Array[],
    prompt: string,
    references: ImageReference[],
    options?: SceneProviderOptions,
  ): Promise<ProviderVariantResult> {
    if (!GOOGLE_API_KEY) return super.generateSceneContinuation(base, previousFrames, prompt, references, options);
    try {
      const images = [base, ...previousFrames];
      const variants = options?.variants && options.variants > 0 ? options.variants : CONTINUATION_VARIANTS;
      const payload = this.basePayload(
        this.buildPrompt(prompt, [
          "Maintain continuity with previous frames (composition, lighting, palette).",
          `References included: ${references.map(ref => `${ref.role}:${ref.path}`).join(", ")}`,
        ]),
        images,
        variants,
      );
      const data = await googleImageRequest(this.defaultModel, payload);
      const imagesOut = extractGoogleImages(data);
      if (!imagesOut.length) throw new Error("Google did not return continuation variants");
      return { provider: this.name, images: imagesOut };
    } catch (error) {
      console.error("Google continuation failed, using placeholder", error);
      return super.generateSceneContinuation(base, previousFrames, prompt, references, options);
    }
  }
}

function resolveProvider(): ImageProvider {
  // Google provider now supports Gemini 3 Pro Image without ENABLE_VERTEX_AI flag
  // Imagen 3 models still require ENABLE_VERTEX_AI (checked per-request in handlers)
  if (AI_IMAGE_PROVIDER === "google") {
    if (GOOGLE_API_KEY) {
      return new GoogleImageProvider();
    }
    console.warn("[PROVIDER] Google provider requested but GOOGLE_API_KEY not configured. Falling back to OpenAI.");
    if (OPENAI_API_KEY) return new OpenAIImageProvider();
    return new PlaceholderProvider();
  }
  if (AI_IMAGE_PROVIDER === "openai" && OPENAI_API_KEY) {
    return new OpenAIImageProvider();
  }
  if (AI_IMAGE_PROVIDER === "auto") {
    // For auto mode, prefer OpenAI but allow Google if configured
    if (OPENAI_API_KEY) return new OpenAIImageProvider();
    if (GOOGLE_API_KEY) return new GoogleImageProvider();
  }
  if (OPENAI_API_KEY) return new OpenAIImageProvider();
  if (GOOGLE_API_KEY) return new GoogleImageProvider();
  return new PlaceholderProvider();
}

function parseStoragePath(value: string | null | undefined): StoragePath | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [bucket, ...rest] = trimmed.split("/");
  if (!bucket || !rest.length) return null;
  return { bucket, path: rest.join("/") };
}

function characterBasePath(ownerId: string, characterId: string): StoragePath {
  return {
    bucket: REF_BUCKET,
    path: `${CHARACTER_BASE_PREFIX}/${ownerId}/${characterId}/character-${characterId}-base.png`,
  };
}

function posePath(ownerId: string, characterId: string, poseId: string): StoragePath {
  return {
    bucket: REF_BUCKET,
    path: `${CHARACTER_POSE_PREFIX}/${ownerId}/${characterId}/${poseId}.png`,
  };
}

function sceneFramePath(ownerId: string, sceneId: string, frameId: string): StoragePath {
  return {
    bucket: RENDER_BUCKET,
    path: `${SCENE_RENDER_PREFIX}/${ownerId}/${sceneId}/${frameId}.png`,
  };
}

async function uploadToStorage(
  client: SupabaseClient,
  target: StoragePath,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage
    .from(target.bucket)
    .upload(target.path, new Blob([data], { type: contentType }), {
      upsert: true,
      contentType,
    });
  if (error) {
    throw error;
  }
}

async function downloadFromStorage(
  client: SupabaseClient,
  target: StoragePath,
): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(target.bucket).download(target.path);
  if (error || !data) {
    throw error || new Error("Unable to download storage asset");
  }
  const buffer = await data.arrayBuffer();
  return new Uint8Array(buffer);
}

async function createSignedUrl(
  client: SupabaseClient,
  target: StoragePath,
  expiresIn = SIGNED_URL_EXPIRY,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(target.bucket)
    .createSignedUrl(target.path, expiresIn);
  if (error) {
    console.warn("Signed URL creation failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

function keywordScore({ intended, label, description, providerSummary }: PoseScoreContext): number {
  const tokenize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  const targetWords = new Set(tokenize(intended));
  if (!targetWords.size) return 0.1;
  const comparison = new Set([
    ...tokenize(label),
    ...tokenize(description),
    ...tokenize(providerSummary || ""),
  ]);
  let matches = 0;
  for (const word of targetWords) {
    if (comparison.has(word)) matches += 1;
  }
  return Math.max(matches / targetWords.size, 0.05);
}

function selectTopK<T extends { score: number }>(items: T[], k: number): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  return sorted.slice(0, k);
}

function normalizePoseRequest(input: any): PoseRequest | null {
  if (!input || typeof input !== "object") return null;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!label || !description) return null;
  const result: PoseRequest = { label, description };
  if (typeof input.long_description === "string") result.long_description = input.long_description.trim();
  if (typeof input.scene_use_case === "string") result.scene_use_case = input.scene_use_case.trim();
  return result;
}

async function ensureCharacter(
  client: SupabaseClient,
  ownerId: string,
  characterId: string,
): Promise<CharacterRecord> {
  const { data, error } = await client
    .from("characters")
    .select("id, owner_id, project_id, name, base_image_url, has_pose_library")
    .eq("id", characterId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) {
    throw new Error("Character not found or access denied");
  }
  return data as CharacterRecord;
}

async function ensureScene(
  client: SupabaseClient,
  ownerId: string,
  sceneId: string,
): Promise<{ id: string; owner_id: string; project_id: string | null; latest_frame?: number }> {
  const { data, error } = await client
    .from("scenes")
    .select("id, owner_id, project_id")
    .eq("id", sceneId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) {
    throw new Error("Scene not found or access denied");
  }
  const { data: frameStats } = await client
    .from("scene_frames")
    .select("frame_index")
    .eq("scene_id", sceneId)
    .order("frame_index", { ascending: false })
    .limit(1);
  const latest = Array.isArray(frameStats) && frameStats.length ? frameStats[0].frame_index : undefined;
  return { ...data, latest_frame: latest };
}

function buildPosePrompt(character: CharacterRecord, pose: PoseRequest): string {
  const description = pose.long_description || pose.description;
  const base = `Pose: ${pose.label}. ${description}`;
  const useCase = pose.scene_use_case ? `Scene use case: ${pose.scene_use_case}.` : "";
  return [
    `Character: ${character.name || "Unnamed"}.`,
    base,
    useCase,
    "Keep silhouette readable and maintain outfit accuracy.",
  ]
    .filter(Boolean)
    .join(" \n");
}

function buildScenePrompt(
  character: CharacterRecord,
  pose: PoseRequest | null,
  scenePrompt: string,
): string {
  const poseLine = pose ? `Use pose: ${pose.label} (${pose.description}).` : "";
  return [
    `Scene setup for ${character.name || "the character"}.`,
    poseLine,
    scenePrompt,
    "Render cinematic framing with consistent styling and lighting continuity.",
  ]
    .filter(Boolean)
    .join(" \n");
}

async function getPoseRecord(
  client: SupabaseClient,
  ownerId: string,
  poseId: string,
): Promise<PoseInsert | null> {
  const { data, error } = await client
    .from("character_poses")
    .select(
      "id, owner_id, character_id, pose_label, pose_description, scene_use_case, generated_image_url, score, approved_for_scene, metadata",
    )
    .eq("id", poseId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data as PoseInsert | null;
}

async function fetchPreviousFrameBytes(
  client: SupabaseClient,
  ownerId: string,
  sceneId: string,
  limit: number,
): Promise<{ bytes: Uint8Array; reference: ImageReference }[]> {
  if (limit <= 0) return [];
  const { data, error } = await client
    .from("scene_frames")
    .select("output_image_url, frame_index")
    .eq("scene_id", sceneId)
    .eq("owner_id", ownerId)
    .order("frame_index", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  const results: { bytes: Uint8Array; reference: ImageReference }[] = [];
  for (const item of list) {
    const storage = parseStoragePath(item.output_image_url);
    if (!storage) continue;
    const bytes = await downloadFromStorage(client, storage);
    results.push({
      bytes,
      reference: {
        role: "previous",
        bucket: storage.bucket,
        path: storage.path,
        description: `Frame ${item.frame_index}`,
      },
    });
  }
  return results;
}

async function handleUploadBase(
  client: SupabaseClient,
  userId: string,
  body: any,
  requestOrigin?: string | null,
): Promise<Response> {
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const imageInput = typeof body?.image === "string" ? body.image : "";
  if (!characterId || !imageInput) {
    return jsonResponse(400, { error: "character_id and image are required" }, requestOrigin);
  }
  const character = await ensureCharacter(client, userId, characterId);
  let payload = imageInput;
  if (payload.startsWith("data:")) {
    const [, base64] = payload.split(",", 2);
    payload = base64 || "";
  }
  try {
    const bytes = decodeBase64Image(payload);
    const target = characterBasePath(userId, characterId);
    await uploadToStorage(client, target, bytes, "image/png");
    await client
      .from("characters")
      .update({
        base_image_url: `${target.bucket}/${target.path}`,
        has_pose_library: false,
      })
      .eq("id", characterId)
      .eq("owner_id", userId);
    const signed = await createSignedUrl(client, target);
    return jsonResponse(200, {
      character_id: characterId,
      base_image_url: `${target.bucket}/${target.path}`,
      signed_url: signed,
    }, requestOrigin);
  } catch (error) {
    console.error("Upload base image failed", error);
    return jsonResponse(500, { error: "Failed to process base image" }, requestOrigin);
  }
}

async function handleGeneratePoses(
  client: SupabaseClient,
  userId: string,
  body: any,
  requestOrigin?: string | null,
): Promise<Response> {
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const poseInputs = Array.isArray(body?.poses) ? body.poses : [];
  if (!characterId || !poseInputs.length) {
    return jsonResponse(400, { error: "character_id and poses[] are required" }, requestOrigin);
  }
  const keepTop = Math.max(
    1,
    Math.min(5, typeof body?.keep_top === "number" ? Math.floor(body.keep_top) : DEFAULT_TOP_POSES),
  );
  const character = await ensureCharacter(client, userId, characterId);
  const storage = parseStoragePath(character.base_image_url) ?? characterBasePath(userId, characterId);
  const baseImage = await downloadFromStorage(client, storage);
  const provider = resolveProvider();
  const poseRequests = poseInputs
    .map(normalizePoseRequest)
    .filter((pose): pose is PoseRequest => Boolean(pose));
  if (!poseRequests.length) {
    return jsonResponse(400, { error: "No valid poses provided" }, requestOrigin);
  }

  const inserts: PoseInsert[] = [];
  for (const pose of poseRequests) {
    const prompt = buildPosePrompt(character, pose);
    const result = await provider.generatePoseFromCharacter(baseImage, prompt, { transparent: true });
    const poseId = crypto.randomUUID();
    const target = posePath(userId, characterId, poseId);
    await uploadToStorage(client, target, result.image, "image/png");
    const score = keywordScore({
      intended: pose.description,
      label: pose.label,
      description: pose.long_description || pose.description,
      providerSummary: String(result.metadata?.summary || ""),
    });
    inserts.push({
      id: poseId,
      owner_id: userId,
      character_id: characterId,
      pose_label: pose.label,
      pose_description: pose.long_description || pose.description,
      scene_use_case: pose.scene_use_case || null,
      input_image_url: `${storage.bucket}/${storage.path}`,
      generated_image_url: `${target.bucket}/${target.path}`,
      score,
      approved_for_scene: false,
      metadata: {
        provider: result.provider,
        prompt,
        provider_metadata: result.metadata || {},
      },
    });
  }

  if (!inserts.length) {
    return jsonResponse(500, { error: "Unable to generate poses" }, requestOrigin);
  }

  const top = new Set(selectTopK(inserts, keepTop).map(item => item.id));
  inserts.forEach(item => {
    item.approved_for_scene = top.has(item.id);
  });

  const { data: saved, error } = await client
    .from("character_poses")
    .upsert(inserts, { onConflict: "id" })
    .select();
  if (error) {
    console.error("Failed to persist pose records", error);
    return jsonResponse(500, { error: "Failed to save pose records" }, requestOrigin);
  }

  await client
    .from("characters")
    .update({ has_pose_library: true })
    .eq("id", characterId)
    .eq("owner_id", userId);

  const payload: PoseGenerationResult[] = [];
  for (const pose of inserts) {
    const signed = await createSignedUrl(client, parseStoragePath(pose.generated_image_url) ?? posePath(userId, characterId, pose.id));
    payload.push({
      id: pose.id,
      pose_label: pose.pose_label,
      pose_description: pose.pose_description,
      scene_use_case: pose.scene_use_case || undefined,
      score: pose.score,
      approved_for_scene: pose.approved_for_scene,
      generated_image_url: pose.generated_image_url,
      signed_url: signed,
    });
  }
  return jsonResponse(201, {
    character_id: characterId,
    provider: provider.name,
    poses: payload,
  }, requestOrigin);
}

async function handleSceneGeneration(
  client: SupabaseClient,
  userId: string,
  body: any,
  requestOrigin?: string | null,
): Promise<Response> {
  const sceneId = typeof body?.scene_id === "string" ? body.scene_id : "";
  const frameIndex = typeof body?.frame_index === "number" ? Math.max(1, Math.floor(body.frame_index)) : 1;
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const poseId = typeof body?.pose_id === "string" ? body.pose_id : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!sceneId || !characterId || !prompt) {
    return jsonResponse(400, { error: "scene_id, character_id, and prompt are required" }, requestOrigin);
  }
  const scene = await ensureScene(client, userId, sceneId);
  const character = await ensureCharacter(client, userId, characterId);
  const baseStorage = parseStoragePath(character.base_image_url);
  if (!baseStorage) {
    return jsonResponse(400, { error: "Character base image not found" }, requestOrigin);
  }
  const baseImage = await downloadFromStorage(client, baseStorage);
  let poseRecord: PoseInsert | null = null;
  let poseImage: Uint8Array | null = null;
  if (poseId) {
    poseRecord = await getPoseRecord(client, userId, poseId);
    if (poseRecord) {
      const poseStorage = parseStoragePath(poseRecord.generated_image_url);
      if (poseStorage) {
        poseImage = await downloadFromStorage(client, poseStorage);
      }
    }
  }
  const poseRequest: PoseRequest | null = poseRecord
    ? {
      label: poseRecord.pose_label,
      description: poseRecord.pose_description,
      scene_use_case: poseRecord.scene_use_case || undefined,
    }
    : null;
  const scenePrompt = buildScenePrompt(character, poseRequest, prompt);
  const provider = resolveProvider();
  const references: ImageReference[] = [
    { role: "character", bucket: baseStorage.bucket, path: baseStorage.path },
  ];
  if (poseRecord) {
    const poseStorage = parseStoragePath(poseRecord.generated_image_url);
    if (poseStorage) {
      references.push({ role: "pose", bucket: poseStorage.bucket, path: poseStorage.path });
    }
  }

  const result = await provider.generateSceneFromCharacter(baseImage, poseImage, scenePrompt, references, {
    transparent: false,
    width: typeof body?.width === "number" ? body.width : undefined,
    height: typeof body?.height === "number" ? body.height : undefined,
  });
  const frameId = crypto.randomUUID();
  const target = sceneFramePath(userId, sceneId, frameId);
  await uploadToStorage(client, target, result.image, "image/png");
  const { data: asset, error: assetError } = await client
    .from("assets")
    .insert({
      owner_id: userId,
      scene_id: sceneId,
      kind: "render",
      storage_path: target.path,
      metadata: {
        bucket: target.bucket,
        provider: result.provider,
        character_id: characterId,
        pose_id: poseRecord?.id || null,
        prompt: scenePrompt,
        source: "ai-image-pipeline",
      },
    })
    .select("id")
    .single();
  if (assetError) {
    console.error("Failed to persist render asset for scene", assetError);
  }
  const insert: SceneFrameInsert = {
    id: frameId,
    owner_id: userId,
    scene_id: sceneId,
    frame_index: frameIndex,
    character_id: characterId,
    pose_id: poseRecord?.id || null,
    input_images: references,
    prompt_used: scenePrompt,
    output_image_url: `${target.bucket}/${target.path}`,
    variant_group_id: null,
    variant_index: null,
    selected: true,
    metadata: {
      provider: result.provider,
      provider_metadata: result.metadata || {},
      asset_id: asset?.id || null,
    },
  };
  const { error } = await client.from("scene_frames").insert(insert);
  if (error) {
    console.error("Failed to persist scene frame", error);
    return jsonResponse(500, { error: "Failed to save scene frame" }, requestOrigin);
  }
  const signed = await createSignedUrl(client, target);
  const payload: SceneGenerationResult = {
    id: frameId,
    frame_index: frameIndex,
    output_image_url: insert.output_image_url,
    signed_url: signed,
    variant_group_id: null,
    variant_index: null,
    selected: true,
  };
  return jsonResponse(201, {
    scene_id: sceneId,
    provider: provider.name,
    frame: payload,
  }, requestOrigin);
}

async function handleSceneContinuation(
  client: SupabaseClient,
  userId: string,
  body: any,
  requestOrigin?: string | null,
): Promise<Response> {
  const sceneId = typeof body?.scene_id === "string" ? body.scene_id : "";
  const frameIndex = typeof body?.frame_index === "number" ? Math.max(1, Math.floor(body.frame_index)) : 1;
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const poseId = typeof body?.pose_id === "string" ? body.pose_id : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!sceneId || !characterId || !prompt) {
    return jsonResponse(400, { error: "scene_id, character_id, and prompt are required" }, requestOrigin);
  }
  await ensureScene(client, userId, sceneId);
  const character = await ensureCharacter(client, userId, characterId);
  const baseStorage = parseStoragePath(character.base_image_url);
  if (!baseStorage) {
    return jsonResponse(400, { error: "Character base image not found" }, requestOrigin);
  }
  const baseImage = await downloadFromStorage(client, baseStorage);
  let poseRecord: PoseInsert | null = null;
  if (poseId) {
    poseRecord = await getPoseRecord(client, userId, poseId);
  }
  const poseStorage = poseRecord ? parseStoragePath(poseRecord.generated_image_url) : null;
  const poseImage = poseStorage ? await downloadFromStorage(client, poseStorage) : null;
  const poseRequest: PoseRequest | null = poseRecord
    ? {
      label: poseRecord.pose_label,
      description: poseRecord.pose_description,
      scene_use_case: poseRecord.scene_use_case || undefined,
    }
    : null;
  const scenePrompt = buildScenePrompt(character, poseRequest, prompt);
  const previous = await fetchPreviousFrameBytes(client, userId, sceneId, 2);
  const provider = resolveProvider();
  const references: ImageReference[] = [
    { role: "character", bucket: baseStorage.bucket, path: baseStorage.path },
  ];
  if (poseStorage) {
    references.push({ role: "pose", bucket: poseStorage.bucket, path: poseStorage.path });
  }
  references.push(...previous.map(item => item.reference));
  const previousBytes = previous.map(item => item.bytes);
  const variants = await provider.generateSceneContinuation(baseImage, previousBytes, scenePrompt, references, {
    variants: CONTINUATION_VARIANTS,
  });
  const variantGroupId = crypto.randomUUID();
  const results: SceneGenerationResult[] = [];
  let variantIndex = 0;
  for (const entry of variants.images) {
    const frameId = crypto.randomUUID();
    const target = sceneFramePath(userId, sceneId, frameId);
    await uploadToStorage(client, target, entry.image, "image/png");
    const { data: variantAsset, error: variantAssetError } = await client
      .from("assets")
      .insert({
        owner_id: userId,
        scene_id: sceneId,
        kind: "render",
        storage_path: target.path,
        metadata: {
          bucket: target.bucket,
          provider: variants.provider,
          character_id: characterId,
          pose_id: poseRecord?.id || null,
          prompt: scenePrompt,
          continuation: true,
          variant_index: variantIndex,
          variant_group_id: variantGroupId,
          source: "ai-image-pipeline",
        },
      })
      .select("id")
      .single();
    if (variantAssetError) {
      console.error("Failed to persist continuation asset", variantAssetError);
    }
    const insert: SceneFrameInsert = {
      id: frameId,
      owner_id: userId,
      scene_id: sceneId,
      frame_index: frameIndex,
      character_id: characterId,
      pose_id: poseRecord?.id || null,
      input_images: references,
      prompt_used: scenePrompt,
      output_image_url: `${target.bucket}/${target.path}`,
      variant_group_id: variantGroupId,
      variant_index: variantIndex,
      selected: variantIndex === 0,
      metadata: {
        provider: variants.provider,
        provider_metadata: entry.metadata || {},
        continuation: true,
        asset_id: variantAsset?.id || null,
      },
    };
    await client.from("scene_frames").insert(insert);
    const signed = await createSignedUrl(client, target);
    results.push({
      id: frameId,
      frame_index: frameIndex,
      output_image_url: insert.output_image_url,
      signed_url: signed,
      variant_group_id: variantGroupId,
      variant_index,
      selected: insert.selected,
    });
    variantIndex += 1;
  }
  return jsonResponse(201, {
    scene_id: sceneId,
    provider: variants.provider,
    variant_group_id: variantGroupId,
    frames: results,
  }, requestOrigin);
}

/**
 * Handle generation of character draft images for the wizard flow.
 * This generates a standalone character image based on archetype and tier.
 *
 * Model selection priority:
 * 1. Request body `model`
 * 2. Environment variable `AI_IMAGE_MODEL`
 * 3. Fallback by provider + detail/tier
 */
async function handleGenerateCharacterDraft(
  client: SupabaseClient,
  userId: string,
  body: any,
  requestOrigin?: string | null,
): Promise<Response> {
  const archetype = typeof body?.archetype === "string" ? body.archetype.trim() : "";
  const tier = typeof body?.tier === "string" ? body.tier.trim() : "standard";
  const requestedModel = typeof body?.model === "string" ? body.model.trim() : null;
  // Map tier to detail for model resolution
  const detail: "cheap" | "standard" | "pro" = tier === "premium" ? "pro" : "standard";

  if (!archetype) {
    return jsonResponse(400, { error: "archetype is required" }, requestOrigin);
  }

  // Resolve the model to use based on priority order
  let resolvedModel: ResolvedModel;
  try {
    resolvedModel = resolveModel({
      provider: AI_IMAGE_PROVIDER,
      requestedModel,
      envModel: AI_IMAGE_MODEL,
      detail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid model selection";
    return jsonResponse(400, { error: message }, requestOrigin);
  }

  // Check if Imagen 3 model is selected but Vertex AI is not enabled
  if (resolvedModel.provider === "google" && isImagen3Model(resolvedModel.model) && !isVertexAIEnabled()) {
    console.warn("[PROVIDER] Imagen 3 model requested but ENABLE_VERTEX_AI not enabled:", resolvedModel.model);
    return jsonResponse(501, {
      error: `Google Imagen 3 (Vertex AI) is disabled. Enable ENABLE_VERTEX_AI and configure service account auth to use ${resolvedModel.model}. Alternatively, select a Gemini 3 Pro Image model.`,
    }, requestOrigin);
    // TODO: When Vertex AI integration is complete, implement:
    // - Vertex AI endpoint: https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/{model}:predict
    // - Authentication: Service account with OAuth2 token or workload identity
    // - Request format: Vertex AI Imagen predict payload
  }

  // Build enriched prompt using the prompt enrichment system
  const prompt = composeInitialPrompt(archetype, tier);

  // DEBUG logging
  if (DEBUG) {
    console.log("[PROMPT] generate-character-draft:", {
      archetype,
      tier,
      detail,
      provider: resolvedModel.provider,
      model: resolvedModel.model,
      promptLength: prompt.length,
    });
    console.log("[PROMPT] Full prompt:", prompt);
  }

  // Generate character draft from text prompt using the resolved model
  // This creates a new character image without requiring a base reference image

  try {
    let imageBytes: Uint8Array;
    let providerName: string;
    let usedModel: string;
    let metadata: Record<string, unknown> = {};

    if (resolvedModel.provider === "google" && GOOGLE_API_KEY) {
      // Google Generative Language API: text-to-image generation
      // Gemini 3 Pro Image models use this endpoint directly with GOOGLE_API_KEY
      const payload = {
        contents: [{
          role: "user",
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          candidateCount: 1,
        },
      };
      const data = await googleImageRequest(resolvedModel.model, payload);
      const images = extractGoogleImages(data);
      if (images.length > 0) {
        imageBytes = images[0].image;
        providerName = "google";
        usedModel = resolvedModel.model;
        metadata = images[0].metadata || {};
      } else {
        // Check if Google returned an error in the response
        if (data?.error) {
          throw new Error(data.error.message ?? "Google API returned an error");
        }
        throw new Error("No image generated by Google - check model compatibility");
      }
    } else if (resolvedModel.provider === "openai" && OPENAI_API_KEY) {
      // OpenAI: text-to-image generation with resolved model
      // Map our model names to OpenAI API model names
      const openaiModelMap: Record<string, string> = {
        "dall-e-3": "dall-e-3",
        "gpt-image-1024": "gpt-image-1",
        "gpt-image-512": "gpt-image-1",
      };
      const apiModel = openaiModelMap[resolvedModel.model] || "dall-e-3";
      // Determine size based on model
      const sizeMap: Record<string, string> = {
        "dall-e-3": "1024x1024",
        "gpt-image-1024": "1024x1024",
        "gpt-image-512": "1024x1024", // DALL-E 3 min is 1024x1024
      };
      const size = sizeMap[resolvedModel.model] || "1024x1024";

      const requestBody = {
        model: apiModel,
        prompt: prompt,
        n: 1,
        size: size,
        response_format: "b64_json",
      };
      const data = await openAiImageRequest("https://api.openai.com/v1/images/generations", requestBody);
      const base64 = data?.data?.[0]?.b64_json;
      if (!base64) throw new Error("OpenAI did not return image");
      imageBytes = decodeBase64Image(base64);
      providerName = "openai";
      usedModel = resolvedModel.model;
    } else {
      // Fallback to placeholder when no AI provider is configured
      imageBytes = PLACEHOLDER_BYTES;
      providerName = "placeholder";
      usedModel = "placeholder";
      metadata = { note: "Using placeholder - no AI provider configured" };
    }

    // Generate a unique ID for this draft
    const draftId = crypto.randomUUID();

    // Store in character drafts folder
    const target: StoragePath = {
      bucket: REF_BUCKET,
      path: `character-drafts/${userId}/${draftId}.png`,
    };

    await uploadToStorage(client, target, imageBytes, "image/png");
    const signedUrl = await createSignedUrl(client, target);

    return jsonResponse(200, {
      draft_id: draftId,
      image_url: signedUrl,
      storage_path: `${target.bucket}/${target.path}`,
      provider: providerName,
      archetype,
      tier,
      metadata,
      // Meta block with resolved model and provider info
      meta: {
        provider: providerName,
        model: usedModel,
        detail,
        archetype,
        action: "generate-character" as const,
      },
    }, requestOrigin);
  } catch (error) {
    console.error("Character draft generation failed", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate character draft";
    return jsonResponse(500, { error: errorMessage }, requestOrigin);
  }
}

/**
 * Build a refined prompt by combining base archetype prompt with refinement parameters.
 * This appends modifier phrases based on the refine object values.
 */
/**
 * Build a list of modifier phrases from refinement parameters.
 * @param refine - Refinement parameters object
 * @returns Array of modifier phrases
 */
function buildRefineModifiers(refine: RefineParams): string[] {
  const modifiers: string[] = [];

  // Age modifier
  if (refine.age) {
    const ageModifiers: Record<string, string> = {
      "younger": "younger-looking, youthful features",
      "adult": "adult, mature features",
      "older": "older-looking, experienced appearance",
    };
    if (ageModifiers[refine.age]) {
      modifiers.push(ageModifiers[refine.age]);
    }
  }

  // Mood / Expression modifier
  if (refine.mood) {
    const moodModifiers: Record<string, string> = {
      "neutral": "with a neutral expression",
      "happy": "with a happy, joyful expression",
      "angry": "with an angry, fierce expression",
      "sad": "with a sad, melancholic expression",
    };
    if (moodModifiers[refine.mood]) {
      modifiers.push(moodModifiers[refine.mood]);
    }
  }

  // Hair length modifier
  if (refine.hairLength) {
    const hairModifiers: Record<string, string> = {
      "short": "short hair",
      "medium": "shoulder-length hair",
      "long": "long flowing hair",
    };
    if (hairModifiers[refine.hairLength]) {
      modifiers.push(hairModifiers[refine.hairLength]);
    }
  }

  // Eyebrow shape modifier
  if (refine.eyebrowShape) {
    const eyebrowModifiers: Record<string, string> = {
      "soft": "soft, gentle eyebrows",
      "sharp": "sharply angled eyebrows",
      "thick": "thick, prominent eyebrows",
      "thin": "thin, delicate eyebrows",
    };
    if (eyebrowModifiers[refine.eyebrowShape]) {
      modifiers.push(eyebrowModifiers[refine.eyebrowShape]);
    }
  }

  // Style modifier
  if (refine.style) {
    const styleModifiers: Record<string, string> = {
      "anime": "in an anime style",
      "realistic": "in a cinematic realistic style",
      "painterly": "in a painterly illustration style",
    };
    if (styleModifiers[refine.style]) {
      modifiers.push(styleModifiers[refine.style]);
    }
  }

  return modifiers;
}

function buildRefinePrompt(archetype: string, refine: RefineParams): string {
  // Use enriched archetype prompt
  const basePrompt = buildArchetypePrompt(archetype);
  const modifiers = buildRefineModifiers(refine);

  // Combine base prompt with modifiers
  let prompt = basePrompt;
  if (modifiers.length > 0) {
    prompt += " " + modifiers.join(", ") + ".";
  }

  return prompt;
}

/**
 * Get quality/resolution settings based on detail level.
 * Maps the detail parameter to AI provider settings.
 */
function getDetailSettings(detail: RefineParams["detail"]): DetailSettings {
  const settingsMap: Record<NonNullable<RefineParams["detail"]>, DetailSettings> = {
    "cheap": { size: "512x512", quality: "standard" },
    "standard": { size: "1024x1024", quality: "standard" },
    "pro": { size: "1792x1024", quality: "hd" },
  };
  return settingsMap[detail ?? "standard"];
}

/**
 * Map detail size to DALL-E 3 compatible size.
 * DALL-E 3 only supports specific sizes: 1024x1024, 1024x1792, 1792x1024
 */
function mapToDalleSize(size: ImageSize): "1024x1024" | "1024x1792" | "1792x1024" {
  const sizeMap: Record<ImageSize, "1024x1024" | "1024x1792" | "1792x1024"> = {
    "512x512": "1024x1024",
    "1024x1024": "1024x1024",
    "1792x1024": "1792x1024",
  };
  return sizeMap[size];
}

/**
 * Validate that a value is one of the allowed options.
 * Returns the value if valid, otherwise returns undefined.
 */
function validateEnumValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): T | undefined {
  if (typeof value === "string" && allowedValues.includes(value as T)) {
    return value as T;
  }
  return undefined;
}

/**
 * Handle character refinement based on UI slider values.
 * This generates a new refined image based on archetype and refinement parameters.
 *
 * Model selection priority:
 * 1. Request body `model`
 * 2. Environment variable `AI_IMAGE_MODEL`
 * 3. Fallback by provider + detail
 *
 * Request body:
 * {
 *   "action": "refine-character",
 *   "character_id": "uuid-or-null",
 *   "archetype": "hero",
 *   "base_image_url": "<existing-image-url>",
 *   "base_storage_path": "<existing-storage-path>",
 *   "tier": "standard",
 *   "model": "imagen-3.0-highres",  // Optional: explicit model override
 *   "refine": {
 *     "age": "younger" | "adult" | "older",
 *     "mood": "neutral" | "happy" | "angry" | "sad",
 *     "hairLength": "short" | "medium" | "long",
 *     "eyebrowShape": "soft" | "sharp" | "thick" | "thin",
 *     "style": "anime" | "realistic" | "painterly",
 *     "detail": "cheap" | "standard" | "pro"
 *   }
 * }
 */
async function handleRefineCharacter(
  client: SupabaseClient,
  userId: string,
  body: any,
  requestOrigin?: string | null,
): Promise<Response> {
  const archetype = typeof body?.archetype === "string" ? body.archetype.trim() : "";
  const tier = typeof body?.tier === "string" ? body.tier.trim() : "standard";
  const characterId = typeof body?.character_id === "string" ? body.character_id : null;
  const baseImageUrl = typeof body?.base_image_url === "string" ? body.base_image_url : null;
  const baseStoragePath = typeof body?.base_storage_path === "string" ? body.base_storage_path : null;
  const requestedModel = typeof body?.model === "string" ? body.model.trim() : null;

  // Parse refine object with validated enum values
  const refineInput = body?.refine && typeof body.refine === "object" ? body.refine : {};
  const refine: RefineParams = {
    age: validateEnumValue(refineInput.age, ["younger", "adult", "older"] as const),
    mood: validateEnumValue(refineInput.mood, ["neutral", "happy", "angry", "sad"] as const),
    hairLength: validateEnumValue(refineInput.hairLength, ["short", "medium", "long"] as const),
    eyebrowShape: validateEnumValue(refineInput.eyebrowShape, ["soft", "sharp", "thick", "thin"] as const),
    style: validateEnumValue(refineInput.style, ["anime", "realistic", "painterly"] as const),
    detail: validateEnumValue(refineInput.detail, ["cheap", "standard", "pro"] as const) ?? "standard",
  };

  if (!archetype) {
    return jsonResponse(400, { error: "archetype is required" }, requestOrigin);
  }

  // Resolve the model to use based on priority order
  let resolvedModel: ResolvedModel;
  try {
    resolvedModel = resolveModel({
      provider: AI_IMAGE_PROVIDER,
      requestedModel,
      envModel: AI_IMAGE_MODEL,
      detail: refine.detail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid model selection";
    return jsonResponse(400, { error: message }, requestOrigin);
  }

  // Check if Imagen 3 model is selected but Vertex AI is not enabled
  if (resolvedModel.provider === "google" && isImagen3Model(resolvedModel.model) && !isVertexAIEnabled()) {
    console.warn("[PROVIDER] Imagen 3 model requested but ENABLE_VERTEX_AI not enabled:", resolvedModel.model);
    return jsonResponse(501, {
      error: `Google Imagen 3 (Vertex AI) is disabled. Enable ENABLE_VERTEX_AI and configure service account auth to use ${resolvedModel.model}. Alternatively, select a Gemini 3 Pro Image model.`,
    }, requestOrigin);
    // TODO: When Vertex AI integration is complete, implement:
    // - Vertex AI endpoint: https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/{model}:predict
    // - Authentication: Service account with OAuth2 token or workload identity
    // - Request format: Vertex AI Imagen predict payload
  }

  // Build refine modifiers for the enriched prompt system
  const refineModifiers = buildRefineModifiers(refine);

  // Use the enriched refinement prompt composition
  const finalPrompt = composeRefinementPrompt(archetype, refineModifiers, tier);

  // Get quality settings based on detail level
  const detailSettings = getDetailSettings(refine.detail);

  // DEBUG logging
  if (DEBUG) {
    console.log("[PROMPT] refine-character:", {
      archetype,
      tier,
      detail: refine.detail,
      provider: resolvedModel.provider,
      model: resolvedModel.model,
      refineModifiers,
      promptLength: finalPrompt.length,
    });
    console.log("[PROMPT] Full prompt:", finalPrompt);
  }

  try {
    let imageBytes: Uint8Array;
    let providerName: string;
    let usedModel: string;
    let metadata: Record<string, unknown> = {};

    // TODO: If the AI provider supports image-to-image refinement (e.g., img2img),
    // we could pass the base_storage_path image as a reference. Currently,
    // Google Imagen and OpenAI DALL-E primarily support text-to-image for generation.
    // Image editing with DALL-E requires a mask, which doesn't fit this use case.
    // For now, we generate a new image based on the refined text prompt.
    //
    // When img2img or identity-locking features become available, this section
    // should be updated to:
    // 1. Download the base image from storage using base_storage_path
    // 2. Pass it to the provider's image editing/refinement endpoint
    // 3. Maintain character identity while applying refinements

    if (resolvedModel.provider === "google" && GOOGLE_API_KEY) {
      // Google Generative Language API: text-to-image generation with refined prompt
      // Gemini 3 Pro Image models use this endpoint directly with GOOGLE_API_KEY
      const payload = {
        contents: [{
          role: "user",
          parts: [{ text: finalPrompt }],
        }],
        generationConfig: {
          candidateCount: 1,
        },
      };
      const data = await googleImageRequest(resolvedModel.model, payload);
      const images = extractGoogleImages(data);
      if (images.length > 0) {
        imageBytes = images[0].image;
        providerName = "google";
        usedModel = resolvedModel.model;
        metadata = images[0].metadata || {};
      } else {
        // Check if Google returned an error in the response
        if (data?.error) {
          throw new Error(data.error.message ?? "Google API returned an error");
        }
        throw new Error("No image generated by Google - check model compatibility");
      }
    } else if (resolvedModel.provider === "openai" && OPENAI_API_KEY) {
      // OpenAI: text-to-image generation with resolved model
      const openaiModelMap: Record<string, string> = {
        "dall-e-3": "dall-e-3",
        "gpt-image-1024": "gpt-image-1",
        "gpt-image-512": "gpt-image-1",
      };
      const apiModel = openaiModelMap[resolvedModel.model] || "dall-e-3";
      const dalleSize = mapToDalleSize(detailSettings.size);
      const requestBody = {
        model: apiModel,
        prompt: finalPrompt,
        n: 1,
        size: dalleSize,
        quality: detailSettings.quality,
        response_format: "b64_json",
      };
      const data = await openAiImageRequest("https://api.openai.com/v1/images/generations", requestBody);
      const base64 = data?.data?.[0]?.b64_json;
      if (!base64) throw new Error("OpenAI did not return image");
      imageBytes = decodeBase64Image(base64);
      providerName = "openai";
      usedModel = resolvedModel.model;
    } else {
      // Fallback to placeholder when no AI provider is configured
      imageBytes = PLACEHOLDER_BYTES;
      providerName = "placeholder";
      usedModel = "placeholder";
      metadata = { note: "Using placeholder - no AI provider configured" };
    }

    // Generate a unique ID for this refined draft
    const draftId = crypto.randomUUID();
    const timestamp = Date.now();

    // Store in character drafts folder with refine suffix
    // Path format: story-refs/character-drafts/{userId}/{draftId}-refine-{timestamp}.png
    const target: StoragePath = {
      bucket: REF_BUCKET,
      path: `character-drafts/${userId}/${draftId}-refine-${timestamp}.png`,
    };

    await uploadToStorage(client, target, imageBytes, "image/png");
    const signedUrl = await createSignedUrl(client, target);

    return jsonResponse(200, {
      draft_id: draftId,
      variant_id: `${draftId}-refine-${timestamp}`,
      image_url: signedUrl,
      storage_path: `${target.bucket}/${target.path}`,
      provider: providerName,
      archetype,
      tier,
      refine,
      character_id: characterId,
      base_image_url: baseImageUrl,
      base_storage_path: baseStoragePath,
      prompt_used: finalPrompt,
      metadata,
      // Meta block with resolved model and provider info
      meta: {
        provider: providerName,
        model: usedModel,
        detail: refine.detail,
        archetype,
        action: "refine-character" as const,
      },
    }, requestOrigin);
  } catch (error) {
    console.error("Character refinement failed", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to refine character";
    return jsonResponse(500, { error: errorMessage }, requestOrigin);
  }
}

serve(async req => {
  // Extract origin for CORS headers
  const requestOrigin = req.headers.get("Origin");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(requestOrigin),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, requestOrigin);
  }

  // ============================================================================
  // Authentication Diagnostics Block
  // ============================================================================
  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("apikey") ?? req.headers.get("x-api-key");
  const clientInfoHeader = req.headers.get("x-client-info");
  // X-Client-Auth is the preferred way for the frontend to pass the user JWT
  // This allows the Supabase client to keep Authorization: Bearer <anon-key> for gateway access
  const xClientAuth = req.headers.get("X-Client-Auth") ?? req.headers.get("x-client-auth");

  // Log header presence (no values to avoid leaking secrets)
  console.log("[AUTH] has Authorization:", !!authHeader, "has apikey:", !!apiKeyHeader, "has X-Client-Auth:", !!xClientAuth, "has x-client-info:", !!clientInfoHeader);

  // Extract user token: Prefer X-Client-Auth, fall back to Authorization if it's a JWT
  let userToken = (xClientAuth ?? "").trim();
  if (!userToken) {
    // Fall back to Authorization header if it contains a user JWT (starts with "ey")
    const bearerToken = extractBearerToken(authHeader);
    if (bearerToken && bearerToken.startsWith("ey")) {
      userToken = bearerToken;
    }
  }

  if (!userToken) {
    console.warn("[AUTH] No user token found (need X-Client-Auth or Authorization: Bearer <jwt>)");
    return jsonResponse(401, { 
      error: "Unauthorized", 
      reason: "missing access token - provide X-Client-Auth header or Authorization: Bearer <jwt>" 
    }, requestOrigin);
  }

  // Alias for backward compatibility with downstream code
  const accessToken = userToken;

  // Decode and log non-sensitive JWT claims for diagnostics
  const claims = safeDecodeJwt(accessToken);
  
  // Log compact claimsInfo for debugging (per acceptance criteria)
  const claimsInfo = buildClaimsInfo(claims);
  console.log("[AUTH] claimsInfo:", JSON.stringify(claimsInfo));
  
  if (claims) {
    // Basic JWT payload logging (sub, exp) to aid debugging per acceptance criteria
    console.log("[AUTH] JWT payload - sub:", maskIdentifier(claims.sub, 8), "exp:", claims.exp, "role:", claims.role);
    
    // Detect if token is anon/public key vs user JWT
    const anonCheck = detectAnonOrPublicKey(claims);
    if (anonCheck.isAnon) {
      console.warn("[AUTH] Anon/public key detected:", anonCheck.reason);
      return jsonResponse(401, { 
        error: "Unauthorized", 
        reason: anonCheck.reason 
      }, requestOrigin);
    }

    // Compare issuer to expected Supabase auth issuer
    const expectedIssuer = `${SUPABASE_URL}/auth/v1`;
    if (claims.iss && claims.iss !== expectedIssuer) {
      console.warn("[AUTH] Issuer mismatch! Got:", claims.iss, "Expected:", expectedIssuer);
      return jsonResponse(401, { 
        error: "Unauthorized", 
        reason: "issuer mismatch",
        details: {
          got: claims.iss,
          expected: expectedIssuer,
        }
      }, requestOrigin);
    }

    // Check if token is expired - return 401 early if expired with exp/now details
    if (claims.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp < now) {
        console.warn("[AUTH] Token expired. exp:", claims.exp, "now:", now, "diff:", now - claims.exp);
        return jsonResponse(401, { 
          error: "Unauthorized", 
          reason: "token expired",
          details: {
            exp: claims.exp,
            now: now,
            expiredSecondsAgo: now - claims.exp,
          }
        }, requestOrigin);
      }
    }

    // Log role for debugging - accept authenticated role tokens
    if (claims.role && claims.role !== "authenticated") {
      console.log("[AUTH] Token role is:", claims.role, "(expected: authenticated)");
    }
  } else {
    console.warn("[AUTH] Could not decode JWT claims - token may be malformed");
    return jsonResponse(401, { 
      error: "Unauthorized", 
      reason: "malformed token - could not decode JWT claims" 
    }, requestOrigin);
  }

  // Verify token with Supabase Auth
  // Using service role key to verify user tokens - this accepts any valid user JWT
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  
  if (error || !user) {
    // Pass through the supabase.auth.getUser error message (per acceptance criteria)
    const errorMessage = error?.message || "invalid or expired token";
    console.log("[AUTH] supabase.auth.getUser failed:", errorMessage);
    return jsonResponse(401, { 
      error: "Unauthorized", 
      reason: errorMessage 
    }, requestOrigin);
  }

  // Only log masked user.id when DEBUG mode is enabled for privacy
  if (DEBUG) {
    console.log("[AUTH] User authenticated successfully, user.id:", maskIdentifier(user.id, 8));
  } else {
    console.log("[AUTH] User authenticated successfully");
  }
  // ============================================================================
  // End Authentication Diagnostics Block
  // ============================================================================

  let body: any = null;
  try {
    body = await req.json();
  } catch (_err) {
    return jsonResponse(400, { error: "Invalid JSON payload" }, requestOrigin);
  }
  const url = new URL(req.url);
  const requestedAction = url.searchParams.get("action") || (typeof body?.action === "string" ? body.action : null);
  const action = requestedAction && typeof requestedAction === "string" && requestedAction.trim()
    ? requestedAction.trim()
    : "generate-poses";
  try {
    if (action === "generate-character-draft") {
      return await handleGenerateCharacterDraft(supabase, user.id, body, requestOrigin);
    }
    if (action === "refine-character") {
      return await handleRefineCharacter(supabase, user.id, body, requestOrigin);
    }
    if (action === "upload-base") {
      return await handleUploadBase(supabase, user.id, body, requestOrigin);
    }
    if (action === "generate-poses") {
      return await handleGeneratePoses(supabase, user.id, body, requestOrigin);
    }
    if (action === "generate-scene") {
      return await handleSceneGeneration(supabase, user.id, body, requestOrigin);
    }
    if (action === "continue-scene") {
      return await handleSceneContinuation(supabase, user.id, body, requestOrigin);
    }
    return jsonResponse(400, { error: "Unknown action" }, requestOrigin);
  } catch (err) {
    console.error("AI pipeline error", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse(500, { error: message }, requestOrigin);
  }
});
