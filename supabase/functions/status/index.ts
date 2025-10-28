// Supabase Edge Function: check generation status
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function extractJobId(req: Request, body: any): string {
  if (body?.job_id) return String(body.job_id);
  if (body?.jobId) return String(body.jobId);
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

serve(async req => {
  if (req.method !== "POST" && req.method !== "GET") {
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

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const jobId = extractJobId(req, body);
  if (!jobId) {
    return jsonResponse(400, { error: "Missing job id" });
  }

  const { data: job, error: jobError } = await supabase
    .from("image_generations")
    .select("id, owner_id, scene_id, status, error, storage_path, asset_id, provider, metadata, created_at, updated_at")
    .eq("id", jobId)
    .single();
  if (jobError || !job) {
    return jsonResponse(404, { error: "Job not found" });
  }
  if (job.owner_id !== user.id) {
    return jsonResponse(403, { error: "Forbidden" });
  }

  let asset: Record<string, unknown> | null = null;
  if (job.asset_id) {
    const { data: assetData } = await supabase
      .from("assets")
      .select("id, scene_id, kind, storage_path, metadata, created_at")
      .eq("id", job.asset_id)
      .single();
    asset = assetData ?? null;
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id, scene_id, kind, storage_path, metadata, created_at")
    .eq("scene_id", job.scene_id)
    .order("created_at", { ascending: false })
    .limit(30);

  return jsonResponse(200, {
    job_id: job.id,
    scene_id: job.scene_id,
    status: job.status,
    error: job.error,
    provider: job.provider,
    asset,
    assets: assets ?? [],
    metadata: job.metadata ?? {},
    created_at: job.created_at,
    updated_at: job.updated_at,
  });
});
