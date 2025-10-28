// Supabase Edge Function: generate storyboard image
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REF_BUCKET = "story-refs";
const RENDER_BUCKET = "story-renders";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const STABILITY_API_KEY = Deno.env.get("STABILITY_API_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

type GenerationPayload = {
  scene_id: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  provider?: string;
  reference_asset_id?: string;
  mask_asset_id?: string;
};

type DownloadedAsset = {
  id: string;
  bucket: string;
  path: string;
  contentType: string;
  data: Uint8Array;
  metadata: Record<string, any> | null;
};

type ProviderResult = {
  image: Uint8Array;
  mimeType: string;
  provider: string;
  seed?: number;
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function decodeBase64Image(input: string): Uint8Array {
  const clean = input.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function downloadAsset(
  client: ReturnType<typeof createClient>,
  assetId: string,
  ownerId: string,
): Promise<DownloadedAsset> {
  const { data: asset, error } = await client
    .from("assets")
    .select("id, owner_id, storage_path, metadata, kind")
    .eq("id", assetId)
    .single();
  if (error || !asset) {
    throw new Error("Reference asset not found");
  }
  if (asset.owner_id !== ownerId) {
    throw new Error("Not authorized to access reference asset");
  }
  const bucket = asset.metadata?.bucket || (asset.kind === "render" ? RENDER_BUCKET : REF_BUCKET);
  const { data: file, error: downloadError } = await client.storage
    .from(bucket)
    .download(asset.storage_path);
  if (downloadError || !file) {
    throw new Error("Unable to download reference asset");
  }
  const arrayBuffer = await file.arrayBuffer();
  return {
    id: asset.id,
    bucket,
    path: asset.storage_path,
    contentType: file.type || "image/png",
    data: new Uint8Array(arrayBuffer),
    metadata: asset.metadata ?? {},
  };
}

function combinePrompt(prompt: string, negative?: string) {
  if (!negative) return prompt;
  return `${prompt}\nNegative prompt: ${negative}`;
}

async function openaiAdapter(options: {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  reference?: DownloadedAsset | null;
  mask?: DownloadedAsset | null;
}): Promise<ProviderResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }
  const size = `${options.width ?? 1024}x${options.height ?? 1024}`;
  const prompt = combinePrompt(options.prompt, options.negative);
  if (options.reference || options.mask) {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("n", "1");
    form.append("response_format", "b64_json");
    if (options.reference) {
      const blob = new Blob([options.reference.data], { type: options.reference.contentType });
      form.append("image", blob, "reference.png");
    }
    if (options.mask) {
      const blob = new Blob([options.mask.data], { type: options.mask.contentType });
      form.append("mask", blob, "mask.png");
    }
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || response.statusText;
      throw new Error(`OpenAI image edit failed: ${message}`);
    }
    const base64 = data?.data?.[0]?.b64_json;
    if (!base64) {
      throw new Error("OpenAI did not return image data");
    }
    return {
      image: decodeBase64Image(base64),
      mimeType: "image/png",
      provider: "openai",
      seed: options.seed,
    };
  }
  const payload = {
    model: "gpt-image-1",
    prompt,
    size,
    response_format: "b64_json",
    n: 1,
  };
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`OpenAI generation failed: ${message}`);
  }
  const base64 = data?.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenAI did not return image data");
  }
  return {
    image: decodeBase64Image(base64),
    mimeType: "image/png",
    provider: "openai",
    seed: options.seed,
  };
}

async function stabilityAdapter(options: {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  reference?: DownloadedAsset | null;
  mask?: DownloadedAsset | null;
}): Promise<ProviderResult> {
  if (!STABILITY_API_KEY) {
    throw new Error("Stability API key not configured");
  }
  const model = "stable-diffusion-xl-1024-v1-0";
  const baseUrl = `https://api.stability.ai/v1/generation/${model}`;
  const prompt = options.prompt;
  const negative = options.negative;
  const prompts = [{ text: prompt, weight: 1 }];
  if (negative) {
    prompts.push({ text: negative, weight: -1 });
  }
  const body: Record<string, unknown> = {
    text_prompts: prompts,
    cfg_scale: options.guidance ?? 7,
    height: options.height ?? 1024,
    width: options.width ?? 1024,
    samples: 1,
    steps: options.steps ?? 30,
  };
  if (typeof options.seed === "number" && options.seed > 0) {
    body.seed = options.seed;
  }
  let endpoint = `${baseUrl}/text-to-image`;
  if (options.reference) {
    endpoint = `${baseUrl}/image-to-image`;
    body.init_image_mode = "IMAGE_STRENGTH";
    body.image_strength = 0.65;
    body.init_image = encodeBase64(options.reference.data);
    if (options.mask) {
      body.mask_image = encodeBase64(options.mask.data);
    }
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${STABILITY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.message || data?.errors?.[0] || response.statusText;
    throw new Error(`Stability generation failed: ${message}`);
  }
  const artifact = data?.artifacts?.[0];
  if (!artifact?.base64) {
    throw new Error("Stability did not return image data");
  }
  return {
    image: decodeBase64Image(artifact.base64),
    mimeType: "image/png",
    provider: "stability",
    seed: artifact?.seed ?? options.seed,
  };
}

async function openrouterAdapter(options: {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
}): Promise<ProviderResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key not configured");
  }
  const payload = {
    model: "stable-diffusion-xl",
    prompt: options.prompt,
    negative_prompt: options.negative || undefined,
    width: options.width ?? 1024,
    height: options.height ?? 1024,
    steps: options.steps ?? 30,
    cfg_scale: options.guidance ?? 7,
    seed: options.seed && options.seed > 0 ? options.seed : undefined,
    response_format: "b64_json",
  };
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error || response.statusText;
    throw new Error(`OpenRouter generation failed: ${message}`);
  }
  const base64 = data?.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenRouter did not return image data");
  }
  return {
    image: decodeBase64Image(base64),
    mimeType: "image/png",
    provider: "openrouter",
    seed: data?.data?.[0]?.seed ?? options.seed,
  };
}

function resolveProvider(requested: string | undefined): string {
  const preferred = (requested || "auto").toLowerCase();
  if (preferred === "openai" && OPENAI_API_KEY) return "openai";
  if (preferred === "stability" && STABILITY_API_KEY) return "stability";
  if (preferred === "openrouter" && OPENROUTER_API_KEY) return "openrouter";
  if (OPENAI_API_KEY) return "openai";
  if (STABILITY_API_KEY) return "stability";
  if (OPENROUTER_API_KEY) return "openrouter";
  throw new Error("No image provider configured");
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
    error: userError,
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const body = (await req.json().catch(() => null)) as GenerationPayload | null;
  if (!body || !body.scene_id || !body.prompt) {
    return jsonResponse(400, { error: "Invalid payload" });
  }
  const sceneId = body.scene_id;
  const prompt = body.prompt;
  const negative = body.negative_prompt || "";
  const width = body.width && body.width > 0 ? body.width : 1024;
  const height = body.height && body.height > 0 ? body.height : 1024;
  const steps = body.steps && body.steps > 0 ? body.steps : 30;
  const guidance = body.guidance && body.guidance > 0 ? body.guidance : 7;
  const seed = typeof body.seed === "number" ? body.seed : undefined;

  let jobRecord: any = null;
  let referenceAsset: DownloadedAsset | null = null;
  let maskAsset: DownloadedAsset | null = null;
  try {
    if (body.reference_asset_id) {
      referenceAsset = await downloadAsset(supabase, body.reference_asset_id, user.id);
    }
    if (body.mask_asset_id) {
      maskAsset = await downloadAsset(supabase, body.mask_asset_id, user.id);
    }

    const provider = resolveProvider(body.provider);
    const { data: insertedJob, error: insertJobError } = await supabase
      .from("image_generations")
      .insert({
        owner_id: user.id,
        scene_id: sceneId,
        provider,
        prompt,
        negative_prompt: negative,
        width,
        height,
        steps,
        guidance,
        seed,
        status: "processing",
        metadata: {
          requested_provider: body.provider || "auto",
          reference_asset_id: referenceAsset?.id || body.reference_asset_id || null,
          mask_asset_id: maskAsset?.id || body.mask_asset_id || null,
        },
      })
      .select()
      .single();
    if (insertJobError || !insertedJob) {
      throw insertJobError || new Error("Unable to create job record");
    }
    jobRecord = insertedJob;

    let result: ProviderResult;
    if (provider === "openai") {
      result = await openaiAdapter({
        prompt,
        negative,
        width,
        height,
        steps,
        seed,
        reference: referenceAsset,
        mask: maskAsset,
      });
    } else if (provider === "stability") {
      result = await stabilityAdapter({
        prompt,
        negative,
        width,
        height,
        steps,
        guidance,
        seed,
        reference: referenceAsset,
        mask: maskAsset,
      });
    } else {
      result = await openrouterAdapter({
        prompt,
        negative,
        width,
        height,
        steps,
        guidance,
        seed,
      });
    }

    const filePath = `${user.id}/${sceneId}/${jobRecord.id}.png`;
    const upload = await supabase.storage
      .from(RENDER_BUCKET)
      .upload(filePath, new Blob([result.image], { type: result.mimeType || "image/png" }), {
        upsert: true,
        contentType: result.mimeType || "image/png",
      });
    if (upload.error) {
      throw upload.error;
    }

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({
        owner_id: user.id,
        scene_id: sceneId,
        kind: "render",
        storage_path: filePath,
        metadata: {
          bucket: RENDER_BUCKET,
          provider: result.provider,
          prompt,
          negative_prompt: negative,
          width,
          height,
          steps,
          guidance,
          seed: result.seed ?? seed ?? null,
          job_id: jobRecord.id,
          completed_at: new Date().toISOString(),
          reference_asset_id: referenceAsset?.id || null,
          mask_asset_id: maskAsset?.id || null,
        },
      })
      .select()
      .single();
    if (assetError || !asset) {
      throw assetError || new Error("Failed to persist render asset");
    }

    await supabase
      .from("image_generations")
      .update({
        status: "succeeded",
        provider: result.provider,
        storage_path: filePath,
        asset_id: asset.id,
        metadata: {
          ...(jobRecord.metadata || {}),
          completed_at: new Date().toISOString(),
          provider: result.provider,
        },
      })
      .eq("id", jobRecord.id);

    return jsonResponse(201, { job_id: jobRecord.id, status: "succeeded" });
  } catch (error) {
    console.error("Storyboard generation error", error);
    if (jobRecord) {
      await supabase
        .from("image_generations")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", jobRecord.id);
    }
    const message = error instanceof Error ? error.message : "Generation failed";
    return jsonResponse(500, { error: message });
  }
});
