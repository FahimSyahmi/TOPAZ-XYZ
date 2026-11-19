import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;
const REPLICATE_API = "https://api.replicate.com/v1";
const DEFAULT_MODEL = "bytedance/video-upscaler";
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.REPLICATE_API_TOKEN) });
}

function publicVideoUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Select a video or enter a public video URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("The model requires a public HTTPS video URL.");
  }
  return url.href;
}

function targetResolution(width: number, height: number, scale: 2 | 4) {
  const wantedLongEdge = Math.max(width, height) * scale;
  if (wantedLongEdge <= 720) return "720p";
  if (wantedLongEdge <= 1080) return "1080p";
  if (wantedLongEdge <= 2560) return "2k";
  return "4k";
}

async function parseReplicateError(response: Response) {
  const message = await response.text();
  try {
    const data = JSON.parse(message) as { detail?: string; title?: string; error?: string };
    return data.detail || data.error || data.title || `Replicate returned HTTP ${response.status}.`;
  } catch { return `Replicate returned HTTP ${response.status}.`; }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in before using AI upscaling." }, { status: 401 });
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return NextResponse.json({ error: "AI upscaling needs a server-side Replicate API key. Add REPLICATE_API_TOKEN to .env.local and restart the app.", code: "missing_api_key" }, { status: 503 });

  try {
    let videoUrl: string;
    let scaleFactor: 2 | 4;
    let targetFps: 30 | 60;
    let sourceWidth = 1080;
    let sourceHeight = 1920;
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const body = await request.json();
      videoUrl = publicVideoUrl(body?.videoUrl);
      scaleFactor = body?.scaleFactor === 4 ? 4 : 2;
      targetFps = body?.targetFps === 30 ? 30 : 60;
      sourceWidth = Number.isFinite(body?.sourceWidth) ? Math.max(1, Math.min(7680, body.sourceWidth)) : sourceWidth;
      sourceHeight = Number.isFinite(body?.sourceHeight) ? Math.max(1, Math.min(7680, body.sourceHeight)) : sourceHeight;
    } else {
      const form = await request.formData();
      const file = form.get("video");
      if (!(file instanceof File)) return NextResponse.json({ error: "Attach an MP4 or MOV video." }, { status: 400 });
      if (file.size === 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Replicate upload supports video files up to 100 MB in this app." }, { status: 413 });
      const extension = file.name.toLowerCase().split(".").pop();
      if (!(extension === "mp4" || extension === "mov")) return NextResponse.json({ error: "Only MP4 and MOV videos are supported by this mode." }, { status: 415 });
      scaleFactor = form.get("scaleFactor") === "4" ? 4 : 2;
      targetFps = form.get("targetFps") === "30" ? 30 : 60;
      sourceWidth = Number(form.get("sourceWidth")) || sourceWidth;
      sourceHeight = Number(form.get("sourceHeight")) || sourceHeight;

      const uploadForm = new FormData();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      uploadForm.append("content", file, safeName);
      const uploadResponse = await fetch(`${REPLICATE_API}/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: uploadForm, signal: AbortSignal.timeout(120_000) });
      if (!uploadResponse.ok) return NextResponse.json({ error: await parseReplicateError(uploadResponse) }, { status: uploadResponse.status });
      const uploaded = await uploadResponse.json() as { urls?: { get?: string }; url?: string };
      videoUrl = publicVideoUrl(uploaded.urls?.get || uploaded.url);
    }

    const model = process.env.REPLICATE_MODEL_VERSION?.trim() || DEFAULT_MODEL;
    if (!/^[a-z0-9_-]+\/[a-z0-9_-]+(?::[a-f0-9]{32,64})?$/i.test(model) && !/^[a-f0-9]{32,64}$/i.test(model)) {
      throw new Error("REPLICATE_MODEL_VERSION must be owner/name, owner/name:version-hash, or a version hash.");
    }
    const resolution = targetResolution(sourceWidth, sourceHeight, scaleFactor);
    const input = { video: videoUrl, target_resolution: resolution, target_fps: targetFps, processing_type: "standard", scene: "ugc" };
    const versionModel = /^[a-z0-9_-]+\/[a-z0-9_-]+:[a-f0-9]{32,64}$/i.test(model);
    const versionId = /^[a-f0-9]{32,64}$/i.test(model);
    const endpoint = versionModel || versionId ? `${REPLICATE_API}/predictions` : `${REPLICATE_API}/models/${model.split("/").map(encodeURIComponent).join("/")}/predictions`;
    const payload = versionModel || versionId ? { version: versionModel ? model.split(":")[1] : model, input } : { input };
    const predictionResponse = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=1" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
    if (!predictionResponse.ok) return NextResponse.json({ error: await parseReplicateError(predictionResponse) }, { status: predictionResponse.status });
    const prediction = await predictionResponse.json() as { id?: string; status?: string };
    if (!prediction.id) throw new Error("Replicate did not return a prediction ID.");
    await prisma.aiPrediction.create({ data: { id: prediction.id, userId: session.user.id } });
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status || "starting", targetResolution: resolution }, { status: 202 });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Could not start AI upscaling.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
