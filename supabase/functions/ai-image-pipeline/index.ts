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
const GOOGLE_IMAGE_MODEL = Deno.env.get("GOOGLE_IMAGE_MODEL") ?? "google-nano-banan";
const GOOGLE_IMAGE_ENDPOINT =
  Deno.env.get("GOOGLE_IMAGE_ENDPOINT")
  ?? `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_IMAGE_MODEL}:generateContent`;
const AI_IMAGE_PROVIDER = (Deno.env.get("AI_IMAGE_PROVIDER") ?? "openai").toLowerCase();

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

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

async function googleImageRequest(body: Record<string, unknown>) {
  if (!GOOGLE_API_KEY) {
    throw new Error("Google API key not configured");
  }
  const response = await fetch(`${GOOGLE_IMAGE_ENDPOINT}?key=${GOOGLE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
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
      const data = await googleImageRequest(payload);
      const [image] = extractGoogleImages(data);
      if (!image) throw new Error("Google did not return pose image");
      let bytes = image.image;
      if (options?.transparent) {
        bytes = await ensureTransparent(bytes);
      }
      return { image: bytes, provider: this.name, metadata: { prompt, provider_metadata: image.metadata || {} } };
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
      const data = await googleImageRequest(payload);
      const [image] = extractGoogleImages(data);
      if (!image) throw new Error("Google did not return scene image");
      let bytes = image.image;
      if (options?.transparent) {
        bytes = await ensureTransparent(bytes);
      }
      return {
        image: bytes,
        provider: this.name,
        metadata: { prompt, references, provider_metadata: image.metadata || {} },
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
      const data = await googleImageRequest(payload);
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
  if (AI_IMAGE_PROVIDER === "google" && GOOGLE_API_KEY) {
    return new GoogleImageProvider();
  }
  if (AI_IMAGE_PROVIDER === "openai" && OPENAI_API_KEY) {
    return new OpenAIImageProvider();
  }
  if (AI_IMAGE_PROVIDER === "auto") {
    if (GOOGLE_API_KEY) return new GoogleImageProvider();
    if (OPENAI_API_KEY) return new OpenAIImageProvider();
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
): Promise<Response> {
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const imageInput = typeof body?.image === "string" ? body.image : "";
  if (!characterId || !imageInput) {
    return jsonResponse(400, { error: "character_id and image are required" });
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
    });
  } catch (error) {
    console.error("Upload base image failed", error);
    return jsonResponse(500, { error: "Failed to process base image" });
  }
}

async function handleGeneratePoses(
  client: SupabaseClient,
  userId: string,
  body: any,
): Promise<Response> {
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const poseInputs = Array.isArray(body?.poses) ? body.poses : [];
  if (!characterId || !poseInputs.length) {
    return jsonResponse(400, { error: "character_id and poses[] are required" });
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
    return jsonResponse(400, { error: "No valid poses provided" });
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
    return jsonResponse(500, { error: "Unable to generate poses" });
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
    return jsonResponse(500, { error: "Failed to save pose records" });
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
  });
}

async function handleSceneGeneration(
  client: SupabaseClient,
  userId: string,
  body: any,
): Promise<Response> {
  const sceneId = typeof body?.scene_id === "string" ? body.scene_id : "";
  const frameIndex = typeof body?.frame_index === "number" ? Math.max(1, Math.floor(body.frame_index)) : 1;
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const poseId = typeof body?.pose_id === "string" ? body.pose_id : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!sceneId || !characterId || !prompt) {
    return jsonResponse(400, { error: "scene_id, character_id, and prompt are required" });
  }
  const scene = await ensureScene(client, userId, sceneId);
  const character = await ensureCharacter(client, userId, characterId);
  const baseStorage = parseStoragePath(character.base_image_url);
  if (!baseStorage) {
    return jsonResponse(400, { error: "Character base image not found" });
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
    return jsonResponse(500, { error: "Failed to save scene frame" });
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
  });
}

async function handleSceneContinuation(
  client: SupabaseClient,
  userId: string,
  body: any,
): Promise<Response> {
  const sceneId = typeof body?.scene_id === "string" ? body.scene_id : "";
  const frameIndex = typeof body?.frame_index === "number" ? Math.max(1, Math.floor(body.frame_index)) : 1;
  const characterId = typeof body?.character_id === "string" ? body.character_id : "";
  const poseId = typeof body?.pose_id === "string" ? body.pose_id : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!sceneId || !characterId || !prompt) {
    return jsonResponse(400, { error: "scene_id, character_id, and prompt are required" });
  }
  await ensureScene(client, userId, sceneId);
  const character = await ensureCharacter(client, userId, characterId);
  const baseStorage = parseStoragePath(character.base_image_url);
  if (!baseStorage) {
    return jsonResponse(400, { error: "Character base image not found" });
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
  });
}

/**
 * Handle generation of character draft images for the wizard flow.
 * This generates a standalone character image based on archetype and tier.
 */
async function handleGenerateCharacterDraft(
  client: SupabaseClient,
  userId: string,
  body: any,
): Promise<Response> {
  const archetype = typeof body?.archetype === "string" ? body.archetype.trim() : "";
  const tier = typeof body?.tier === "string" ? body.tier.trim() : "standard";
  
  if (!archetype) {
    return jsonResponse(400, { error: "archetype is required" });
  }

  // Build a prompt based on the archetype
  const archetypePrompts: Record<string, string> = {
    "hero": "A heroic character with a confident stance, noble appearance, and strong presence. Full body character design.",
    "villain": "A menacing villain character with dramatic features and an imposing presence. Full body character design.",
    "sci-fi": "A futuristic sci-fi character with sleek technological elements and modern styling. Full body character design.",
    "fantasy": "A fantasy character with mystical or medieval elements, magical aura. Full body character design.",
    "child": "A young child character with innocent features and playful energy. Full body character design.",
    "robot": "A robotic character with mechanical features and technological design. Full body character design.",
  };

  const basePrompt = archetypePrompts[archetype] || `A ${archetype} character. Full body character design.`;
  
  // Adjust prompt based on tier
  let prompt = basePrompt;
  if (tier === "premium") {
    prompt += " Highly detailed, cinematic quality, professional character art.";
  } else {
    prompt += " Clean character design, clear silhouette.";
  }

  const provider = resolveProvider();
  
  // For character drafts, we generate from scratch without a base image
  // We'll use a simple approach: generate using the text prompt alone
  // Note: This is a simplified implementation. In production, you might want
  // to use a different approach or provider method specifically for text-to-image.
  
  try {
    // Since we don't have a dedicated text-to-image method in the provider interface,
    // we'll use a placeholder approach and delegate to the configured AI provider
    // In a real implementation, you'd extend the ImageProvider interface
    
    let imageBytes: Uint8Array;
    let providerName: string;
    let metadata: Record<string, unknown> = {};

    if (AI_IMAGE_PROVIDER === "google" && GOOGLE_API_KEY) {
      // Use Google's text-to-image capability
      const payload = {
        contents: [{
          role: "user",
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          candidateCount: 1,
        },
      };
      const data = await googleImageRequest(payload);
      const images = extractGoogleImages(data);
      if (images.length > 0) {
        imageBytes = images[0].image;
        providerName = "google";
        metadata = images[0].metadata || {};
      } else {
        throw new Error("No image generated by Google");
      }
    } else if (AI_IMAGE_PROVIDER === "openai" && OPENAI_API_KEY) {
      // Use OpenAI's DALL-E for text-to-image
      const requestBody = {
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      };
      const data = await openAiImageRequest("https://api.openai.com/v1/images/generations", requestBody);
      const base64 = data?.data?.[0]?.b64_json;
      if (!base64) throw new Error("OpenAI did not return image");
      imageBytes = decodeBase64Image(base64);
      providerName = "openai";
    } else {
      // Fallback to placeholder
      imageBytes = PLACEHOLDER_BYTES;
      providerName = "placeholder";
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
    });
  } catch (error) {
    console.error("Character draft generation failed", error);
    return jsonResponse(500, { error: "Failed to generate character draft" });
  }
}

serve(async req => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Missing access token" });
  }
  const accessToken = authHeader.replace("Bearer ", "").trim();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }
  let body: any = null;
  try {
    body = await req.json();
  } catch (_err) {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }
  const url = new URL(req.url);
  const requestedAction = url.searchParams.get("action") || (typeof body?.action === "string" ? body.action : null);
  const action = requestedAction && typeof requestedAction === "string" && requestedAction.trim()
    ? requestedAction.trim()
    : "generate-poses";
  try {
    if (action === "generate-character-draft") {
      return await handleGenerateCharacterDraft(supabase, user.id, body);
    }
    if (action === "upload-base") {
      return await handleUploadBase(supabase, user.id, body);
    }
    if (action === "generate-poses") {
      return await handleGeneratePoses(supabase, user.id, body);
    }
    if (action === "generate-scene") {
      return await handleSceneGeneration(supabase, user.id, body);
    }
    if (action === "continue-scene") {
      return await handleSceneContinuation(supabase, user.id, body);
    }
    return jsonResponse(400, { error: "Unknown action" });
  } catch (err) {
    console.error("AI pipeline error", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse(500, { error: message });
  }
});
