import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

function isReplicateDelivery(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"));
  } catch { return false; }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to download this video." }, { status: 401 });
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return NextResponse.json({ error: "AI downloads need REPLICATE_API_TOKEN in .env.local." }, { status: 503 });
  const { id } = await context.params;
  if (!/^[a-z0-9_-]{8,80}$/i.test(id)) return NextResponse.json({ error: "Invalid prediction ID." }, { status: 400 });
  const owned = await prisma.aiPrediction.findFirst({ where: { id, userId: session.user.id } });
  if (!owned) return NextResponse.json({ error: "Prediction not found for this account." }, { status: 404 });

  try {
    const predictionResponse = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!predictionResponse.ok) return NextResponse.json({ error: "Could not retrieve the completed Replicate result." }, { status: predictionResponse.status });
    const prediction = await predictionResponse.json() as { status?: string; output?: unknown };
    if (prediction.status !== "succeeded") return NextResponse.json({ error: "This video is not ready to download yet." }, { status: 409 });
    const output = prediction.output;
    const outputUrl = typeof output === "string" ? output : Array.isArray(output) ? output.find(isReplicateDelivery) : output && typeof output === "object" && "url" in output ? output.url : null;
    if (!isReplicateDelivery(outputUrl)) return NextResponse.json({ error: "Replicate did not return a supported video download URL." }, { status: 502 });

    const videoResponse = await fetch(outputUrl, { cache: "no-store", signal: AbortSignal.timeout(240_000), redirect: "error" });
    if (!videoResponse.ok || !videoResponse.body) return NextResponse.json({ error: "Replicate could not serve the completed video." }, { status: 502 });
    return new Response(videoResponse.body, {
      status: 200,
      headers: {
        "Content-Type": videoResponse.headers.get("content-type")?.startsWith("video/") ? videoResponse.headers.get("content-type")! : "video/mp4",
        "Content-Disposition": 'attachment; filename="topaz-ai-upscaled.mp4"',
        "Cache-Control": "private, no-store",
        ...(videoResponse.headers.get("content-length") ? { "Content-Length": videoResponse.headers.get("content-length")! } : {}),
      },
    });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Could not download the AI-upscaled video." }, { status: 502 });
  }
}
